process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

const request = require("supertest");
const app = require("../server");

describe("Auth", () => {
  describe("POST /api/auth/register", () => {
    it("registra o primeiro usuario como admin", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Admin",
        email: "admin@voxcred.com.br",
        password: "123456",
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.is_admin).toBe(1);
    });

    it("registra usuario comum apos o primeiro", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Usuario",
        email: "user@voxcred.com.br",
        password: "123456",
      });
      expect(res.status).toBe(200);
      expect(res.body.user.is_admin).toBe(0);
    });

    it("rejeita email duplicado", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Outro",
        email: "admin@voxcred.com.br",
        password: "123456",
      });
      expect(res.status).toBe(409);
    });

    it("rejeita senha curta", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Teste",
        email: "novo@voxcred.com.br",
        password: "123",
      });
      expect(res.status).toBe(400);
    });

    it("rejeita campos faltando", async () => {
      const res = await request(app).post("/api/auth/register").send({
        email: "incompleto@voxcred.com.br",
      });
      expect(res.status).toBe(400);
    });

    it("rejeita e-mail de domínio não permitido", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Externo",
        email: "externo@gmail.com",
        password: "123456",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    it("autentica com credenciais corretas", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "admin@voxcred.com.br",
        password: "123456",
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it("rejeita senha incorreta", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "admin@voxcred.com.br",
        password: "errada",
      });
      expect(res.status).toBe(401);
    });

    it("rejeita email inexistente", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "naoexiste@voxcred.com.br",
        password: "123456",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("emite novo token com refresh token valido", async () => {
      const login = await request(app).post("/api/auth/login").send({
        email: "admin@voxcred.com.br",
        password: "123456",
      });
      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: login.body.refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it("rejeita refresh token invalido", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: "token-invalido" });
      expect(res.status).toBe(401);
    });

    it("rejeita uso duplo do mesmo refresh token", async () => {
      const login = await request(app).post("/api/auth/login").send({
        email: "admin@voxcred.com.br",
        password: "123456",
      });
      const rt = login.body.refreshToken;
      await request(app).post("/api/auth/refresh").send({ refreshToken: rt });
      const res = await request(app).post("/api/auth/refresh").send({ refreshToken: rt });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("revoga o refresh token no logout", async () => {
      const login = await request(app).post("/api/auth/login").send({
        email: "admin@voxcred.com.br",
        password: "123456",
      });
      const rt = login.body.refreshToken;
      await request(app).post("/api/auth/logout").send({ refreshToken: rt });
      const res = await request(app).post("/api/auth/refresh").send({ refreshToken: rt });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/auth/me", () => {
    it("retorna dados do usuario autenticado", async () => {
      const login = await request(app).post("/api/auth/login").send({
        email: "admin@voxcred.com.br",
        password: "123456",
      });
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${login.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe("admin@voxcred.com.br");
    });

    it("rejeita requisicao sem token", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });
  });
});
