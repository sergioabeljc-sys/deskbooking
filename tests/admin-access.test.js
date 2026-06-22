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
  // Cria admin
  const adminRes = await request(app).post("/api/auth/register").send({
    name: "Admin",
    email: "admin@voxcred.com.br",
    password: "123456",
  });
  adminToken = adminRes.body.token;

  // Cria usuário comum
  const userRes = await request(app).post("/api/auth/register").send({
    name: "User",
    email: "user@voxcred.com.br",
    password: "123456",
  });
  userToken = userRes.body.token;
});

beforeEach(() => jest.clearAllMocks());

// ─── Acesso sem autenticação ──────────────────────────────────────────────────

describe("Proteção das rotas admin", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/admin/access-requests");
    expect(res.status).toBe(401);
  });

  it("retorna 403 para usuário não-admin", async () => {
    const res = await request(app)
      .get("/api/admin/access-requests")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── Pedidos de Acesso ────────────────────────────────────────────────────────

describe("GET /api/admin/access-requests", () => {
  it("retorna lista de pedidos pendentes para admin", async () => {
    // Cria um pedido
    await request(app)
      .post("/api/auth/request-access")
      .send({ email: "func@tendaatacado.com.br" });

    const res = await request(app)
      .get("/api/admin/access-requests")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const pending = res.body.find((r) => r.email === "func@tendaatacado.com.br");
    expect(pending).toBeDefined();
    expect(pending.status).toBe("pending");
  });
});

describe("POST /api/admin/access-requests/:id/approve", () => {
  it("aprova pedido e cria usuário ativo", async () => {
    await request(app)
      .post("/api/auth/request-access")
      .send({ email: "aprovado@tendaatacado.com.br" });

    const listRes = await request(app)
      .get("/api/admin/access-requests")
      .set("Authorization", `Bearer ${adminToken}`);

    const req = listRes.body.find((r) => r.email === "aprovado@tendaatacado.com.br");
    expect(req).toBeDefined();

    const approveRes = await request(app)
      .post(`/api/admin/access-requests/${req.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ entra_oid: "oid-aprovado-123", name: "Fulano Aprovado", department: "RH" });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.ok).toBe(true);
    expect(approveRes.body.userId).toBeDefined();
  });

  it("envia e-mail de aprovação ao solicitante", async () => {
    await request(app)
      .post("/api/auth/request-access")
      .send({ email: "email-aprov@tendaatacado.com.br" });

    const listRes = await request(app)
      .get("/api/admin/access-requests")
      .set("Authorization", `Bearer ${adminToken}`);

    const req = listRes.body.find((r) => r.email === "email-aprov@tendaatacado.com.br");

    await request(app)
      .post(`/api/admin/access-requests/${req.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ entra_oid: "oid-email-aprov-unique" });

    await new Promise((r) => setImmediate(r));
    expect(sendEmail).toHaveBeenCalledWith(
      "email-aprov@tendaatacado.com.br",
      "access-approved",
      expect.any(Object)
    );
  });

  it("retorna 400 sem entra_oid", async () => {
    const res = await request(app)
      .post("/api/admin/access-requests/999/approve")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("retorna 404 para pedido inexistente", async () => {
    const res = await request(app)
      .post("/api/admin/access-requests/99999/approve")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ entra_oid: "qualquer-oid" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/access-requests/:id/refuse", () => {
  it("recusa pedido e notifica solicitante", async () => {
    await request(app)
      .post("/api/auth/request-access")
      .send({ email: "recusado@voxcred.com.br" });

    const listRes = await request(app)
      .get("/api/admin/access-requests")
      .set("Authorization", `Bearer ${adminToken}`);

    const req = listRes.body.find((r) => r.email === "recusado@voxcred.com.br");
    expect(req).toBeDefined();

    const refuseRes = await request(app)
      .post(`/api/admin/access-requests/${req.id}/refuse`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(refuseRes.status).toBe(200);
    expect(refuseRes.body.ok).toBe(true);

    await new Promise((r) => setImmediate(r));
    expect(sendEmail).toHaveBeenCalledWith(
      "recusado@voxcred.com.br",
      "access-refused",
      expect.any(Object)
    );
  });

  it("retorna 404 para pedido já processado (recusar de novo)", async () => {
    await request(app)
      .post("/api/auth/request-access")
      .send({ email: "duprecusa@voxcred.com.br" });

    const listRes = await request(app)
      .get("/api/admin/access-requests")
      .set("Authorization", `Bearer ${adminToken}`);

    const req = listRes.body.find((r) => r.email === "duprecusa@voxcred.com.br");

    await request(app)
      .post(`/api/admin/access-requests/${req.id}/refuse`)
      .set("Authorization", `Bearer ${adminToken}`);

    const res2 = await request(app)
      .post(`/api/admin/access-requests/${req.id}/refuse`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res2.status).toBe(404);
  });
});

// ─── Departamentos ────────────────────────────────────────────────────────────

describe("GET /api/admin/departments", () => {
  it("lista departamentos com can_book_spot", async () => {
    const res = await request(app)
      .get("/api/admin/departments")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((d) => d.name === "RH")).toBe(true);
    expect(res.body.some((d) => d.name === "Suprimentos")).toBe(true);
  });
});

describe("PUT /api/admin/departments/:id", () => {
  it("desabilita departamento individualmente", async () => {
    const listRes = await request(app)
      .get("/api/admin/departments")
      .set("Authorization", `Bearer ${adminToken}`);

    const rh = listRes.body.find((d) => d.name === "RH");

    const res = await request(app)
      .put(`/api/admin/departments/${rh.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ can_book_spot: false });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verifica que foi desabilitado
    const updated = await request(app)
      .get("/api/admin/departments")
      .set("Authorization", `Bearer ${adminToken}`);
    const updatedRh = updated.body.find((d) => d.name === "RH");
    expect(updatedRh.can_book_spot).toBe(0);
  });

  it("retorna 400 sem can_book_spot", async () => {
    const res = await request(app)
      .put("/api/admin/departments/1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("retorna 404 para departamento inexistente", async () => {
    const res = await request(app)
      .put("/api/admin/departments/99999")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ can_book_spot: true });
    expect(res.status).toBe(404);
  });
});
