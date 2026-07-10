-- Migration 010: Preserva reservas passadas ao excluir usuários
-- Recria as 3 tabelas de reservas com user_id nullable + ON DELETE SET NULL,
-- para que registros históricos sobrevivam com user_id = NULL.

-- bookings (originalmente criada em db.js com ON DELETE CASCADE em user_id)
CREATE TABLE bookings_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  desk_id    INTEGER NOT NULL,
  date       TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (desk_id) REFERENCES desks(id) ON DELETE CASCADE,
  UNIQUE(desk_id, date)
);
INSERT INTO bookings_new (id, user_id, desk_id, date)
  SELECT id, user_id, desk_id, date FROM bookings;
DROP TABLE bookings;
ALTER TABLE bookings_new RENAME TO bookings;

-- room_bookings
CREATE TABLE room_bookings_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id      INTEGER NOT NULL REFERENCES rooms(id),
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  date         TEXT NOT NULL,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'confirmed',
  cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (start_time >= '08:00' AND end_time <= '18:00'),
  CHECK (end_time > start_time)
);
INSERT INTO room_bookings_new SELECT * FROM room_bookings;
DROP INDEX IF EXISTS idx_room_bookings_room_date;
DROP TABLE room_bookings;
ALTER TABLE room_bookings_new RENAME TO room_bookings;
CREATE INDEX IF NOT EXISTS idx_room_bookings_room_date ON room_bookings(room_id, date, status);

-- spot_bookings
CREATE TABLE spot_bookings_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  date         TEXT NOT NULL,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'confirmed',
  cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (start_time >= '08:00' AND end_time <= '18:00'),
  CHECK (end_time > start_time)
);
INSERT INTO spot_bookings_new SELECT * FROM spot_bookings;
DROP INDEX IF EXISTS idx_spot_bookings_date;
DROP TABLE spot_bookings;
ALTER TABLE spot_bookings_new RENAME TO spot_bookings;
CREATE INDEX IF NOT EXISTS idx_spot_bookings_date ON spot_bookings(date, status);
