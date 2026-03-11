const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { SECRET, authMiddleware } = require("../middleware/auth");

router.post("/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios" });
  if (password.length < 6)
    return res.status(400).json({ error: "Senha deve ter ao menos 6 caracteres" });

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

    const token = jwt.sign(user, SECRET, { expiresIn: "7d" });
    res.json({ token, user });
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
  const token = jwt.sign(user, SECRET, { expiresIn: "7d" });
  res.json({ token, user });
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

    const token = jwt.sign(updated, SECRET, { expiresIn: "7d" });
    res.json({ token, user: updated });
  } catch (e) {
    if (e.message.includes("UNIQUE"))
      return res.status(409).json({ error: "E-mail já cadastrado por outro usuário" });
    res.status(500).json({ error: "Erro interno" });
  }
});

module.exports = router;
