process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

jest.mock("../services/emailService", () => ({ sendEmail: jest.fn() }));

const request = require("supertest");
const app = require("../server");

let adminToken;
const userTokens = [];
const TEST_CAPACITY = 3; // capacidade baixa para testar limite rapidamente

// Próximo dia útil a partir de hoje + offset
function futureWeekday(offsetDays = 1) {
  const d = new Date();
  let count = 0;
  while (count < offsetDays) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
  }
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  const db = require("../db");

  // Admin
  const adminRes = await request(app).post("/api/auth/register").send({
    name: "Admin Cap",
    email: "admin-cap@voxcred.com.br",
    password: "123456",
  });
  adminToken = adminRes.body.token;

  // Configura capacidade baixa para o teste (3 vagas)
  const days = ["mon", "tue", "wed", "thu", "fri"];
  for (const day of days) {
    await request(app)
      .put("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ day_of_week: day, capacity: TEST_CAPACITY });
  }

  // Cria TEST_CAPACITY + 2 usuários para testar estouro
  for (let i = 0; i < TEST_CAPACITY + 2; i++) {
    const res = await request(app).post("/api/auth/register").send({
      name: `Cap User ${i}`,
      email: `cap-user-${i}@voxcred.com.br`,
      password: "123456",
    });
    db.prepare("UPDATE users SET department = 'RH' WHERE email = ?").run(
      `cap-user-${i}@voxcred.com.br`
    );
    userTokens.push(res.body.token);
  }

  // Garante que todos os desks têm dias rotativos configurados
  db.prepare(
    "UPDATE desks SET type = 'rotative', rotative_days = '[\"mon\",\"tue\",\"wed\",\"thu\",\"fri\"]'"
  ).run();
});

// ─── Capacidade máxima (limite de vagas por dia) ──────────────────────────────

