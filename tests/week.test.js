process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

jest.mock("../services/emailService", () => ({ sendEmail: jest.fn() }));

const request = require("supertest");
const app = require("../server");

let adminToken;
let userToken;

// Próxima segunda-feira a partir de hoje
function nextMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// Segunda-feira da semana atual
function thisMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  const db = require("../db");

  const adminRes = await request(app).post("/api/auth/register").send({
    name: "Admin Week",
    email: "admin-week@voxcred.com.br",
    password: "123456",
  });
  adminToken = adminRes.body.token;

  const userRes = await request(app).post("/api/auth/register").send({
    name: "User Week",
    email: "user-week@voxcred.com.br",
    password: "123456",
  });
  userToken = userRes.body.token;

  // Usuário com departamento habilitado
  db.prepare("UPDATE users SET department = 'RH', company = 'voxcred' WHERE email = 'user-week@voxcred.com.br'").run();

  // Todos os desks como rotativos com todos os dias úteis
  db.prepare("UPDATE desks SET type = 'rotative', rotative_days = '[\"mon\",\"tue\",\"wed\",\"thu\",\"fri\"]'").run();

  // Capacidade generosa para todos os dias úteis
  const days = ["mon", "tue", "wed", "thu", "fri"];
  for (const day of days) {
    await request(app)
      .put("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ day_of_week: day, capacity: 20 });
  }
});

// ─── GET /api/spots/week ──────────────────────────────────────────────────────

describe("GET /api/spots/week", () => {
  it("retorna 5 dias úteis com start explícito", async () => {
    const monday = nextMonday();
    const res = await request(app)
      .get(`/api/spots/week?start=${monday}`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.start).toBe(monday);
    expect(Array.isArray(res.body.days)).toBe(true);
    expect(res.body.days).toHaveLength(5);
    expect(res.body.week).toBeDefined();
    // Todos os dias começam vazios
    res.body.days.forEach((d) => {
      expect(Array.isArray(res.body.week[d])).toBe(true);
    });
  });

  it("usa segunda-feira atual quando start não é fornecido", async () => {
    const res = await request(app)
      .get("/api/spots/week")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.start).toBe(thisMonday());
    expect(res.body.days).toHaveLength(5);
  });

  it("retorna 400 com formato de start inválido", async () => {
    const res = await request(app)
      .get("/api/spots/week?start=22-06-2026")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);
  });

  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/spots/week");
    expect(res.status).toBe(401);
  });

  it("inclui reservas confirmadas com dados do usuário", async () => {
    const monday = nextMonday();

    // Cria uma reserva para segunda-feira da próxima semana
    await request(app)
      .post("/api/spots/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ dates: [monday], start_time: "09:00", end_time: "18:00" });

    const res = await request(app)
      .get(`/api/spots/week?start=${monday}`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    const mondayBookings = res.body.week[monday];
    expect(mondayBookings).toBeDefined();
    expect(mondayBookings.length).toBeGreaterThanOrEqual(1);

    const booking = mondayBookings.find((b) => b.email === "user-week@voxcred.com.br");
    expect(booking).toBeDefined();
    expect(booking.name).toBe("User Week");
    expect(booking.start_time).toBe("09:00");
    expect(booking.end_time).toBe("18:00");
  });

  it("não inclui reservas canceladas", async () => {
    const db = require("../db");
    const monday = nextMonday();

    // Marca a reserva do user como cancelada diretamente
    db.prepare(
      "UPDATE spot_bookings SET status = 'cancelled' WHERE date = ? AND user_id = (SELECT id FROM users WHERE email = 'user-week@voxcred.com.br')"
    ).run(monday);

    const res = await request(app)
      .get(`/api/spots/week?start=${monday}`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    const mondayBookings = res.body.week[monday];
    const found = mondayBookings.find((b) => b.email === "user-week@voxcred.com.br");
    expect(found).toBeUndefined();
  });
});
