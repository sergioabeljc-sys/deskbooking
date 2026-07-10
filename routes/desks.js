const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { requireRole, requireOwnerOrAdmin } = require("../middleware/rbac");
const { validateName, validatePosInt } = require("../utils/validate");
const { auditLog } = require("../utils/audit");
const { getAvailableSpots, getEffectiveRotDays, DOW_NAMES } = require("../utils/spots");

const VALID_DAYS = ["mon", "tue", "wed", "thu", "fri"];

// Listar todas as mesas
router.get("/", authMiddleware, (req, res) => {
  const desks = db.prepare("SELECT * FROM desks ORDER BY pos_y, pos_x").all();
  res.json(desks);
});

// Criar mesa (admin)
router.post("/", authMiddleware, adminMiddleware, (req, res) => {
  const { name, pos_x, pos_y } = req.body;
  const nameErr = validateName(name, "Nome da mesa");
  if (nameErr) return res.status(400).json({ error: nameErr });
  if (pos_x == null || pos_y == null)
    return res.status(400).json({ error: "Posição é obrigatória" });

  const xErr = validatePosInt(pos_x, "Posição X");
  if (xErr) return res.status(400).json({ error: xErr });
  const yErr = validatePosInt(pos_y, "Posição Y");
  if (yErr) return res.status(400).json({ error: yErr });

  const exists = db.prepare("SELECT id FROM desks WHERE pos_x = ? AND pos_y = ?").get(pos_x, pos_y);
  if (exists) return res.status(409).json({ error: "Já existe uma mesa nessa posição" });

  const result = db
    .prepare("INSERT INTO desks (name, pos_x, pos_y) VALUES (?, ?, ?)")
    .run(name.trim(), pos_x, pos_y);
  res.json(db.prepare("SELECT * FROM desks WHERE id = ?").get(result.lastInsertRowid));
});

// Atualizar mesa (admin)
router.put("/:id", authMiddleware, adminMiddleware, (req, res) => {
  const { name, pos_x, pos_y, is_active } = req.body;
  const desk = db.prepare("SELECT * FROM desks WHERE id = ?").get(req.params.id);
  if (!desk) return res.status(404).json({ error: "Mesa não encontrada" });

  if (name !== undefined) {
    const nameErr = validateName(name, "Nome da mesa");
    if (nameErr) return res.status(400).json({ error: nameErr });
  }
  if (pos_x != null) {
    const xErr = validatePosInt(pos_x, "Posição X");
    if (xErr) return res.status(400).json({ error: xErr });
  }
  if (pos_y != null) {
    const yErr = validatePosInt(pos_y, "Posição Y");
    if (yErr) return res.status(400).json({ error: yErr });
  }
  if (is_active !== undefined && is_active !== null && ![0, 1].includes(Number(is_active))) {
    return res.status(400).json({ error: "is_active deve ser 0 ou 1" });
  }

  if ((pos_x != null || pos_y != null)) {
    const nx = pos_x ?? desk.pos_x;
    const ny = pos_y ?? desk.pos_y;
    const conflict = db
      .prepare("SELECT id FROM desks WHERE pos_x = ? AND pos_y = ? AND id != ?")
      .get(nx, ny, desk.id);
    if (conflict) return res.status(409).json({ error: "Já existe uma mesa nessa posição" });
  }

  db.prepare(
    "UPDATE desks SET name = COALESCE(?, name), pos_x = COALESCE(?, pos_x), pos_y = COALESCE(?, pos_y), is_active = COALESCE(?, is_active) WHERE id = ?"
  ).run(name ?? null, pos_x ?? null, pos_y ?? null, is_active ?? null, req.params.id);

  res.json(db.prepare("SELECT * FROM desks WHERE id = ?").get(req.params.id));
});

