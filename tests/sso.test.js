process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

// Configura vars SSO para os testes
process.env.ENTRA_TENDA_CLIENT_ID = "tenda-client-id";
process.env.ENTRA_TENDA_CLIENT_SECRET = "tenda-secret";
process.env.ENTRA_TENDA_TENANT_ID = "tenda-tenant-id";
process.env.ENTRA_VOXCRED_CLIENT_ID = "voxcred-client-id";
process.env.ENTRA_VOXCRED_CLIENT_SECRET = "voxcred-secret";
process.env.ENTRA_VOXCRED_TENANT_ID = "voxcred-tenant-id";

jest.mock("../services/emailService", () => ({ sendEmail: jest.fn() }));

// Mock global fetch para interceptar chamadas ao Azure AD
global.fetch = jest.fn();

const request = require("supertest");
const app = require("../server");
const ssoService = require("../services/ssoService");
const db = require("../db");
const jwt = require("jsonwebtoken");

beforeEach(() => {
  jest.clearAllMocks();
  ssoService._stateStore.clear();
});

// ─── /api/auth/sso/login ──────────────────────────────────────────────────────

describe("GET /api/auth/sso/login", () => {
  it("redireciona para Azure AD para e-mail @tendaatacado.com.br", async () => {
    const res = await request(app)
      .get("/api/auth/sso/login?email=ana@tendaatacado.com.br")
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("login.microsoftonline.com");
    expect(res.headers.location).toContain("tenda-tenant-id");
    expect(res.headers.location).toContain("tenda-client-id");
  });

  it("redireciona para Azure AD para e-mail @voxcred.com.br", async () => {
    const res = await request(app)
      .get("/api/auth/sso/login?email=carlos@voxcred.com.br")
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("voxcred-tenant-id");
  });

  it("retorna 400 para domínio não autorizado", async () => {
    const res = await request(app).get("/api/auth/sso/login?email=user@gmail.com");
    expect(res.status).toBe(400);
  });

  it("retorna 400 sem e-mail", async () => {
    const res = await request(app).get("/api/auth/sso/login");
    expect(res.status).toBe(400);
  });

  it("inclui state na URL de redirect (proteção CSRF)", async () => {
    const res = await request(app)
      .get("/api/auth/sso/login?email=ana@tendaatacado.com.br")
      .redirects(0);

    const location = res.headers.location;
    expect(location).toMatch(/[?&]state=[a-f0-9]{64}/);
  });

  it("armazena state no stateStore", async () => {
    await request(app)
      .get("/api/auth/sso/login?email=ana@tendaatacado.com.br")
      .redirects(0);

    expect(ssoService._stateStore.size).toBe(1);
  });
});

// ─── /api/auth/sso/callback ───────────────────────────────────────────────────

describe("GET /api/auth/sso/callback", () => {
  function buildIdToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({
      oid: "test-oid-123",
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: "tenda-client-id",
      iss: "https://login.microsoftonline.com/tenda-tenant-id/v2.0",
      ...payload,
    })).toString("base64url");
    return `${header}.${body}.fakesig`;
  }

  function setupState(company = "tenda") {
    const state = "a".repeat(64);
    ssoService._stateStore.set(state, { company, expiresAt: Date.now() + 600_000 });
    return state;
  }

  function insertUser(overrides = {}) {
    const defaults = {
      name: "Ana",
      email: "ana@tendaatacado.com.br",
      password_hash: "hash",
      is_admin: 0,
      entra_oid: "test-oid-123",
      status: "active",
      company: "tenda",
    };
    const u = { ...defaults, ...overrides };
    return db.prepare(`
      INSERT OR REPLACE INTO users (name, email, password_hash, is_admin, entra_oid, status, company)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(u.name, u.email, u.password_hash, u.is_admin, u.entra_oid, u.status, u.company);
  }

  it("redireciona para / com sso_token após login bem-sucedido", async () => {
    insertUser();
    const state = setupState("tenda");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: buildIdToken({ oid: "test-oid-123" }) }),
    });

    const res = await request(app)
      .get(`/api/auth/sso/callback?code=AUTH_CODE&state=${state}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("sso_token=");
  });

  it("retorna 400 para state inválido", async () => {
    const res = await request(app)
      .get("/api/auth/sso/callback?code=CODE&state=estado-invalido");
    expect(res.status).toBe(400);
  });

  it("retorna 401 para erro OAuth retornado pelo Azure", async () => {
    const res = await request(app)
      .get("/api/auth/sso/callback?error=access_denied&state=qualquer");
    expect(res.status).toBe(401);
  });

  it("retorna 401 quando usuário não encontrado no banco", async () => {
    const state = setupState("tenda");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: buildIdToken({ oid: "oid-nao-existe" }) }),
    });

    const res = await request(app)
      .get(`/api/auth/sso/callback?code=CODE&state=${state}`);
    expect(res.status).toBe(401);
  });

  it("retorna 403 para usuário com status pending", async () => {
    insertUser({ entra_oid: "pending-oid", status: "pending", email: "pend@tendaatacado.com.br" });
    const state = setupState("tenda");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: buildIdToken({ oid: "pending-oid" }) }),
    });

    const res = await request(app)
      .get(`/api/auth/sso/callback?code=CODE&state=${state}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("pendente");
  });

  it("retorna 403 para usuário com status revoked", async () => {
    insertUser({ entra_oid: "revoked-oid", status: "revoked", email: "rev@tendaatacado.com.br" });
    const state = setupState("tenda");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: buildIdToken({ oid: "revoked-oid" }) }),
    });

    const res = await request(app)
      .get(`/api/auth/sso/callback?code=CODE&state=${state}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("revogado");
  });

  it("consome o state após uso (não reutilizável)", async () => {
    insertUser();
    const state = setupState("tenda");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: buildIdToken({ oid: "test-oid-123" }) }),
    });

    await request(app).get(`/api/auth/sso/callback?code=CODE&state=${state}`).redirects(0);

    // Segunda tentativa com mesmo state deve falhar
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: buildIdToken({ oid: "test-oid-123" }) }),
    });
    const res2 = await request(app)
      .get(`/api/auth/sso/callback?code=CODE2&state=${state}`);
    expect(res2.status).toBe(400);
  });

  it("JWT emitido tem expiração de 8h", async () => {
    insertUser();
    const state = setupState("tenda");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: buildIdToken({ oid: "test-oid-123" }) }),
    });

    const res = await request(app)
      .get(`/api/auth/sso/callback?code=CODE&state=${state}`)
      .redirects(0);

    const location = res.headers.location || "";
    const tokenMatch = location.match(/sso_token=([^&]+)/);
    if (tokenMatch) {
      const decoded = jwt.decode(decodeURIComponent(tokenMatch[1]));
      const expIn = decoded.exp - decoded.iat;
      expect(expIn).toBeCloseTo(8 * 3600, -1);
    }
  });
});
