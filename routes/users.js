const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");

// Listar todos os usuários (admin)
router.get("/", authMiddleware, adminMiddleware, (req, res) => {
  const users = db
    .prepare("SELECT id, name, email, is_admin, is_ti, created_at FROM users ORDER BY created_at ASC")
    .all();
  res.json(users);
});

// Alternar TI (admin)
router.put("/:id/toggle-ti", authMiddleware, adminMiddleware, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
  db.prepare("UPDATE users SET is_ti = ? WHERE id = ?").run(user.is_ti ? 0 : 1, user.id);
  const updated = db
    .prepare("SELECT id, name, email, is_admin, is_ti FROM users WHERE id = ?")
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

// Remover usuário (admin)
router.delete("/:id", authMiddleware, adminMiddleware, (req, res) => {
  if (parseInt(req.params.id, 10) === req.user.id)
    return res.status(400).json({ error: "Você não pode excluir sua própria conta" });

  const target = db.prepare("SELECT name, email FROM users WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  if (target) auditLog(req.user.id, req.user.name, "delete_user", "user", parseInt(req.params.id, 10), { name: target.name, email: target.email });
  res.json({ ok: true });
});

module.exports = router;
