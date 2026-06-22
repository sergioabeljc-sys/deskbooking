process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

jest.mock("../services/emailService", () => ({ sendEmail: jest.fn() }));

const request = require("supertest");
const app = require("../server");

let adminToken;
let userToken;
let roomId;

// Datas relativas a hoje para respeitar limite de 30 dias
function addDays(n) {
  const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const FUTURE_DATE = addDays(5);
const PAST_DATE = "2000-01-01";

beforeAll(async () => {
  const adminRes = await request(app).post("/api/auth/register").send({
    name: "Admin RB",
    email: "admin-rb@voxcred.com.br",
    password: "123456",
  });
  adminToken = adminRes.body.token;

  const userRes = await request(app).post("/api/auth/register").send({
    name: "User RB",
    email: "user-rb@voxcred.com.br",
    password: "123456",
  });
  userToken = userRes.body.token;

  // Cria sala para os testes
  const roomRes = await request(app)
    .post("/api/rooms")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: "Sala Reservas", capacity: 8 });
  roomId = roomRes.body.id;
});

beforeEach(() => jest.clearAllMocks());

// ─── GET /api/rooms/:id/availability ─────────────────────────────────────────

describe("GET /api/rooms/:id/availability", () => {
  it("retorna slots de 30 min entre 08:00 e 18:00", async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomId}/availability?date=${FUTURE_DATE}`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.slots).toBeDefined();
    // 08:00–18:00 = 10h = 20 slots de 30 min
    expect(res.body.slots).toHaveLength(20);
    expect(res.body.slots[0].start).toBe("08:00");
    expect(res.body.slots[19].end).toBe("18:00");
    expect(res.body.slots.every((s) => s.available)).toBe(true);
  });

  it("retorna 400 sem date", async () => {
    const res = await request(app)
      .get(`/api/rooms/${roomId}/availability`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(400);
  });

  it("retorna 404 para sala inexistente", async () => {
    const res = await request(app)
      .get(`/api/rooms/99999/availability?date=${FUTURE_DATE}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/rooms/:id/bookings ─────────────────────────────────────────────

describe("POST /api/rooms/:id/bookings", () => {
  it("cria reserva com horário válido", async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: FUTURE_DATE, start_time: "09:00", end_time: "10:00" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.room_id).toBe(roomId);
  });

  it("retorna 400 sem campos obrigatórios", async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: FUTURE_DATE });
    expect(res.status).toBe(400);
  });

  it("retorna 400 com horário fora de 08:00–18:00", async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: FUTURE_DATE, start_time: "07:00", end_time: "08:00" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/08:00/);
  });

  it("retorna 400 com duração menor que 30 minutos", async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: FUTURE_DATE, start_time: "11:00", end_time: "11:15" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/30 minutos/);
  });

  it("retorna 400 para data passada", async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: PAST_DATE, start_time: "09:00", end_time: "10:00" });
    expect(res.status).toBe(400);
  });

  it("retorna 404 para sala inexistente", async () => {
    const res = await request(app)
      .post(`/api/rooms/99999/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: FUTURE_DATE, start_time: "14:00", end_time: "15:00" });
    expect(res.status).toBe(404);
  });
});

// ─── Detecção de conflito ─────────────────────────────────────────────────────

describe("Detecção de conflito de reserva", () => {
  const CONFLICT_DATE = addDays(6);

  it("retorna 409 e sugere próximo slot ao conflitar", async () => {
    // Primeira reserva: 10:00–11:00
    await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: CONFLICT_DATE, start_time: "10:00", end_time: "11:00" });

    // Segunda reserva no mesmo período → conflito
    const res = await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: CONFLICT_DATE, start_time: "10:30", end_time: "11:30" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/conflito/i);
    expect(res.body.next_available).toBeDefined();
    expect(res.body.next_available.start).toBe("11:00");
  });

  it("permite reservas em horários adjacentes (sem sobreposição)", async () => {
    const ADJACENT_DATE = addDays(7);

    await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: ADJACENT_DATE, start_time: "09:00", end_time: "10:00" });

    const res = await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: ADJACENT_DATE, start_time: "10:00", end_time: "11:00" });

    expect(res.status).toBe(201);
  });

  it("slot fica como ocupado na disponibilidade após reserva", async () => {
    const CHECK_DATE = addDays(8);

    await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: CHECK_DATE, start_time: "13:00", end_time: "14:00" });

    const avail = await request(app)
      .get(`/api/rooms/${roomId}/availability?date=${CHECK_DATE}`)
      .set("Authorization", `Bearer ${userToken}`);

    const slot13 = avail.body.slots.find((s) => s.start === "13:00");
    const slot1330 = avail.body.slots.find((s) => s.start === "13:30");
    expect(slot13.available).toBe(false);
    expect(slot1330.available).toBe(false);
  });

  it("admin vê nome do reservante na disponibilidade", async () => {
    const ADMIN_DATE = addDays(9);

    await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ date: ADMIN_DATE, start_time: "15:00", end_time: "16:00" });

    const avail = await request(app)
      .get(`/api/rooms/${roomId}/availability?date=${ADMIN_DATE}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const slot15 = avail.body.slots.find((s) => s.start === "15:00");
    expect(slot15.available).toBe(false);
    expect(slot15.reserved_by).toBeDefined();
    expect(slot15.reserved_by).toBe("User RB");
  });

  it("usuário comum não vê nome do reservante", async () => {
    const USER_DATE = addDays(10);

    await request(app)
      .post(`/api/rooms/${roomId}/bookings`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: USER_DATE, start_time: "10:00", end_time: "11:00" });

    const avail = await request(app)
      .get(`/api/rooms/${roomId}/availability?date=${USER_DATE}`)
      .set("Authorization", `Bearer ${userToken}`);

    const slot10 = avail.body.slots.find((s) => s.start === "10:00");
    expect(slot10.available).toBe(false);
    expect(slot10.reserved_by).toBeUndefined();
  });
});
