const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const { SECRET, authMiddleware } = require("../middleware/auth");

function issueTokens(user) {
  const token = jwt.sign(user, SECRET, { expiresIn: "1h" });
  const refreshToken = crypto.randomBytes(64).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)")
    .run(user.id, refreshToken, expiresAt);
  return { token, refreshToken };
}

router.post("/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios" });
  if (password.length < 6)
    return res.status(400).json({ error: "Senha deve ter ao menos 6 caracteres" });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ error: "Formato de e-mail inválido" });
  }

  // Primeiro usuário registrado vira admin
  const { count } = db.prepare("SELECT COUNT(*) as count FROM users").get();
  const is_admin = count === 0 ? 1 : 0;

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db
      .prepare("INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, ?)")
      .run(name.trim(), email.trim().toLowerCase(), hash, is_admin);

    const user = db
      .prepare("SELECT id, name, email, is_admin FROM users WHERE id = ?")
      .get(result.lastInsertRowid);

    const { token, refreshToken } = issueTokens(user);
    res.json({ token, refreshToken, user });
  } catch (e) {
    if (e.message.includes("UNIQUE"))
      return res.status(409).json({ error: "E-mail já cadastrado" });
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "E-mail e senha são obrigatórios" });

  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.trim().toLowerCase());

  if (!row || !bcrypt.compareSync(password, row.password_hash))
    return res.status(401).json({ error: "E-mail ou senha incorretos" });

  const user = { id: row.id, name: row.name, email: row.email, is_admin: row.is_admin };
  const { token, refreshToken } = issueTokens(user);
  res.json({ token, refreshToken, user });
});

router.get("/me", authMiddleware, (req, res) => {
  const user = db
    .prepare("SELECT id, name, email, is_admin FROM users WHERE id = ?")
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
  res.json(user);
});

// Atualizar perfil
router.put("/profile", authMiddleware, (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  if (!name && !email && !password)
    return res.status(400).json({ error: "Nenhum campo para atualizar" });

  const current = db
    .prepare("SELECT id, name, email, is_admin, password_hash FROM users WHERE id = ?")
    .get(req.user.id);
  if (!current) return res.status(404).json({ error: "Usuário não encontrado" });

  // Validate email format
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: "Formato de e-mail inválido" });
    }
  }

  // Validate email uniqueness
  if (email && email.trim().toLowerCase() !== current.email) {
    const existing = db
      .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
      .get(email.trim().toLowerCase(), current.id);
    if (existing) return res.status(409).json({ error: "E-mail já cadastrado por outro usuário" });
  }

  // Validate password
  if (password !== undefined && password !== "") {
    if (password.length < 6)
      return res.status(400).json({ error: "Senha deve ter ao menos 6 caracteres" });
    if (password !== confirmPassword)
      return res.status(400).json({ error: "Senhas não conferem" });
  }

  const newName = name ? name.trim() : current.name;
  const newEmail = email ? email.trim().toLowerCase() : current.email;
  const newHash =
    password && password.length >= 6
      ? bcrypt.hashSync(password, 10)
      : current.password_hash;

  try {
    db.prepare("UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?")
      .run(newName, newEmail, newHash, current.id);

    const updated = db
      .prepare("SELECT id, name, email, is_admin FROM users WHERE id = ?")
      .get(current.id);

    const { token, refreshToken } = issueTokens(updated);
    res.json({ token, refreshToken, user: updated });
  } catch (e) {
    if (e.message.includes("UNIQUE"))
      return res.status(409).json({ error: "E-mail já cadastrado por outro usuário" });
    res.status(500).json({ error: "Erro interno" });
  }
});

router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: "Refresh token obrigatório" });

  const row = db.prepare("SELECT * FROM refresh_tokens WHERE token = ?").get(refreshToken);
  if (!row) return res.status(401).json({ error: "Refresh token inválido" });

  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM refresh_tokens WHERE id = ?").run(row.id);
    return res.status(401).json({ error: "Refresh token expirado" });
  }

  const user = db.prepare("SELECT id, name, email, is_admin FROM users WHERE id = ?").get(row.user_id);
  if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

  db.prepare("DELETE FROM refresh_tokens WHERE id = ?").run(row.id);
  const { token, refreshToken: newRefreshToken } = issueTokens(user);
  res.json({ token, refreshToken: newRefreshToken, user });
});

router.post("/logout", (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    db.prepare("DELETE FROM refresh_tokens WHERE token = ?").run(refreshToken);
  }
  res.json({ ok: true });
});

module.exports = router;
