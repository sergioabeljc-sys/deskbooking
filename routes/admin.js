const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { sendEmail } = require("../services/emailService");
const { auditLog } = require("../utils/audit");

// Todas as rotas deste módulo exigem autenticação + perfil admin
router.use(authMiddleware, requireRole("admin"));

// ─── Pedidos de Acesso ────────────────────────────────────────────────────────

// Lista pedidos pendentes
router.get("/access-requests", (req, res) => {
  const requests = db
    .prepare(
      "SELECT id, email, company, status, created_at FROM access_requests WHERE status = 'pending' ORDER BY created_at ASC"
    )
    .all();
  res.json(requests);
});

// Aprova pedido: cria usuário ativo e vincula entra_oid
router.post("/access-requests/:id/approve", (req, res) => {
  const { entra_oid, name, department } = req.body;
  const requestId = parseInt(req.params.id, 10);

  if (!entra_oid) {
    return res.status(400).json({ error: "entra_oid é obrigatório para aprovação." });
  }

  const accessReq = db
    .prepare("SELECT * FROM access_requests WHERE id = ? AND status = 'pending'")
    .get(requestId);

  if (!accessReq) {
    return res.status(404).json({ error: "Pedido não encontrado ou já processado." });
  }

  // entra_oid deve ser único
  const oidConflict = db
    .prepare("SELECT id FROM users WHERE entra_oid = ?")
    .get(entra_oid);
  if (oidConflict) {
    return res.status(409).json({ error: "Este entra_oid já está vinculado a outro usuário." });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, is_admin, company, department, entra_oid, entra_tenant, status)
         VALUES (?, ?, '', 0, ?, ?, ?, ?, 'active')`
      )
      .run(
        name || accessReq.email,
        accessReq.email,
        accessReq.company,
        department || null,
        entra_oid,
        accessReq.company
      );

    db.prepare(
      "UPDATE access_requests SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
    ).run(req.user.id, requestId);

    auditLog(req.user.id, req.user.name, "approve_access", "access_request", requestId, {
      email: accessReq.email,
      entra_oid,
    });

    sendEmail(accessReq.email, "access-approved", {
      name: name || accessReq.email,
      email: accessReq.email,
    });

    res.json({ ok: true, userId: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes("UNIQUE")) {
      return res.status(409).json({ error: "E-mail já cadastrado no sistema." });
    }
    console.error("[admin] Erro ao aprovar acesso:", e.message);
    res.status(500).json({ error: "Erro interno." });
  }
});

// Recusa pedido
router.post("/access-requests/:id/refuse", (req, res) => {
  const requestId = parseInt(req.params.id, 10);

  const accessReq = db
    .prepare("SELECT * FROM access_requests WHERE id = ? AND status = 'pending'")
    .get(requestId);

  if (!accessReq) {
    return res.status(404).json({ error: "Pedido não encontrado ou já processado." });
  }

  db.prepare(
    "UPDATE access_requests SET status = 'refused', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
  ).run(req.user.id, requestId);

  auditLog(req.user.id, req.user.name, "refuse_access", "access_request", requestId, {
    email: accessReq.email,
  });

  sendEmail(accessReq.email, "access-refused", { email: accessReq.email });

  res.json({ ok: true });
});

// ─── Departamentos ────────────────────────────────────────────────────────────

// Lista departamentos com status de acesso a vagas
router.get("/departments", (req, res) => {
  const depts = db
    .prepare("SELECT id, name, can_book_spot, updated_at FROM departments ORDER BY name ASC")
    .all();
  res.json(depts);
});

// Habilita ou desabilita um departamento individualmente
router.put("/departments/:id", (req, res) => {
  const deptId = parseInt(req.params.id, 10);
  const { can_book_spot } = req.body;

  if (can_book_spot === undefined || typeof can_book_spot !== "boolean") {
    return res.status(400).json({ error: "can_book_spot (boolean) é obrigatório." });
  }

  const dept = db.prepare("SELECT id, name FROM departments WHERE id = ?").get(deptId);
  if (!dept) return res.status(404).json({ error: "Departamento não encontrado." });

  db.prepare(
    "UPDATE departments SET can_book_spot = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(can_book_spot ? 1 : 0, req.user.id, deptId);

  auditLog(req.user.id, req.user.name, "update_department", "department", deptId, {
    name: dept.name,
    can_book_spot,
  });

  res.json({ ok: true });
});

// Cria novo departamento
router.post("/departments", (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Nome é obrigatório." });

  try {
    const result = db
      .prepare("INSERT INTO departments (name, can_book_spot, updated_by) VALUES (?, ?, ?)")
      .run(name, req.body.can_book_spot ? 1 : 0, req.user.id);
    const dept = db.prepare("SELECT id, name, can_book_spot, updated_at FROM departments WHERE id = ?").get(result.lastInsertRowid);
    auditLog(req.user.id, req.user.name, "create_department", "department", dept.id, { name: dept.name });
    res.status(201).json(dept);
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(409).json({ error: "Departamento já existe." });
    res.status(500).json({ error: "Erro interno." });
  }
});

// Remove departamento
router.delete("/departments/:id", (req, res) => {
  const deptId = parseInt(req.params.id, 10);
  const dept = db.prepare("SELECT id, name FROM departments WHERE id = ?").get(deptId);
  if (!dept) return res.status(404).json({ error: "Departamento não encontrado." });

  const linkedCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE department = ?").get(dept.name).cnt;
  if (linkedCount > 0) {
    return res.status(409).json({
      error: `Não é possível remover: ${linkedCount} usuário(s) vinculado(s) a este departamento. Reatribua-os antes de excluir.`,
    });
  }

  db.prepare("DELETE FROM departments WHERE id = ?").run(deptId);
  auditLog(req.user.id, req.user.name, "delete_department", "department", deptId, { name: dept.name });
  res.json({ ok: true });
});

// ─── Capacidade de Vagas (Story 4.3) ─────────────────────────────────────────

const VALID_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// GET /api/admin/spot-capacity — lista capacidades configuradas
router.get("/spot-capacity", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, day_of_week, specific_date, capacity, updated_at FROM spot_capacity ORDER BY id ASC"
    )
    .all();
  res.json(rows);
});

// PUT /api/admin/spot-capacity — define capacidade por day_of_week ou specific_date
router.put("/spot-capacity", (req, res) => {
  const { day_of_week, specific_date, capacity } = req.body;

  if (!day_of_week && !specific_date) {
    return res
      .status(400)
      .json({ error: "day_of_week ou specific_date é obrigatório." });
  }

  if (day_of_week && !VALID_DAYS.includes(day_of_week)) {
    return res.status(400).json({
      error: `day_of_week inválido. Use: ${VALID_DAYS.join(", ")}.`,
    });
  }

  if (specific_date && !/^\d{4}-\d{2}-\d{2}$/.test(specific_date)) {
    return res.status(400).json({ error: "specific_date deve estar no formato YYYY-MM-DD." });
  }

  if (!Number.isInteger(capacity) || capacity < 0) {
    return res.status(400).json({ error: "capacity deve ser um inteiro >= 0." });
  }

  // Upsert: atualiza se já existe, senão insere
  if (day_of_week) {
    const existing = db
      .prepare("SELECT id FROM spot_capacity WHERE day_of_week = ?")
      .get(day_of_week);
    if (existing) {
      db.prepare(
        "UPDATE spot_capacity SET capacity = ?, updated_by = ?, updated_at = datetime('now') WHERE day_of_week = ?"
      ).run(capacity, req.user.id, day_of_week);
    } else {
      db.prepare(
        "INSERT INTO spot_capacity (day_of_week, capacity, updated_by) VALUES (?, ?, ?)"
      ).run(day_of_week, capacity, req.user.id);
    }
  } else {
    const existing = db
      .prepare("SELECT id FROM spot_capacity WHERE specific_date = ?")
      .get(specific_date);
    if (existing) {
      db.prepare(
        "UPDATE spot_capacity SET capacity = ?, updated_by = ?, updated_at = datetime('now') WHERE specific_date = ?"
      ).run(capacity, req.user.id, specific_date);
    } else {
      db.prepare(
        "INSERT INTO spot_capacity (specific_date, capacity, updated_by) VALUES (?, ?, ?)"
      ).run(specific_date, capacity, req.user.id);
    }
  }

  auditLog(req.user.id, req.user.name, "update_spot_capacity", "spot_capacity", null, {
    day_of_week,
    specific_date,
    capacity,
  });

  res.json({ ok: true, day_of_week: day_of_week || null, specific_date: specific_date || null, capacity });
});

module.exports = router;
