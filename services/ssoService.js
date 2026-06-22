const crypto = require("crypto");
const { companyFromEmail } = require("../utils/validate");

// ─── Configuração por tenant ──────────────────────────────────────────────────

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

// ─── State store (anti-CSRF) ──────────────────────────────────────────────────
// Map<state, { company, expiresAt }>
const stateStore = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos

// Limpeza periódica de states expirados (não bloqueia o processo)
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of stateStore) {
      if (val.expiresAt < now) stateStore.delete(key);
    }
  }, 60_000).unref();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tenantConfig(company) {
  return TENANTS[company] || null;
}

function isConfigured(company) {
  const cfg = tenantConfig(company);
  return !!(cfg?.clientId && cfg?.clientSecret && cfg?.tenantId);
}

function buildAuthUrl(company, redirectUri) {
  const cfg = tenantConfig(company);
  const state = crypto.randomBytes(32).toString("hex");
  stateStore.set(state, { company, expiresAt: Date.now() + STATE_TTL_MS });

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
  const entry = stateStore.get(state);
  if (!entry) return null;
  stateStore.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

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
 * Valida iss, aud e exp.
 */
function decodeAndValidateIdToken(idToken, company) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token malformado");

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));

  const cfg = tenantConfig(company);
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && payload.exp < now) throw new Error("id_token expirado");
  if (payload.aud && payload.aud !== cfg.clientId)
    throw new Error("id_token: aud inválido");

  return payload;
}

module.exports = {
  companyFromEmail,
  isConfigured,
  buildAuthUrl,
  consumeState,
  exchangeCode,
  decodeAndValidateIdToken,
  _stateStore: stateStore,
};
