process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

jest.mock("../services/emailService", () => ({ sendEmail: jest.fn() }));

const request = require("supertest");
const app = require("../server");
const { sendEmail } = require("../services/emailService");

let adminToken;
let userToken;

beforeAll(async () => {
  // Cria admin (primeiro usuário = admin automático)
  const adminRes = await request(app).post("/api/auth/register").send({
    name: "Admin Salas",
    email: "admin-rooms@voxcred.com.br",
    password: "123456",
  });
  adminToken = adminRes.body.token;

  // Cria usuário comum
  const userRes = await request(app).post("/api/auth/register").send({
    name: "User Salas",
    email: "user-rooms@voxcred.com.br",
    password: "123456",
  });
  userToken = userRes.body.token;
});

beforeEach(() => jest.clearAllMocks());

// ─── Proteção de rotas ────────────────────────────────────────────────────────

describe("Proteção das rotas de salas", () => {
  it("GET /api/rooms retorna 401 sem token", async () => {
    const res = await request(app).get("/api/rooms");
    expect(res.status).toBe(401);
  });

  it("POST /api/rooms retorna 403 para usuário não-admin", async () => {
    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ name: "Sala Proibida" });
    expect(res.status).toBe(403);
  });

  it("PUT /api/rooms/:id retorna 403 para usuário não-admin", async () => {
    const res = await request(app)
      .put("/api/rooms/1")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ name: "Hack" });
    expect(res.status).toBe(403);
  });

  it("DELETE /api/rooms/:id retorna 403 para usuário não-admin", async () => {
    const res = await request(app)
      .delete("/api/rooms/1")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── POST /api/rooms ──────────────────────────────────────────────────────────

describe("POST /api/rooms", () => {
  it("cria sala com defaults (capacidade 4, recursos [TV])", async () => {
    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sala Alpha" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Sala Alpha");
    expect(res.body.capacity).toBe(4);
    expect(Array.isArray(res.body.resources)).toBe(true);
    expect(res.body.resources).toContain("TV");
    expect(res.body.active).toBe(1);
  });

  it("cria sala com capacidade e recursos personalizados", async () => {
    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sala Beta", capacity: 10, resources: ["TV", "Projetor", "Lousa"] });

    expect(res.status).toBe(201);
    expect(res.body.capacity).toBe(10);
    expect(res.body.resources).toEqual(["TV", "Projetor", "Lousa"]);
  });

  it("retorna 400 sem nome", async () => {
    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ capacity: 4 });
    expect(res.status).toBe(400);
  });

  it("retorna 400 com capacidade inválida", async () => {
    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sala Inválida", capacity: 0 });
    expect(res.status).toBe(400);
  });

  it("retorna 400 com recursos não-array", async () => {
    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sala Gamma", resources: "TV" });
    expect(res.status).toBe(400);
  });

  it("retorna 409 para nome duplicado", async () => {
    await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sala Delta" });

    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sala Delta" });

    expect(res.status).toBe(409);
  });
});

// ─── GET /api/rooms ───────────────────────────────────────────────────────────

describe("GET /api/rooms", () => {
  it("lista apenas salas ativas", async () => {
    const res = await request(app)
      .get("/api/rooms")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // resources deve ser array (não string JSON)
    res.body.forEach((room) => {
      expect(Array.isArray(room.resources)).toBe(true);
    });
  });
});

// ─── PUT /api/rooms/:id ───────────────────────────────────────────────────────

describe("PUT /api/rooms/:id", () => {
  let roomId;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sala Editável", capacity: 6 });
    roomId = res.body.id;
  });

  it("edita capacidade da sala", async () => {
    const res = await request(app)
      .put(`/api/rooms/${roomId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ capacity: 8 });

    expect(res.status).toBe(200);
    expect(res.body.capacity).toBe(8);
  });

  it("edita recursos da sala", async () => {
    const res = await request(app)
      .put(`/api/rooms/${roomId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ resources: ["TV", "Ar-condicionado"] });

    expect(res.status).toBe(200);
    expect(res.body.resources).toEqual(["TV", "Ar-condicionado"]);
  });

  it("retorna 404 para sala inexistente", async () => {
    const res = await request(app)
      .put("/api/rooms/99999")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ capacity: 5 });
    expect(res.status).toBe(404);
  });

  it("retorna 409 para nome já existente em outra sala", async () => {
    // Cria uma segunda sala
    await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sala Conflito" });

    const res = await request(app)
      .put(`/api/rooms/${roomId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sala Conflito" });

    expect(res.status).toBe(409);
  });
});

// ─── DELETE /api/rooms/:id ────────────────────────────────────────────────────

describe("DELETE /api/rooms/:id", () => {
  it("desativa sala existente", async () => {
    const createRes = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sala Para Desativar" });

    const roomId = createRes.body.id;

    const res = await request(app)
      .delete(`/api/rooms/${roomId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Sala não deve aparecer na listagem (active = 0)
    const listRes = await request(app)
      .get("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`);
    const found = listRes.body.find((r) => r.id === roomId);
    expect(found).toBeUndefined();
  });

  it("retorna 404 para sala inexistente", async () => {
    const res = await request(app)
      .delete("/api/rooms/99999")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("cancela reservas futuras e notifica usuários por email ao desativar", async () => {
    const db = require("../db");

    // Cria sala
    const createRes = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sala Com Reservas" });
    const roomId = createRes.body.id;

    // Insere reserva futura diretamente no DB
    const futureDate = "2099-12-31";
    const userId = db
      .prepare("SELECT id FROM users WHERE email = 'user-rooms@voxcred.com.br'")
      .get().id;

    db.prepare(
      `INSERT INTO room_bookings (room_id, user_id, date, start_time, end_time, status)
       VALUES (?, ?, ?, '09:00', '10:00', 'confirmed')`
    ).run(roomId, userId, futureDate);

    // Desativa a sala
    const res = await request(app)
      .delete(`/api/rooms/${roomId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.cancelled_bookings).toBe(1);

    await new Promise((r) => setImmediate(r));
    expect(sendEmail).toHaveBeenCalledWith(
      "user-rooms@voxcred.com.br",
      "booking-cancelled",
      expect.any(Object)
    );
  });
});
