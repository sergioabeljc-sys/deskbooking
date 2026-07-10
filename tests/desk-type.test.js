process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

jest.mock("../services/emailService", () => ({ sendEmail: jest.fn() }));

const request = require("supertest");
const app = require("../server");

let adminToken;
let ownerToken;
let ownerId;
let deskId;

beforeAll(async () => {
  const adminRes = await request(app).post("/api/auth/register").send({
    name: "Admin DeskType",
    email: "admin-desktype@voxcred.com.br",
    password: "123456",
  });
  adminToken = adminRes.body.token;

  const ownerRes = await request(app).post("/api/auth/register").send({
    name: "Owner DeskType",
    email: "owner-desktype@voxcred.com.br",
    password: "123456",
  });
  ownerToken = ownerRes.body.token;
  ownerId = ownerRes.body.user?.id;

  // Descobre ID do owner pelo DB
  const db = require("../db");
  ownerId = db.prepare("SELECT id FROM users WHERE email = 'owner-desktype@voxcred.com.br'").get().id;

  // Cria mesa
  const deskRes = await request(app)
    .post("/api/desks")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: "Mesa Tipo Test", pos_x: 5, pos_y: 5 });
  deskId = deskRes.body.id;
});

// ─── PUT /api/desks/:id/type ──────────────────────────────────────────────────

describe("PUT /api/desks/:id/type", () => {
  it("admin define mesa como fixa com owner_id", async () => {
    const res = await request(app)
      .put(`/api/desks/${deskId}/type`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "fixed", owner_id: ownerId });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("fixed");
    expect(res.body.owner_id).toBe(ownerId);
  });

  it("admin define mesa como rotativa", async () => {
    const res = await request(app)
      .put(`/api/desks/${deskId}/type`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "rotative" });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("rotative");
  });

  it("retorna 400 sem owner_id para tipo fixed", async () => {
    const res = await request(app)
      .put(`/api/desks/${deskId}/type`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "fixed" });
    expect(res.status).toBe(400);
  });

  it("retorna 400 com tipo inválido", async () => {
    const res = await request(app)
      .put(`/api/desks/${deskId}/type`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "flex" });
    expect(res.status).toBe(400);
  });

  it("retorna 403 para não-admin", async () => {
    const res = await request(app)
      .put(`/api/desks/${deskId}/type`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ type: "rotative" });
    expect(res.status).toBe(403);
  });

  it("retorna 404 para mesa inexistente", async () => {
    const res = await request(app)
      .put("/api/desks/99999/type")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "rotative" });
    expect(res.status).toBe(404);
  });
});

// ─── PUT /api/desks/:id/rotative-days ────────────────────────────────────────

describe("PUT /api/desks/:id/rotative-days", () => {
  let rotativeDeskId;

  beforeAll(async () => {
    // Cria mesa rotativa com owner para testes
    const deskRes = await request(app)
      .post("/api/desks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Mesa Rotativa Owner", pos_x: 6, pos_y: 5 });
    rotativeDeskId = deskRes.body.id;

    // Define owner
    await request(app)
      .put(`/api/desks/${rotativeDeskId}/type`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "fixed", owner_id: ownerId });

    // Volta para rotative (owner_id fica)
    await request(app)
      .put(`/api/desks/${rotativeDeskId}/type`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "rotative" });

    // Associa owner diretamente via DB para teste de requireOwnerOrAdmin
    const db = require("../db");
    db.prepare("UPDATE desks SET owner_id = ? WHERE id = ?").run(ownerId, rotativeDeskId);
  });

  it("dono configura dias da semana", async () => {
    const res = await request(app)
      .put(`/api/desks/${rotativeDeskId}/rotative-days`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ rotative_days: ["mon", "wed", "fri"] });

    expect(res.status).toBe(200);
    expect(res.body.rotative_days_next).toEqual(["mon", "wed", "fri"]);
  });

  it("admin pode configurar dias", async () => {
    const res = await request(app)
      .put(`/api/desks/${rotativeDeskId}/rotative-days`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rotative_days: ["mon", "tue", "wed", "thu", "fri"] });

    expect(res.status).toBe(200);
    expect(res.body.rotative_days_next).toHaveLength(5);
  });

  it("retorna 400 com dias inválidos", async () => {
    const res = await request(app)
      .put(`/api/desks/${rotativeDeskId}/rotative-days`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rotative_days: ["mon", "sat", "sun"] }); // sat e sun são inválidos
    expect(res.status).toBe(400);
  });

  it("retorna 400 para mesa não-rotativa", async () => {
    const fixedRes = await request(app)
      .post("/api/desks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Mesa Fixa ND", pos_x: 7, pos_y: 5 });

    await request(app)
      .put(`/api/desks/${fixedRes.body.id}/type`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "fixed", owner_id: ownerId });

    const res = await request(app)
      .put(`/api/desks/${fixedRes.body.id}/rotative-days`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rotative_days: ["mon"] });
    expect(res.status).toBe(400);
  });

  it("retorna 403 para usuário sem vínculo", async () => {
    const otherRes = await request(app).post("/api/auth/register").send({
      name: "Other DeskType",
      email: "other-desktype@voxcred.com.br",
      password: "123456",
    });

    const res = await request(app)
      .put(`/api/desks/${rotativeDeskId}/rotative-days`)
      .set("Authorization", `Bearer ${otherRes.body.token}`)
      .send({ rotative_days: ["mon"] });
    expect(res.status).toBe(403);
  });

  it("remove duplicatas e ordena dias", async () => {
    const res = await request(app)
      .put(`/api/desks/${rotativeDeskId}/rotative-days`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rotative_days: ["fri", "mon", "mon", "wed"] });

    expect(res.status).toBe(200);
    expect(res.body.rotative_days_next).toEqual(["mon", "wed", "fri"]);
  });
});

// ─── PUT /api/admin/spot-capacity ────────────────────────────────────────────

describe("PUT /api/admin/spot-capacity", () => {
  it("define capacidade por dia_of_week", async () => {
    const res = await request(app)
      .put("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ day_of_week: "mon", capacity: 10 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.day_of_week).toBe("mon");
    expect(res.body.capacity).toBe(10);
  });

  it("define capacidade por data específica", async () => {
    const res = await request(app)
      .put("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ specific_date: "2099-12-25", capacity: 0 });

    expect(res.status).toBe(200);
    expect(res.body.specific_date).toBe("2099-12-25");
  });

  it("atualiza capacidade existente (upsert)", async () => {
    await request(app)
      .put("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ day_of_week: "tue", capacity: 5 });

    const res = await request(app)
      .put("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ day_of_week: "tue", capacity: 15 });

    expect(res.status).toBe(200);
    expect(res.body.capacity).toBe(15);
  });

  it("retorna 400 sem day_of_week nem specific_date", async () => {
    const res = await request(app)
      .put("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ capacity: 5 });
    expect(res.status).toBe(400);
  });

  it("retorna 400 com day_of_week inválido", async () => {
    const res = await request(app)
      .put("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ day_of_week: "monday", capacity: 5 });
    expect(res.status).toBe(400);
  });

  it("retorna 403 para não-admin", async () => {
    const res = await request(app)
      .put("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ day_of_week: "mon", capacity: 5 });
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/spot-capacity lista capacidades", async () => {
    const res = await request(app)
      .get("/api/admin/spot-capacity")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