// Excluir mesa (admin)
router.delete("/:id", authMiddleware, adminMiddleware, (req, res) => {
  const desk = db.prepare("SELECT * FROM desks WHERE id = ?").get(req.params.id);
  if (!desk) return res.status(404).json({ error: "Mesa não encontrada" });

  db.prepare("DELETE FROM desks WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ─── Story 4.1: Gestão de tipo (admin) ───────────────────────────────────────

// PUT /api/desks/:id/type — define tipo e dono (admin)
router.put("/:id/type", authMiddleware, adminMiddleware, (req, res) => {
  const deskId = parseInt(req.params.id, 10);
  const { type, owner_id } = req.body;

  if (!["fixed", "rotative"].includes(type)) {
    return res.status(400).json({ error: "type deve ser 'fixed' ou 'rotative'." });
  }

  if (type === "fixed" && !owner_id) {
    return res.status(400).json({ error: "owner_id é obrigatório para mesas fixas." });
  }

  const desk = db.prepare("SELECT * FROM desks WHERE id = ?").get(deskId);
  if (!desk) return res.status(404).json({ error: "Mesa não encontrada." });

  let ownerName = null;
  if (owner_id) {
    const owner = db.prepare("SELECT id, name FROM users WHERE id = ?").get(owner_id);
    if (!owner) return res.status(404).json({ error: "Usuário dono não encontrado." });
    ownerName = owner.name;
  }

  // Se estiver voltando de fixed para rotative, limpa rotative_days default
  const newRotativeDays = type === "rotative" ? (desk.rotative_days || "[]") : "[]";

  db.prepare(
    "UPDATE desks SET type = ?, owner_id = ?, rotative_days = ? WHERE id = ?"
  ).run(type, owner_id ?? null, newRotativeDays, deskId);

  auditLog(req.user.id, req.user.name, "update_desk_type", "desk", deskId, {
    desk_name: desk.name,
    type,
    owner_name: type === "fixed" ? ownerName : null,
  });

  const updated = db.prepare("SELECT * FROM desks WHERE id = ?").get(deskId);
  res.json({ ...updated, rotative_days: JSON.parse(updated.rotative_days || "[]") });
});

// ─── Story 4.2: Configuração de dias rotativos ────────────────────────────────

// PUT /api/desks/:id/rotative-days — define dias da semana como rotativo (dono ou admin)
router.put(
  "/:id/rotative-days",
  authMiddleware,
  requireOwnerOrAdmin((req) => {
    const desk = db.prepare("SELECT owner_id FROM desks WHERE id = ?").get(
      parseInt(req.params.id, 10)
    );
    return desk?.owner_id;
  }),
  (req, res) => {
    const deskId = parseInt(req.params.id, 10);
    const { rotative_days } = req.body;

    let desk = db.prepare("SELECT * FROM desks WHERE id = ?").get(deskId);
    if (!desk) return res.status(404).json({ error: "Mesa não encontrada." });

    if (desk.type !== "rotative") {
      return res.status(400).json({ error: "Apenas mesas rotativas podem ter dias configurados." });
    }

    if (!Array.isArray(rotative_days)) {
      return res.status(400).json({ error: "rotative_days deve ser um array." });
    }

    const invalid = rotative_days.filter((d) => !VALID_DAYS.includes(d));
    if (invalid.length > 0) {
      return res.status(400).json({
        error: `Dias inválidos: ${invalid.join(", ")}. Use: ${VALID_DAYS.join(", ")}.`,
      });
    }

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Promoção lazy: se há config pendente cuja vigência já chegou, aplica antes de qualquer coisa
    if (desk.rotative_days_next && desk.rotative_days_next_from && todayStr >= desk.rotative_days_next_from) {
      db.prepare(
        "UPDATE desks SET rotative_days = ?, rotative_days_next = NULL, rotative_days_next_from = NULL WHERE id = ?"
      ).run(desk.rotative_days_next, deskId);
      desk = db.prepare("SELECT * FROM desks WHERE id = ?").get(deskId);
    }

    const DAY_LABELS = { mon: "segunda", tue: "terça", wed: "quarta", thu: "quinta", fri: "sexta" };
    const uniqueDays = [...new Set(rotative_days)].sort(
      (a, b) => VALID_DAYS.indexOf(a) - VALID_DAYS.indexOf(b)
    );

    // A mudança sempre entra em vigor na próxima semana — para todos, inclusive admin
    const dow = today.getDay(); // 0=dom, 6=sab
    if (dow === 0 || dow === 6) {
      return res.status(409).json({
        error: "Alterações na programação só podem ser feitas de segunda a sexta-feira.",
      });
    }

    // Calcula a segunda-feira da próxima semana
    const daysToNextMonday = 8 - dow; // seg→7, ter→6, ..., sex→3
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysToNextMonday);
    const nextMondayStr = nextMonday.toISOString().slice(0, 10);

    // Dias que estão saindo do pool (passando a ser fixos para o dono)
    const currentDays = getEffectiveRotDays(desk, todayStr);
    const removedDays = currentDays.filter((d) => !uniqueDays.includes(d));

    // Para cada dia removido, verifica disponibilidade na próxima semana
    for (const day of removedDays) {
      const targetDow = VALID_DAYS.indexOf(day) + 1; // seg=1 ... sex=5
      const nextOccurrence = new Date(nextMonday);
      nextOccurrence.setDate(nextMonday.getDate() + (targetDow - 1));
      const nextDateStr = nextOccurrence.toISOString().slice(0, 10);

      const avail = getAvailableSpots(nextDateStr);
      if (avail.available < 1) {
        return res.status(409).json({
          error: `O escritório está lotado na ${DAY_LABELS[day]}-feira da próxima semana. Não é possível tornar este dia fixo.`,
          day,
          available: avail.available,
        });
      }
    }

    // Salva como configuração pendente para a próxima semana
    db.prepare(
      "UPDATE desks SET rotative_days_next = ?, rotative_days_next_from = ? WHERE id = ?"
    ).run(JSON.stringify(uniqueDays), nextMondayStr, deskId);

    auditLog(req.user.id, req.user.name, "update_rotative_days", "desk", deskId, {
      rotative_days_next: uniqueDays,
      rotative_days_next_from: nextMondayStr,
    });

    res.json({
      id: deskId,
      rotative_days: currentDays,
      rotative_days_next: uniqueDays,
      rotative_days_next_from: nextMondayStr,
    });
  }
);

module.exports = router;
