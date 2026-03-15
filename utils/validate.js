// Validadores reutilizáveis para inputs do sistema
// Email: RFC 5321 parcial, sem ReDoS, max 254 chars
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

const ALLOWED_DOMAIN = "voxcred.com.br";

function validateEmail(email) {
  if (!email || typeof email !== "string") return "E-mail obrigatório";
  if (email.length > 254) return "E-mail muito longo";
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return "Formato de e-mail inválido";
  if (!normalized.endsWith("@" + ALLOWED_DOMAIN)) return `Apenas e-mails @${ALLOWED_DOMAIN} são permitidos`;
  return null;
}

function validateName(name, label = "Nome") {
  if (!name || typeof name !== "string") return `${label} obrigatório`;
  const t = name.trim();
  if (t.length < 2) return `${label} deve ter ao menos 2 caracteres`;
  if (t.length > 100) return `${label} deve ter no máximo 100 caracteres`;
  return null;
}

// Senha: mín 6 (requisito atual), máx 128 para prevenir bcrypt DoS
function validatePassword(password) {
  if (!password || typeof password !== "string") return "Senha obrigatória";
  if (password.length < 6) return "Senha deve ter ao menos 6 caracteres";
  if (password.length > 128) return "Senha muito longa";
  return null;
}

function validatePosInt(value, label, min = 1, max = 50) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    return `${label} deve ser um inteiro entre ${min} e ${max}`;
  return null;
}

module.exports = { validateEmail, validateName, validatePassword, validatePosInt };
