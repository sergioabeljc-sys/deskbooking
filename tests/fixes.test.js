process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key-for-jest";
process.env.SETUP_TOKEN = "";

jest.mock("../services/emailService", () => ({ sendEmail: jest.fn() }));

const request = require("supertest");
const app = require("../server");
const db = require("../db");
const jwt = require("jsonwebtoken");
const { getEffectiveRotDays } = require("../utils/spots");

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Returns the next occurrence of a weekday (1=Mon … 5=Fri) as YYYY-MM-DD
function nextDow(targetDow) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  const diff = ((targetDow - d.getUTCDay() + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

// ─── Global setup ─────────────────────────────────────────────────────────────

let adminToken, adminId;
let userToken, userId;
let desk1Id; // first seeded desk — used as generic bookable desk

beforeAll(async () => {
  const adminRes = await request(app).post("/api/auth/register").send({
    name: "Admin Fixes",
    email: "admin-fixes@voxcred.com.br",
    password: "123456",
  });
  adminToken = adminRes.body.token;
  adminId = adminRes.body.user.id;

  const userRes = await request(app).post("/api/auth/register").send({
    name: "User Fixes",
    email: "user-fixes@voxcred.com.br",
    password: "123456",
  });
  userToken = userRes.body.token;
  userId = userRes.body.user.id;

  const desksRes = await request(app)
    .get("/api/desks")
    .set("Authorization", `Bearer ${adminToken}`);
  desk1Id = desksRes.body[0].id;
});

// ─── Fix #6: Revogação imediata via authMiddleware ────────────────────────────

describe("authMiddleware — revogação imediata (#6)", () => {
  afterEach(() => {
    db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(userId);
  });

  it("status=revoked bloqueia JWT válido com 403", async () => {
    db.prepare("UPDATE users SET status = 'revoked' WHERE id = ?").run(userId);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/revogado/i);
  });

  it("status=pending bloqueia JWT válido com 403", async () => {
    db.prepare("UPDATE users SET status = 'pending' WHERE id = ?").run(userId);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it("status=active continua acessando normalmente", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userId);
  });

  it("revogação bloqueia rota de criação de reservas", async () => {
    db.prepare("UPDATE users SET status = 'revoked' WHERE id = ?").run(userId);

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ desk_id: desk1Id, date: nextDow(1) });

    expect(res.status).toBe(403);
  });
});

// ─── Fix #7: is_admin lido do banco (sem re-emissão de JWT) ──────────────────

describe("authMiddleware — is_admin fresco do banco (#7)", () => {
  afterEach(() => {
    db.prepare("UPDATE users SET is_admin = 0 WHERE id = ?").run(userId);
    db.prepare("DELETE FROM bookings WHERE user_id = ?").run(adminId);
  });

  it("promoção de is_admin no DB reflete em req.user.is_admin sem reemitir token", async () => {
    // Cria reserva como admin para usar como alvo
    const dateStr = nextDow(1); // próxima segunda
    const bookingRes = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ desk_id: desk1Id, date: dateStr });
    const bookingId = bookingRes.body.id;

    // userToken foi emitido com is_admin=0 — sem permissão para cancelar reserva alheia
    const before = await request(app)
      .delete(`/api/bookings/${bookingId}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(before.status).toBe(403);

    // Promove no banco (sem reemitir token)
    db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(userId);

    // Agora authMiddleware lê is_admin=1 do banco → acesso liberado
    const after = await request(app)
      .delete(`/api/bookings/${bookingId}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(after.status).toBe(200);
  });
});

// ─── Fix #4: Endpoint de troca de código SSO de uso único ────────────────────

