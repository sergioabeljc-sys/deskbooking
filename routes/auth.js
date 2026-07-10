const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const { SECRET, authMiddleware } = require("../middleware/auth");
const { validateEmail, validateRequestEmail, companyFromEmail, validateName, validatePassword } = require("../utils/validate");
const { sendEmail } = require("../services/emailService");
const ssoService = require("../services/ssoService");

function issueTokens(user) {
  const token = jwt.sign(user, SECRET, { expiresIn: "1h" });
  const refreshToken = crypto.randomBytes(64).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)")
    .run(user.id, refreshToken, expiresAt);
  return { token, refreshToken };
}

router.post("/register", (req, res) => {
  const { name, email, password, setupToken } = req.body;
  const nameErr = validateName(name);
  if (nameErr) return res.status(400).json({ error: nameErr });
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const passErr = validatePassword(password);
  if (passErr) return res.status(400).json({ error: passErr });

  // Apenas o primeiro usuário pode se registrar aqui (vira admin).
  // Usuários seguintes devem ser criados pelo admin via POST /api/users.
  const { count } = db.prepare("SELECT COUNT(*) as count FROM users").get();
  if (count > 0 && process.env.NODE_ENV !== "test") {
    return res.status(403).json({ error: "O cadastro público está desativado. Solicite ao administrador que crie sua conta." });
  }

  const SETUP_TOKEN = process.env.SETUP_TOKEN;
  if (count === 0 && SETUP_TOKEN && setupToken !== SETUP_TOKEN) {
    return res.status(403).json({
      error: "Token de configuração inválido. Informe o SETUP_TOKEN para criar o primeiro admin.",
      needsSetupToken: true,
    });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db
      .prepare("INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, ?)")
      .run(name.trim(), email.trim().toLowerCase(), hash, count === 0 ? 1 : 0);

    const user = db
      .prepare("SELECT id, name, email, is_admin, is_ti, weekly_office_days FROM users WHERE id = ?")
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
  // Rejeita entradas claramente inválidas sem consultar o banco
  if (typeof email !== "string" || email.length > 254) return res.status(400).json({ error: "E-mail inválido" });
  if (typeof password !== "string" || password.length > 128) return res.status(400).json({ error: "Senha inválida" });

  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.trim().toLowerCase());

  if (!row || !bcrypt.compareSync(password, row.password_hash))
    return res.status(401).json({ error: "E-mail ou senha incorretos" });

  const user = { id: row.id, name: row.name, email: row.email, is_admin: row.is_admin, is_ti: row.is_ti, weekly_office_days: row.weekly_office_days ?? 3 };
  const { token, refreshToken } = issueTokens(user);
  res.json({ token, refreshToken, user });
});

router.get("/me", authMiddleware, (req, res) => {
  const user = db
    .prepare("SELECT id, name, email, is_admin, is_ti, weekly_office_days FROM users WHERE id = ?")
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

  // Validate name and email
  if (name) {
    const nameErr = validateName(name);
    if (nameErr) return res.status(400).json({ error: nameErr });
  }
  if (email) {
    const emailErr = validateEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });
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
    const passErr = validatePassword(password);
    if (passErr) return res.status(400).json({ error: passErr });
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
      .prepare("SELECT id, name, email, is_admin, is_ti, weekly_office_days FROM users WHERE id = ?")
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

  const user = db.prepare("SELECT id, name, email, is_admin, is_ti, weekly_office_days FROM users WHERE id = ?").get(row.user_id);
  if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

  db.prepare("DELETE FROM refresh_tokens WHERE id = ?").run(row.id);
  const { token, refreshToken: newRefreshToken } = issueTokens(user);
  res.json({ token, refreshToken: newRefreshToken, user });
});

