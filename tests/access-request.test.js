process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

// Mock emailService para não disparar e-mails reais nos testes
jest.mock("../services/emailService", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require("supertest");
const app = require("../server");
const { sendEmail } = require("../services/emailService");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/auth/request-access", () => {
  it("aceita e-mail @tendaatacado.com.br e retorna ok", async () => {
    const res = await request(app)
      .post("/api/auth/request-access")
      .send({ email: "joao@tendaatacado.com.br" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("aceita e-mail @voxcred.com.br e retorna ok", async () => {
    const res = await request(app)
      .post("/api/auth/request-access")
      .send({ email: "maria@voxcred.com.br" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("rejeita e-mail de domínio não autorizado com erro genérico", async () => {
    const res = await request(app)
      .post("/api/auth/request-access")
      .send({ email: "externo@gmail.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("rejeita e-mail inválido", async () => {
    const res = await request(app)
      .post("/api/auth/request-access")
      .send({ email: "nao-e-email" });
    expect(res.status).toBe(400);
  });

  it("rejeita body sem e-mail", async () => {
    const res = await request(app)
      .post("/api/auth/request-access")
      .send({});
    expect(res.status).toBe(400);
  });

  it("pedido duplicado (pending) retorna 200 sem duplicar registro", async () => {
    await request(app)
      .post("/api/auth/request-access")
      .send({ email: "dup@tendaatacado.com.br" });

    const res = await request(app)
      .post("/api/auth/request-access")
      .send({ email: "dup@tendaatacado.com.br" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("resposta não revela se e-mail já existe ou não", async () => {
    const res1 = await request(app)
      .post("/api/auth/request-access")
      .send({ email: "novo@tendaatacado.com.br" });
    const res2 = await request(app)
      .post("/api/auth/request-access")
      .send({ email: "novo@tendaatacado.com.br" });

    expect(res1.body).toEqual(res2.body);
  });

  it("dispara notificação de e-mail para admins", async () => {
    // Em ambiente de teste o banco está vazio (sem admins ainda),
    // mas o sendEmail deve ser chamado se houver admins.
    // Registrar um admin primeiro para testar o disparo:
    await request(app).post("/api/auth/register").send({
      name: "Admin",
      email: "admin@voxcred.com.br",
      password: "123456",
    });

    jest.clearAllMocks();

    await request(app)
      .post("/api/auth/request-access")
      .send({ email: "func@tendaatacado.com.br" });

    // sendEmail é fire-and-forget — aguarda um tick
    await new Promise((r) => setImmediate(r));

    expect(sendEmail).toHaveBeenCalledWith(
      expect.arrayContaining(["admin@voxcred.com.br"]),
      "access-request",
      expect.objectContaining({ email: "func@tendaatacado.com.br" })
    );
  });
});
