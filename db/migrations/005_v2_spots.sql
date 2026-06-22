-- Migração 005: Reservas de vaga no escritório e capacidade
CREATE TABLE IF NOT EXISTS spot_bookings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  date         TEXT NOT NULL,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'confirmed',
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (start_time >= '08:00' AND end_time <= '18:00'),
  CHECK (end_time > start_time),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_spot_bookings_date
  ON spot_bookings(date, status);

CREATE TABLE IF NOT EXISTS spot_capacity (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day_of_week   TEXT,
  specific_date TEXT,
  capacity      INTEGER NOT NULL,
  updated_by    INTEGER REFERENCES users(id),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (day_of_week IS NOT NULL OR specific_date IS NOT NULL)
);
