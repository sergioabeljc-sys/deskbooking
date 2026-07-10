const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { validateEmail, validateName, validatePassword } = require("../utils/validate");

// Listar todos os usuários (admin)
router.get("/", authMiddleware, adminMiddleware, (req, res) => {
  const users = db
    .prepare("SELECT id, name, email, is_admin, is_ti, weekly_office_days, company, department, status, created_at FROM users ORDER BY name ASC")
    .all();
  res.json(users);
});

// Criar usuário (admin) — senha opcional: sem senha = usuário SSO-only
router.post("/", authMiddleware, adminMiddleware, (req, res) => {
  const { name, email, password } = req.body;
  const nameErr = validateName(name);
  if (nameErr) return res.status(400).json({ error: nameErr });
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });

  let hash;
  if (password) {
    const passErr = validatePassword(password);
    if (passErr) return res.status(400).json({ error: passErr });
    hash = bcrypt.hashSync(password, 10);
  } else {
    // Usuário SSO-only: hash inacessível gerado aleatoriamente
    hash = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10);
  }
  try {
    const result = db
      .prepare("INSERT INTO users (name, email, password_hash, is_admin, weekly_office_days) VALUES (?, ?, ?, 0, 3)")
      .run(name.trim(), email.trim().toLowerCase(), hash);

    const user = db
      .prepare("SELECT id, name, email, is_admin, is_ti, weekly_office_days FROM users WHERE id = ?")
      .get(result.lastInsertRowid);

    auditLog(req.user.id, req.user.name, "create_user", "user", user.id, { name: user.name, email: user.email });
    res.json(user);
  } catch (e) {
    if (e.message.includes("UNIQUE"))
      return res.status(409).json({ error: "E-mail já cadastrado" });
    res.status(500).json({ error: "Erro interno" });
  }
});

// Editar dados do usuário: nome, empresa, departamento (admin)
router.put("/:id", authMiddleware, adminMiddleware, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

  const { name, company, department } = req.body;
  if (name) {
    const nameErr = validateName(name);
    if (nameErr) return res.status(400).json({ error: nameErr });
  }

  db.prepare("UPDATE users SET name = ?, company = ?, department = ? WHERE id = ?")
    .run(name ? name.trim() : user.name, company || null, department || null, user.id);

  const updated = db
    .prepare("SELECT id, name, email, is_admin, is_ti, weekly_office_days, company, department FROM users WHERE id = ?")
    .get(user.id);
  auditLog(req.user.id, req.user.name, "edit_user", "user", user.id, {
    name: updated.name, company: updated.company, department: updated.department,
  });
  res.json(updated);
});

// Alterar limite semanal de dias no escritório (admin)
router.put("/:id/weekly-days", authMiddleware, adminMiddleware, (req, res) => {
  const days = parseInt(req.body.days, 10);
  if (!Number.isInteger(days) || days < 1 || days > 5) {
    return res.status(400).json({ error: "Dias deve ser um número entre 1 e 5" });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

  db.prepare("UPDATE users SET weekly_office_days = ? WHERE id = ?").run(days, user.id);
  auditLog(req.user.id, req.user.name, "set_weekly_days", "user", user.id, {
    name: user.name, weekly_office_days: days,
  });
  res.json({ ok: true, weekly_office_days: days });
});

// Alternar TI (admin)
router.put("/:id/toggle-ti", authMiddleware, adminMiddleware, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
  db.prepare("UPDATE users SET is_ti = ? WHERE id = ?").run(user.is_ti ? 0 : 1, user.id);
  const updated = db
    .prepare("SELECT id, name, email, is_admin, is_ti, weekly_office_days FROM users WHERE id = ?")
    .get(user.id);
  auditLog(req.user.id, req.user.name, "toggle_ti", "user", user.id, {
    name: user.name, is_ti: !user.is_ti,
  });
  res.json(updated);
});

// Alternar admin (admin)
router.put("/:id/toggle-admin", authMiddleware, adminMiddleware, (req, res) => {
  if (parseInt(req.params.id, 10) === req.user.id)
    return res.status(400).json({ error: "Você não pode alterar seu próprio status de admin" });

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

  db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(user.is_admin ? 0 : 1, user.id);
  const updated = db
    .prepare("SELECT id, name, email, is_admin FROM users WHERE id = ?")
    .get(user.id);
  auditLog(req.user.id, req.user.name, "toggle_admin", "user", user.id, {
    name: user.name, is_admin: !user.is_admin,
  });
  res.json(updated);
});

// Alternar status ativo/inativo (admin)
router.put("/:id/toggle-status", authMiddleware, adminMiddleware, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (userId === req.user.id)
    return res.status(400).json({ error: "Você não pode alterar seu próprio status" });

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

  const newStatus = user.status === "inactive" ? "active" : "inactive";
  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(newStatus, userId);
  auditLog(req.user.id, req.user.name, "toggle_status", "user", userId, {
    name: user.name, status: newStatus,
  });
  res.json({ ok: true, status: newStatus });
});

// Remover usuário (admin)
router.delete("/:id", authMiddleware, adminMiddleware, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (userId === req.user.id)
    return res.status(400).json({ error: "Você não pode excluir sua própria conta" });

  const target = db.prepare("SELECT name, email FROM users WHERE id = ?").get(userId);
  if (!target) return res.status(404).json({ error: "Usuário não encontrado" });

  // Cancela reservas FUTURAS (após hoje) — reservas do dia atual e passadas são preservadas
  const today = new Date().toISOString().split("T")[0];
  db.prepare("DELETE FROM bookings WHERE user_id = ? AND date > ?").run(userId, today);
  db.prepare("DELETE FROM room_bookings WHERE user_id = ? AND date > ?").run(userId, today);
  db.prepare("DELETE FROM spot_bookings WHERE user_id = ? AND date > ?").run(userId, today);

  // Libera mesas cujo dono está sendo excluído
  db.prepare("UPDATE desks SET owner_id = NULL WHERE owner_id = ?").run(userId);

  // Limpa referências sem FK automática
  db.prepare("UPDATE departments SET updated_by = NULL WHERE updated_by = ?").run(userId);
  db.prepare("UPDATE spot_capacity SET updated_by = NULL WHERE updated_by = ?").run(userId);

  // Exclui o usuário — ON DELETE SET NULL nas FKs preserva reservas passadas com user_id = NULL
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  auditLog(req.user.id, req.user.name, "delete_user", "user", userId, { name: target.name, email: target.email });
  res.json({ ok: true });
});

module.exports = router;
