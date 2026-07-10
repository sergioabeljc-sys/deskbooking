-- Migração 009: SSO state e code stores persistentes (sobrevivem a restarts)
CREATE TABLE IF NOT EXISTS sso_states (
  state      TEXT PRIMARY KEY,
  company    TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sso_codes (
  code         TEXT PRIMARY KEY,
  token        TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  user_json    TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
