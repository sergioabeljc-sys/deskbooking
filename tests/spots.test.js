process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

jest.mock("../services/emailService", () => ({ sendEmail: jest.fn() }));

const request = require("supertest");
const app = require("../server");
const { sendEmail } = require("../services/emailService");

let adminToken;
let userToken;
let otherUserToken;

// Retorna o N-ésimo dia útil (seg-sex) a partir de hoje
function nextWeekday(n) {
  const d = new Date();
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  const db = require("../db");

  const adminRes = await request(app).post("/api/auth/register").send({
    name: "Admin Spots",
    email: "admin-spots@voxcred.com.br",
    password: "123456",
  });
  adminToken = adminRes.body.token;

  const userRes = await request(app).post("/api/auth/register").send({
    name: "User Spots",
    email: "user-spots@voxcred.com.br",
    password: "123456",
  });
  userToken = userRes.body.token;

  const otherRes = await request(app).post("/api/auth/register").send({
    name: "Other Spots",
    email: "other-spots@voxcred.com.br",
    password: "123456",
  });
  otherUserToken = otherRes.body.token;

  // Atribui departamento habilitado ao user e other
  db.prepare("UPDATE users SET department = 'RH' WHERE email = 'user-spots@voxcred.com.br'").run();
  db.prepare("UPDATE users SET department = 'RH' WHERE email = 'other-spots@voxcred.com.br'").run();

  // Configura todos os desks como rotativos com todos os dias úteis
  db.prepare("UPDATE desks SET type = 'rotative', rotative_days = '[\"mon\",\"tue\",\"wed\",\"thu\",\"fri\"]'").run();

  // Define capacidade admin generosa para todos os dias úteis
  const days = ["mon", "tue", "wed", "thu", "fri"];
  for (const day of days) {
    await request(app)
      .put("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ day_of_week: day, capacity: 20 });
  }
});

beforeEach(() => jest.clearAllMocks());

// ─── GET /api/spots/availability ─────────────────────────────────────────────

describe("GET /api/spots/availability", () => {
  it("retorna disponibilidade para um dia útil futuro", async () => {
    const res = await request(app)
      .get(`/api/spots/availability?date=${nextWeekday(1)}`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.date).toBeDefined();
    expect(typeof res.body.available).toBe("number");
    expect(res.body.available).toBeGreaterThan(0);
  });

  it("retorna 400 sem date", async () => {
    const res = await request(app)
      .get("/api/spots/availability")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);
  });

  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .get(`/api/spots/availability?date=${nextWeekday(1)}`);
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/spots/bookings ─────────────────────────────────────────────────

describe("POST /api/spots/bookings", () => {
  it("reserva vaga para dia útil válido", async () => {
    const res = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ dates: [nextWeekday(1)], start_time: "09:00", end_time: "18:00" });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.created)).toBe(true);
    expect(res.body.created.length).toBe(1);
    expect(res.body.created[0].status).toBe("confirmed");
  });

  it("reserva múltiplas datas de uma vez", async () => {
    const res = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${otherUserToken}`)
      .send({
        dates: [nextWeekday(2), nextWeekday(3)],
        start_time: "08:00",
        end_time: "12:00",
      });

    expect(res.status).toBe(201);
    expect(res.body.created.length).toBe(2);
  });

  it("retorna 400 sem dates", async () => {
    const res = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ start_time: "09:00", end_time: "10:00" });
    expect(res.status).toBe(400);
  });

  it("retorna 400 com horário fora de 08:00–18:00", async () => {
    const res = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ dates: [nextWeekday(4)], start_time: "07:30", end_time: "09:00" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/08:00/);
  });

  it("retorna 400 com duração menor que 30 min", async () => {
    const res = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ dates: [nextWeekday(4)], start_time: "10:00", end_time: "10:15" });
    expect(res.status).toBe(400);
  });

  it("retorna 403 para usuário sem departamento habilitado", async () => {
    const nodeptRes = await request(app).post("/api/auth/register").send({
      name: "NoDept Spots",
      email: "nodept-spots@voxcred.com.br",
      password: "123456",
    });
    const res = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${nodeptRes.body.token}`)
      .send({ dates: [nextWeekday(4)], start_time: "09:00", end_time: "10:00" });
    expect(res.status).toBe(403);
  });

  it("retorna 409 para reserva duplicada (mesmo user + data)", async () => {
    const dupDate = nextWeekday(5);

    // Primeira reserva (user já tem booking para weekday(1), mas não para weekday(5))
    await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ dates: [dupDate], start_time: "09:00", end_time: "10:00" });

    // Segunda reserva no mesmo dia pelo mesmo user
    const res = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ dates: [dupDate], start_time: "14:00", end_time: "15:00" });

    expect(res.status).toBe(409);
    expect(res.body.errors[0].error).toMatch(/já tem/i);
  });
});

// ─── DELETE /api/spots/bookings/:id ──────────────────────────────────────────

describe("DELETE /api/spots/bookings/:id", () => {
  it("usuário cancela a própria reserva com 24h+", async () => {
    const bookRes = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${otherUserToken}`)
      .send({ dates: [nextWeekday(6)], start_time: "09:00", end_time: "10:00" });

    const bookingId = bookRes.body.created[0].id;

    const res = await request(app)
      .delete(`/api/spots/bookings/${bookingId}`)
      .set("Authorization", `Bearer ${otherUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("retorna 403 ao cancelar reserva de outro usuário", async () => {
    const bookRes = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ dates: [nextWeekday(7)], start_time: "09:00", end_time: "10:00" });

    const bookingId = bookRes.body.created[0].id;

    const res = await request(app)
      .delete(`/api/spots/bookings/${bookingId}`)
      .set("Authorization", `Bearer ${otherUserToken}`);

    expect(res.status).toBe(403);
  });

  it("retorna 404 para reserva inexistente", async () => {
    const res = await request(app)
      .delete("/api/spots/bookings/99999")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("admin cancela reserva de outro usuário e envia email", async () => {
    const bookRes = await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ dates: [nextWeekday(8)], start_time: "09:00", end_time: "10:00" });

    const bookingId = bookRes.body.created[0].id;

    const res = await request(app)
      .delete(`/api/spots/bookings/${bookingId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(sendEmail).toHaveBeenCalledWith(
      "user-spots@voxcred.com.br",
      "booking-cancelled",
      expect.any(Object)
    );
  });

  it("usuário não cancela com menos de 24h de antecedência", async () => {
    const db = require("../db");
    const userId = db.prepare("SELECT id FROM users WHERE email = 'user-spots@voxcred.com.br'").get().id;
    const today = new Date().toISOString().slice(0, 10);

    const ins = db.prepare(
      `INSERT INTO spot_bookings (user_id, date, start_time, end_time, status)
       VALUES (?, ?, '08:00', '09:00', 'confirmed')`
    ).run(userId, today);

    const res = await request(app)
      .delete(`/api/spots/bookings/${ins.lastInsertRowid}`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/24h/);
  });
});
