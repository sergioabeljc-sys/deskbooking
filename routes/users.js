const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

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
  res.json(updated);
});

// Remover usuário (admin)
router.delete("/:id", authMiddleware, adminMiddleware, (req, res) => {
  if (parseInt(req.params.id, 10) === req.user.id)
    return res.status(400).json({ error: "Você não pode excluir sua própria conta" });

  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