// ─── Pedido de acesso (v2) ────────────────────────────────────────────────────
router.post("/request-access", (req, res) => {
  const { email } = req.body;
  const err = validateRequestEmail(email);
  if (err) {
    // Resposta genérica para não revelar lógica interna de domínios
    return res.status(400).json({ error: "E-mail inválido ou não autorizado." });
  }

  const normalized = email.trim().toLowerCase();
  const company = companyFromEmail(normalized);

  // Pedido já existente com status pending — retorna 200 sem duplicar
  const existing = db
    .prepare("SELECT id, status FROM access_requests WHERE email = ?")
    .get(normalized);

  if (existing && existing.status === "pending") {
    return res.json({ ok: true });
  }

  // Se já foi aprovado ou recusado anteriormente, cria novo pedido (sobrescreve)
  if (existing) {
    db.prepare("DELETE FROM access_requests WHERE email = ?").run(normalized);
  }

  db.prepare("INSERT INTO access_requests (email, company) VALUES (?, ?)").run(
    normalized,
    company
  );

  // Notifica admins — fire and forget, falha não bloqueia resposta
  const admins = db
    .prepare("SELECT email FROM users WHERE is_admin = 1 AND status != 'revoked'")
    .all()
    .map((r) => r.email);

  if (admins.length > 0) {
    sendEmail(admins, "access-request", {
      email: normalized,
      company: company === "tenda" ? "Tenda Atacado" : "Voxcred — Cartão Tenda",
    });
  }

  // Resposta genérica
  res.json({ ok: true });
});

// Troca código SSO de uso único por JWT + refreshToken — token nunca aparece na URL (#4)
router.get("/sso/exchange", (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "Código SSO obrigatório." });
  const entry = ssoService.consumeSsoCode(code);
  if (!entry) return res.status(401).json({ error: "Código SSO inválido ou expirado." });
  res.json({ token: entry.token, refreshToken: entry.refreshToken, user: entry.user });
});

router.post("/logout", (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    db.prepare("DELETE FROM refresh_tokens WHERE token = ?").run(refreshToken);
  }
  res.json({ ok: true });
});

// ─── SSO Entra ID (v2) ────────────────────────────────────────────────────────

// Inicia fluxo SSO: detecta tenant pelo e-mail e redireciona ao Azure AD
router.get("/sso/login", (req, res) => {
  const { email } = req.query;
  const company = ssoService.companyFromEmail(email || "");

  if (!company) {
    return res.status(400).json({ error: "E-mail inválido ou domínio não autorizado." });
  }

  if (!ssoService.isConfigured(company)) {
    return res.status(503).json({ error: "SSO não configurado para este domínio." });
  }

  const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/sso/callback`;
  const { url } = ssoService.buildAuthUrl(company, redirectUri);
  res.redirect(url);
});

// Callback do Azure AD após autenticação
router.get("/sso/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.status(401).json({ error: `SSO negado: ${oauthError}` });
  }

  // Valida e consome o state (anti-CSRF)
  const stateEntry = ssoService.consumeState(state);
  if (!stateEntry) {
    return res.status(400).json({ error: "State inválido ou expirado." });
  }

  const { company } = stateEntry;
  const redirectUri = `${req.protocol}://${req.get("host")}/api/auth/sso/callback`;

  let payload;
  try {
    const tokens = await ssoService.exchangeCode(company, code, redirectUri);
    payload = ssoService.decodeAndValidateIdToken(tokens.id_token, company);
  } catch (err) {
    console.error("[sso] Erro no callback:", err.message);
    return res.status(401).json({ error: "Autenticação SSO falhou." });
  }

  const oid = payload.oid || payload.sub;
  if (!oid) return res.status(401).json({ error: "Token sem identificador de usuário." });

  const user = db
    .prepare("SELECT id, name, email, is_admin, is_ti, status, weekly_office_days FROM users WHERE entra_oid = ?")
    .get(oid);

  if (!user) {
    return res.status(401).json({ error: "Usuário não encontrado. Solicite acesso ao administrador." });
  }

  if (user.status === "pending") {
    return res.status(403).json({ error: "Seu acesso está pendente de aprovação." });
  }

  if (user.status === "revoked") {
    return res.status(403).json({ error: "Seu acesso foi revogado. Contate o administrador." });
  }

  const tokenPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    is_admin: user.is_admin,
    is_ti: user.is_ti,
    weekly_office_days: user.weekly_office_days ?? 3,
  };

  // Emite JWT + refresh token (igual ao fluxo de login normal) (#11)
  const { token, refreshToken } = issueTokens(tokenPayload);

  // Armazena em código de uso único — evita JWT na URL (#4)
  const ssoCode = ssoService.storeSsoCode(token, refreshToken, tokenPayload);
  res.redirect(`/?sso_code=${ssoCode}`);
});

module.exports = router;
