-- Migração 007: Pedidos de acesso pendentes de aprovação
CREATE TABLE IF NOT EXISTS access_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  company     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
