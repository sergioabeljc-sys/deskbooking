const crypto = require("crypto");
const db = require("../db");
const { companyFromEmail } = require("../utils/validate");

// ─── Configuração por tenant ──────────���───────────────────────────────────────

const TENANTS = {
  tenda: {
    clientId: process.env.ENTRA_TENDA_CLIENT_ID,
    clientSecret: process.env.ENTRA_TENDA_CLIENT_SECRET,
    tenantId: process.env.ENTRA_TENDA_TENANT_ID,
  },
  voxcred: {
    clientId: process.env.ENTRA_VOXCRED_CLIENT_ID,
    clientSecret: process.env.ENTRA_VOXCRED_CLIENT_SECRET,
    tenantId: process.env.ENTRA_VOXCRED_TENANT_ID,
  },
};

const STATE_TTL_MS    = 10 * 60 * 1000; // 10 minutos
const SSO_CODE_TTL_MS =  5 * 60 * 1000; //  5 minutos

// ─── Helpers ���───────────────────────────��─────────────────────────────────────

function tenantConfig(company) {
  return TENANTS[company] || null;
}

function isConfigured(company) {
  const cfg = tenantConfig(company);
  return !!(cfg?.clientId && cfg?.clientSecret && cfg?.tenantId);
}

function isCommonConfigured() {
  return !!(process.env.ENTRA_CLIENT_ID && process.env.ENTRA_CLIENT_SECRET);
}

function detectCompanyFromTid(tid) {
  if (tid && tid === process.env.ENTRA_VOXCRED_TENANT_ID) return "voxcred";
  if (tid && tid === process.env.ENTRA_TENDA_TENANT_ID) return "tenda";
  return null;
}

// ─── Fluxo common (app registration único multi-tenant) ──────────────────────

function buildCommonAuthUrl(redirectUri) {
  const clientId = process.env.ENTRA_CLIENT_ID;
  const state = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();
  db.prepare("INSERT INTO sso_states (state, company, expires_at) VALUES (?, ?, ?)").run(state, "common", expiresAt);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state,
  });

  return { url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}` };
}

async function exchangeCommonCode(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: process.env.ENTRA_CLIENT_ID,
    client_secret: process.env.ENTRA_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }

  return resp.json();
}

function decodeCommonIdToken(idToken) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token malformado");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error("id_token expirado");
  if (payload.nbf && payload.nbf > now + 60) throw new Error("id_token ainda não válido");
  if (payload.aud && payload.aud !== process.env.ENTRA_CLIENT_ID) throw new Error("id_token: aud inválido");
  return payload;
}

// ─── State store — persistido em SQLite (#16) ────────────────────────────────

function buildAuthUrl(company, redirectUri) {
  const cfg = tenantConfig(company);
  const state = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();
  db.prepare("INSERT INTO sso_states (state, company, expires_at) VALUES (?, ?, ?)").run(state, company, expiresAt);

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state,
  });

  return {
    url: `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize?${params}`,
    state,
  };
}

function consumeState(state) {
  const entry = db.prepare("SELECT company, expires_at FROM sso_states WHERE state = ?").get(state);
  if (!entry) return null;
  db.prepare("DELETE FROM sso_states WHERE state = ?").run(state);
  if (new Date(entry.expires_at) < new Date()) return null;
  return { company: entry.company };
}

// ─── SSO code store — troca segura pós-callback (#4, #16) ────────────────────

function storeSsoCode(token, refreshToken, user) {
  const code = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SSO_CODE_TTL_MS).toISOString();
  db.prepare(
    "INSERT INTO sso_codes (code, token, refresh_token, user_json, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).run(code, token, refreshToken, JSON.stringify(user), expiresAt);
  return code;
}

function consumeSsoCode(code) {
  const entry = db.prepare(
    "SELECT token, refresh_token, user_json, expires_at FROM sso_codes WHERE code = ?"
  ).get(code);
  if (!entry) return null;
  db.prepare("DELETE FROM sso_codes WHERE code = ?").run(code);
  if (new Date(entry.expires_at) < new Date()) return null;
  return {
    token: entry.token,
    refreshToken: entry.refresh_token,
    user: JSON.parse(entry.user_json),
  };
}

// ─── Token exchange com Azure AD ─────────────────────────────────────────────

async function exchangeCode(company, code, redirectUri) {
  const cfg = tenantConfig(company);
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const resp = await fetch(
    `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }

  return resp.json();
}

/**
 * Decodifica id_token (sem verificar assinatura — token veio diretamente do
 * endpoint HTTPS do Azure AD com nosso client_secret, portanto confiável).
 * Valida iss, aud, exp e nbf (#5).
 */
function decodeAndValidateIdToken(idToken, company) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token malformado");

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));

  const cfg = tenantConfig(company);
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && payload.exp < now) throw new Error("id_token expirado");
  if (payload.nbf && payload.nbf > now + 60) throw new Error("id_token ainda não válido");
  if (payload.aud && payload.aud !== cfg.clientId) throw new Error("id_token: aud inválido");

  const expectedIss = `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`;
  if (payload.iss && payload.iss !== expectedIss) {
    throw new Error(`id_token: iss inválido (esperado ${expectedIss})`);
  }

  return payload;
}

module.exports = {
  companyFromEmail,
  isConfigured,
  isCommonConfigured,
  detectCompanyFromTid,
  buildAuthUrl,
  buildCommonAuthUrl,
  exchangeCode,
  exchangeCommonCode,
  decodeAndValidateIdToken,
  decodeCommonIdToken,
  consumeState,
  storeSsoCode,
  consumeSsoCode,
};
