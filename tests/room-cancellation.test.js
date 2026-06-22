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
let roomId;

function addDays(n) {
  const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  const adminRes = await request(app).post("/api/auth/register").send({
    name: "Admin Cancel",
    email: "admin-cancel@voxcred.com.br",
    password: "123456",
  });
  adminToken = adminRes.body.token;

  const userRes = await request(app).post("/api/auth/register").send({
    name: "User Cancel",
    email: "user-cancel@voxcred.com.br",
    password: "123456",
  });
  userToken = userRes.body.token;

  const otherRes = await request(app).post("/api/auth/register").send({
    name: "Other Cancel",
    email: "other-cancel@voxcred.com.br",
    password: "123456",
  });
  otherUserToken = otherRes.body.token;

  const roomRes = await request(app)
    .post("/api/rooms")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: "Sala Cancelamento" });
  roomId = roomRes.body.id;
});

beforeEach(() => jest.clearAllMocks());

// Helper: cria reserva para o usuário com +N dias de antecedência
async function createBooking(token, daysAhead = 5, start = "10:00", end = "11:00") {
  const date = addDays(daysAhead);
  const res = await request(app)
    .post(`/api/rooms/${roomId}/bookings`)
    .set("Authorization", `Bearer ${token}`)
    .send({ date, start_time: start, end_time: end });
  return res.body;
}

// ─── Cancelamento pelo próprio usuário ───────────────────────────────────────

describe("DELETE /api/rooms/bookings/:id — usuário comum", () => {
  it("cancela a própria reserva com 24h+ de antecedência", async () => {
    const booking = await createBooking(userToken, 5);
    expect(booking.id).toBeDefined();

    const res = await request(app)
      .delete(`/api/rooms/bookings/${booking.id}`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("retorna 403 ao tentar cancelar reserva de outro usuário", async () => {
    const booking = await createBooking(userToken, 5, "11:00", "12:00");

    const res = await request(app)
      .delete(`/api/rooms/bookings/${booking.id}`)
      .set("Authorization", `Bearer ${otherUserToken}`);

    expect(res.status).toBe(403);
  });

  it("retorna 404 para reserva inexistente", async () => {
    const res = await request(app)
      .delete("/api/rooms/bookings/99999")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("retorna 409 para reserva já cancelada", async () => {
    const booking = await createBooking(userToken, 5, "12:00", "13:00");

    // Primeiro cancelamento
    await request(app)
      .delete(`/api/rooms/bookings/${booking.id}`)
      .set("Authorization", `Bearer ${userToken}`);

    // Segundo cancelamento
    const res = await request(app)
      .delete(`/api/rooms/bookings/${booking.id}`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(409);
  });
});

// ─── Cancelamento pelo admin ──────────────────────────────────────────────────

describe("DELETE /api/rooms/bookings/:id — admin", () => {
  it("admin cancela reserva de outro usuário e notifica por email", async () => {
    const booking = await createBooking(userToken, 5, "14:00", "15:00");

    const res = await request(app)
      .delete(`/api/rooms/bookings/${booking.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    await new Promise((r) => setImmediate(r));
    expect(sendEmail).toHaveBeenCalledWith(
      "user-cancel@voxcred.com.br",
      "booking-cancelled",
      expect.any(Object)
    );
  });

  it("admin cancela reserva sem restrição de prazo (inserida diretamente no DB)", async () => {
    const db = require("../db");

    // Reserva "de hoje" — dentro de 24h — inserida diretamente para simular
    const today = new Date().toISOString().slice(0, 10);
    const userId = db
      .prepare("SELECT id FROM users WHERE email = 'user-cancel@voxcred.com.br'")
      .get().id;

    const ins = db
      .prepare(
        `INSERT INTO room_bookings (room_id, user_id, date, start_time, end_time, status)
         VALUES (?, ?, ?, '08:00', '09:00', 'confirmed')`
      )
      .run(roomId, userId, today);

    const res = await request(app)
      .delete(`/api/rooms/bookings/${ins.lastInsertRowid}`)
      .set("Authorization", `Bearer ${adminToken}`);

    // Admin pode cancelar mesmo dentro de 24h
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("usuário não pode cancelar reserva com menos de 24h de antecedência", async () => {
    const db = require("../db");

    const today = new Date().toISOString().slice(0, 10);
    const userId = db
      .prepare("SELECT id FROM users WHERE email = 'user-cancel@voxcred.com.br'")
      .get().id;

    const ins = db
      .prepare(
        `INSERT INTO room_bookings (room_id, user_id, date, start_time, end_time, status)
         VALUES (?, ?, ?, '08:00', '09:00', 'confirmed')`
      )
      .run(roomId, userId, today);

    const res = await request(app)
      .delete(`/api/rooms/bookings/${ins.lastInsertRowid}`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/24h/);
  });
});