describe("GET /api/auth/sso/exchange (#4)", () => {
  const PREFIX = "fix4-";

  beforeEach(() => {
    db.prepare(`DELETE FROM sso_codes WHERE code LIKE '${PREFIX}%'`).run();
  });

  function insertCode(code, overrides = {}) {
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const defaults = {
      token,
      refresh_token: "refresh-" + code,
      user_json: JSON.stringify({ id: userId, name: "User Fixes" }),
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
    const d = { ...defaults, ...overrides };
    db.prepare(
      "INSERT INTO sso_codes (code, token, refresh_token, user_json, expires_at) VALUES (?, ?, ?, ?, ?)"
    ).run(code, d.token, d.refresh_token, d.user_json, d.expires_at);
    return d.token;
  }

  it("código válido retorna token + refreshToken + user", async () => {
    const token = insertCode(PREFIX + "valid");

    const res = await request(app).get(`/api/auth/sso/exchange?code=${PREFIX}valid`);

    expect(res.status).toBe(200);
    expect(res.body.token).toBe(token);
    expect(res.body.refreshToken).toBe("refresh-" + PREFIX + "valid");
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(userId);
  });

  it("código é de uso único — segunda chamada retorna 401", async () => {
    insertCode(PREFIX + "once");

    const first = await request(app).get(`/api/auth/sso/exchange?code=${PREFIX}once`);
    expect(first.status).toBe(200);

    const second = await request(app).get(`/api/auth/sso/exchange?code=${PREFIX}once`);
    expect(second.status).toBe(401);
  });

  it("código expirado retorna 401", async () => {
    insertCode(PREFIX + "expired", {
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });

    const res = await request(app).get(`/api/auth/sso/exchange?code=${PREFIX}expired`);
    expect(res.status).toBe(401);
  });

  it("código inexistente retorna 401", async () => {
    const res = await request(app).get("/api/auth/sso/exchange?code=nao-existe-xyz-abc");
    expect(res.status).toBe(401);
  });

  it("sem parâmetro code retorna 400", async () => {
    const res = await request(app).get("/api/auth/sso/exchange");
    expect(res.status).toBe(400);
  });
});

// ─── Fix #3: getEffectiveRotDays — vigência da config pendente ────────────────

describe("getEffectiveRotDays — config pendente de dias rotativos (#3)", () => {
  it("usa rotative_days_next quando date >= rotative_days_next_from", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const desk = {
      rotative_days: '["mon"]',
      rotative_days_next: '["mon","tue","wed","thu","fri"]',
      rotative_days_next_from: yesterday,
    };
    const nextTue = nextDow(2);
    const effective = getEffectiveRotDays(desk, nextTue);
    expect(effective).toContain("tue");
    expect(effective).toHaveLength(5);
  });

  it("usa rotative_days quando date < rotative_days_next_from (config futura)", () => {
    const desk = {
      rotative_days: '["mon"]',
      rotative_days_next: '["mon","tue","wed","thu","fri"]',
      rotative_days_next_from: "2099-01-06",
    };
    const effective = getEffectiveRotDays(desk, "2026-07-15");
    expect(effective).toEqual(["mon"]);
  });

  it("sem config pendente retorna rotative_days atual", () => {
    const desk = {
      rotative_days: '["mon","wed","fri"]',
      rotative_days_next: null,
      rotative_days_next_from: null,
    };
    expect(getEffectiveRotDays(desk, "2026-07-15")).toEqual(["mon", "wed", "fri"]);
  });

  it("rotative_days = [] (nenhum dia em pool) → dono nunca precisa reservar", () => {
    const desk = {
      rotative_days: "[]",
      rotative_days_next: null,
      rotative_days_next_from: null,
    };
    // Qualquer dia de semana está fora do pool → presença automática
    expect(getEffectiveRotDays(desk, nextDow(1))).toEqual([]);
  });

  it("reserva bloqueada (409) quando dono tem mesa disponível no dia via config pendente", async () => {
    // Cria mesa rotativa com userId como dono
    const deskRes = await request(app)
      .post("/api/desks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Mesa EffRotDays", pos_x: 30, pos_y: 30 });
    const ownedDeskId = deskRes.body.id;

    // Config: mesa em pool apenas na 2ª (Mon); pendente = nenhum dia em pool, desde ontem
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    db.prepare(
      "UPDATE desks SET type = 'rotative', owner_id = ?, rotative_days = ?, rotative_days_next = ?, rotative_days_next_from = ? WHERE id = ?"
    ).run(userId, '["mon","tue","wed","thu","fri"]', "[]", yesterday, ownedDeskId);

    // Config pendente ativa: rotative_days_next = [] → nenhum dia em pool
    // → owner's desk is available on ANY day → booking should return 409
    const nextMon = nextDow(1);
    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ desk_id: desk1Id, date: nextMon });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/mesa.*disponível|não é necessária/i);

    // Limpa
    db.prepare("UPDATE desks SET owner_id = NULL WHERE id = ?").run(ownedDeskId);
    db.prepare("DELETE FROM bookings WHERE user_id = ?").run(userId);
  });
});

// ─── Fix #8: is_desk_owner somente para mesas fixas na visão semanal ─────────