describe("Limite de capacidade diária", () => {
  const TARGET_DATE = futureWeekday(10); // dia livre, sem colisão com outros testes

  it(`preenche até o limite (${TEST_CAPACITY} vagas) com sucesso`, async () => {
    for (let i = 0; i < TEST_CAPACITY; i++) {
      const res = await request(app)
        .post("/api/spots/bookings")
        .set("Authorization", `Bearer ${userTokens[i]}`)
        .send({ dates: [TARGET_DATE], start_time: "09:00", end_time: "18:00" });

      expect(res.status).toBe(201);
      expect(res.body.created[0].status).toBe("confirmed");
    }
  });

  it("rejeita a reserva quando o dia está lotado", async () => {
    // O usuário TEST_CAPACITY (índice após os que já reservaram) tenta reservar
    const res = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userTokens[TEST_CAPACITY]}`)
      .send({ dates: [TARGET_DATE], start_time: "09:00", end_time: "18:00" });

    expect(res.status).toBe(409);
    expect(res.body.errors[0].error).toMatch(/capacidade|vaga|lotad|esgotad/i);
  });

  it("disponibilidade retorna 0 vagas após lotação", async () => {
    const res = await request(app)
      .get(`/api/spots/availability?date=${TARGET_DATE}`)
      .set("Authorization", `Bearer ${userTokens[0]}`);

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(0);
  });

  it("disponibilidade reabre após cancelamento", async () => {
    // Cancela uma das reservas (usando admin para ignorar regra 24h)
    const db = require("../db");
    const booking = db
      .prepare(
        "SELECT id FROM spot_bookings WHERE date = ? AND status = 'confirmed' LIMIT 1"
      )
      .get(TARGET_DATE);

    await request(app)
      .delete(`/api/spots/bookings/${booking.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const res = await request(app)
      .get(`/api/spots/availability?date=${TARGET_DATE}`)
      .set("Authorization", `Bearer ${userTokens[0]}`);

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(1);
  });

  it("admin consegue ajustar capacidade para 0 (dia bloqueado)", async () => {
    const res = await request(app)
      .put("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ specific_date: futureWeekday(20), capacity: 0 });

    expect(res.status).toBe(200);
    expect(res.body.capacity).toBe(0);
  });

  it("rejeita reserva em dia com capacidade 0", async () => {
    const blockedDate = futureWeekday(20);
    const res = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userTokens[0]}`)
      .send({ dates: [blockedDate], start_time: "09:00", end_time: "18:00" });

    expect(res.status).toBe(409);
  });
});

// ─── GET /api/spots/my-bookings ───────────────────────────────────────────────

describe("GET /api/spots/my-bookings", () => {
  const BOOK_DATE = futureWeekday(11);

  beforeAll(async () => {
    // Garante que existe ao menos uma reserva para o usuário 0
    await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userTokens[0]}`)
      .send({ dates: [BOOK_DATE], start_time: "08:00", end_time: "17:00" });
  });

  it("retorna lista de reservas do usuário logado", async () => {
    const res = await request(app)
      .get("/api/spots/my-bookings")
      .set("Authorization", `Bearer ${userTokens[0]}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("cada item contém id, date, start_time, end_time", async () => {
    const res = await request(app)
      .get("/api/spots/my-bookings")
      .set("Authorization", `Bearer ${userTokens[0]}`);

    const booking = res.body[0];
    expect(booking).toHaveProperty("id");
    expect(booking).toHaveProperty("date");
    expect(booking).toHaveProperty("start_time");
    expect(booking).toHaveProperty("end_time");
  });

  it("não retorna reservas de outros usuários", async () => {
    const res = await request(app)
      .get("/api/spots/my-bookings")
      .set("Authorization", `Bearer ${userTokens[1]}`);

    // O userTokens[1] não fez reservas neste describe — pode ter do describe anterior
    // O importante é que nenhum item pertença ao usuário 0
    const db = require("../db");
    const user0 = db
      .prepare("SELECT id FROM users WHERE email = 'cap-user-0@voxcred.com.br'")
      .get();
    const user1 = db
      .prepare("SELECT id FROM users WHERE email = 'cap-user-1@voxcred.com.br'")
      .get();

    const bookingsOfUser0InUser1Response = res.body.filter(
      (b) => b.user_id === user0.id
    );
    expect(bookingsOfUser0InUser1Response.length).toBe(0);
  });

  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/spots/my-bookings");
    expect(res.status).toBe(401);
  });

  it("filtra por intervalo de datas quando start e end são passados", async () => {
    const res = await request(app)
      .get(`/api/spots/my-bookings?start=${BOOK_DATE}&end=${BOOK_DATE}`)
      .set("Authorization", `Bearer ${userTokens[0]}`);

    expect(res.status).toBe(200);
    // Todos os resultados devem estar dentro do intervalo
    res.body.forEach((b) => {
      expect(b.date >= BOOK_DATE && b.date <= BOOK_DATE).toBe(true);
    });
  });
});

// ─── GET /api/audit ───────────────────────────────────────────────────────────

describe("GET /api/audit", () => {
  it("admin obtém lista de entradas do audit log", async () => {
    const res = await request(app)
      .get("/api/audit")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe("number");
    expect(typeof res.body.page).toBe("number");
    expect(typeof res.body.pages).toBe("number");
  });

  it("cada entrada tem campos essenciais", async () => {
    const res = await request(app)
      .get("/api/audit")
      .set("Authorization", `Bearer ${adminToken}`);

    if (res.body.data.length > 0) {
      const entry = res.body.data[0];
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("action");
      expect(entry).toHaveProperty("created_at");
    }
  });

  it("suporta paginação via ?page e ?limit", async () => {
    const res = await request(app)
      .get("/api/audit?page=1&limit=5")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/audit");
    expect(res.status).toBe(401);
  });

  it("retorna 403 para usuário não-admin", async () => {
    const res = await request(app)
      .get("/api/audit")
      .set("Authorization", `Bearer ${userTokens[0]}`);

    expect(res.status).toBe(403);
  });

  it("ações de reserva de vaga são registradas no audit", async () => {
    const res = await request(app)
      .get("/api/audit")
      .set("Authorization", `Bearer ${adminToken}`);

    const spotActions = res.body.data.filter((e) =>
      e.action.includes("spot")
    );
    expect(spotActions.length).toBeGreaterThan(0);
  });
});
