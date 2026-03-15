process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

const request = require("supertest");
const app = require("../server");

let adminToken, userToken;

beforeAll(async () => {
  const admin = await request(app).post("/api/auth/register").send({
    name: "Admin",
    email: "admin@desks.com",
    password: "123456",
  });
  adminToken = admin.body.token;

  const user = await request(app).post("/api/auth/register").send({
    name: "Usuario",
    email: "user@desks.com",
    password: "123456",
  });
  userToken = user.body.token;
});

describe("Desks", () => {
  describe("GET /api/desks", () => {
    it("retorna lista de mesas para usuario autenticado", async () => {
      const res = await request(app)
        .get("/api/desks")
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(12); // seed default
    });

    it("rejeita sem autenticacao", async () => {
      const res = await request(app).get("/api/desks");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/desks", () => {
    it("admin cria nova mesa", async () => {
      const res = await request(app)
        .post("/api/desks")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Mesa 13", pos_x: 5, pos_y: 1 });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Mesa 13");
    });

    it("rejeita posicao duplicada", async () => {
      const res = await request(app)
        .post("/api/desks")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Duplicada", pos_x: 1, pos_y: 1 });
      expect(res.status).toBe(409);
    });

    it("usuario comum nao pode criar mesa", async () => {
      const res = await request(app)
        .post("/api/desks")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ name: "Mesa X", pos_x: 9, pos_y: 9 });
      expect(res.status).toBe(403);
    });
  });

  describe("PUT /api/desks/:id", () => {
    it("admin desativa uma mesa", async () => {
      const desks = await request(app)
        .get("/api/desks")
        .set("Authorization", `Bearer ${adminToken}`);
      const desk = desks.body[0];

      const res = await request(app)
        .put(`/api/desks/${desk.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ is_active: 0 });
      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(0);
    });
  });

  describe("DELETE /api/desks/:id", () => {
    it("admin exclui uma mesa", async () => {
      const created = await request(app)
        .post("/api/desks")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Para Excluir", pos_x: 9, pos_y: 9 });

      const res = await request(app)
        .delete(`/api/desks/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("usuario comum nao pode excluir mesa", async () => {
      const desks = await request(app)
        .get("/api/desks")
        .set("Authorization", `Bearer ${adminToken}`);

      const res = await request(app)
        .delete(`/api/desks/${desks.body[1].id}`)
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });
});
