-- Migração 004: Salas de reunião e reservas de sala
CREATE TABLE IF NOT EXISTS rooms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  capacity   INTEGER NOT NULL DEFAULT 4,
  resources  TEXT NOT NULL DEFAULT '["TV"]',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS room_bookings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id      INTEGER NOT NULL REFERENCES rooms(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  date         TEXT NOT NULL,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'confirmed',
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (start_time >= '08:00' AND end_time <= '18:00'),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_room_bookings_room_date
  ON room_bookings(room_id, date, status);
