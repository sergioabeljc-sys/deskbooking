-- Migração 006: Departamentos com controle de acesso a vagas
CREATE TABLE IF NOT EXISTS departments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  can_book_spot INTEGER NOT NULL DEFAULT 0,
  updated_by    INTEGER REFERENCES users(id),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO departments (name, can_book_spot) VALUES
  ('Suprimentos', 1),
  ('Auditoria', 1),
  ('RH', 1);