describe("GET /api/spots/week — is_desk_owner apenas para tipo fixed (#8)", () => {
  const WEEK_START = "2099-01-06"; // Segunda-feira distante, evita conflitos
  let activeDeskId = null; // cleaned up in afterEach

  beforeEach(() => {
    db.prepare("DELETE FROM spot_bookings WHERE date LIKE '2099-01%'").run();
  });

  afterEach(() => {
    if (activeDeskId !== null) {
      db.prepare("UPDATE desks SET type = 'rotative', owner_id = NULL WHERE id = ?").run(activeDeskId);
      activeDeskId = null;
    }
  });

  // Helper: find the spot_bookings entry (not auto_presence) for a user on a specific date
  function findSpotEntry(week, date, email) {
    return (week[date] || []).find((e) => e.email === email && e.auto_presence === false);
  }

  it("dono de mesa fixa tem is_desk_owner=true na visão semanal", async () => {
    const deskRes = await request(app)
      .post("/api/desks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Mesa Fixa DeskOwner", pos_x: 31, pos_y: 30 });
    activeDeskId = deskRes.body.id;
    db.prepare("UPDATE desks SET type = 'fixed', owner_id = ? WHERE id = ?").run(userId, activeDeskId);

    db.prepare(
      "INSERT INTO spot_bookings (user_id, date, start_time, end_time, status) VALUES (?, ?, ?, ?, 'confirmed')"
    ).run(userId, "2099-01-06", "09:00", "18:00");

    const res = await request(app)
      .get(`/api/spots/week?start=${WEEK_START}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const entry = findSpotEntry(res.body.week, "2099-01-06", "user-fixes@voxcred.com.br");
    expect(entry).toBeDefined();
    expect(entry.is_desk_owner).toBe(true);
  });

  it("dono de mesa rotativa tem is_desk_owner=false na visão semanal", async () => {
    const deskRes = await request(app)
      .post("/api/desks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Mesa Rotativa DeskOwner", pos_x: 32, pos_y: 30 });
    activeDeskId = deskRes.body.id;
    db.prepare("UPDATE desks SET type = 'rotative', owner_id = ?, rotative_days = '[]' WHERE id = ?").run(userId, activeDeskId);

    db.prepare(
      "INSERT INTO spot_bookings (user_id, date, start_time, end_time, status) VALUES (?, ?, ?, ?, 'confirmed')"
    ).run(userId, "2099-01-07", "09:00", "18:00"); // Tuesday

    const res = await request(app)
      .get(`/api/spots/week?start=${WEEK_START}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const entry = findSpotEntry(res.body.week, "2099-01-07", "user-fixes@voxcred.com.br");
    expect(entry).toBeDefined();
    expect(entry.is_desk_owner).toBe(false);
  });

  it("usuário sem mesa tem is_desk_owner=false", async () => {
    db.prepare(
      "INSERT INTO spot_bookings (user_id, date, start_time, end_time, status) VALUES (?, ?, ?, ?, 'confirmed')"
    ).run(userId, "2099-01-08", "09:00", "18:00"); // Wednesday

    const res = await request(app)
      .get(`/api/spots/week?start=${WEEK_START}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const entry = findSpotEntry(res.body.week, "2099-01-08", "user-fixes@voxcred.com.br");
    expect(entry).toBeDefined();
    expect(entry.is_desk_owner).toBe(false);
  });
});

// ─── Fix #10: Deleção de departamento bloqueada com usuários vinculados ───────

describe("DELETE /api/admin/departments/:id — bloqueio com usuários (#10)", () => {
  it("retorna 409 ao tentar remover departamento com usuários vinculados", async () => {
    // Cria departamento
    const deptRes = await request(app)
      .post("/api/admin/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Depto Vinculado", can_book_spot: false });
    expect(deptRes.status).toBe(201);
    const deptId = deptRes.body.id;

    // Vincula userId ao departamento
    db.prepare("UPDATE users SET department = 'Depto Vinculado' WHERE id = ?").run(userId);

    // Tentativa de deleção deve falhar com 409
    const delRes = await request(app)
      .delete(`/api/admin/departments/${deptId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(delRes.status).toBe(409);
    expect(delRes.body.error).toMatch(/1 usuário/i);

    // Desvincula e deleta com sucesso
    db.prepare("UPDATE users SET department = NULL WHERE id = ?").run(userId);
    const delOk = await request(app)
      .delete(`/api/admin/departments/${deptId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(delOk.status).toBe(200);
  });

  it("remove departamento sem usuários vinculados normalmente", async () => {
    const deptRes = await request(app)
      .post("/api/admin/departments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Depto Vazio", can_book_spot: false });
    const deptId = deptRes.body.id;

    const res = await request(app)
      .delete(`/api/admin/departments/${deptId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ─── Fix #14: Deleção de usuário limpa owner_id nas mesas ────────────────────

describe("DELETE /api/users/:id — limpa owner_id em desks (#14)", () => {
  it("mesa tem owner_id=null após deleção do dono", async () => {
    // Cria um usuário extra para deletar
    const tempUser = await request(app).post("/api/auth/register").send({
      name: "Temp Owner",
      email: "temp-owner@voxcred.com.br",
      password: "123456",
    });
    const tempId = tempUser.body.user.id;

    // Cria mesa e atribui ao temp user
    const deskRes = await request(app)
      .post("/api/desks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Mesa Orphan Test", pos_x: 40, pos_y: 40 });
    const ownedDeskId = deskRes.body.id;
    db.prepare("UPDATE desks SET type = 'fixed', owner_id = ? WHERE id = ?").run(tempId, ownedDeskId);

    // Confirma que o owner_id está definido
    expect(db.prepare("SELECT owner_id FROM desks WHERE id = ?").get(ownedDeskId).owner_id).toBe(tempId);

    // Deleta o usuário via API
    const delRes = await request(app)
      .delete(`/api/users/${tempId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);

    // Mesa deve ter owner_id = NULL
    const desk = db.prepare("SELECT owner_id FROM desks WHERE id = ?").get(ownedDeskId);
    expect(desk.owner_id).toBeNull();
  });

  it("admin não pode deletar a própria conta", async () => {
    const res = await request(app)
      .delete(`/api/users/${adminId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});
