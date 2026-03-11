const Database = require("better-sqlite3");
const path = require("path");

const dbPath =
  process.env.NODE_ENV === "test"
    ? ":memory:"
    : process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, "data.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS desks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pos_x INTEGER NOT NULL,
    pos_y INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    desk_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (desk_id) REFERENCES desks(id) ON DELETE CASCADE,
    UNIQUE(desk_id, date)
  );
`);

// Seed default desks if none exist
const deskCount = db.prepare("SELECT COUNT(*) as count FROM desks").get();
if (deskCount.count === 0) {
  const insert = db.prepare("INSERT INTO desks (name, pos_x, pos_y) VALUES (?, ?, ?)");
  const defaultDesks = [
    ["Mesa 01", 1, 1], ["Mesa 02", 2, 1], ["Mesa 03", 3, 1], ["Mesa 04", 4, 1],
    ["Mesa 05", 1, 2], ["Mesa 06", 2, 2], ["Mesa 07", 3, 2], ["Mesa 08", 4, 2],
    ["Mesa 09", 1, 3], ["Mesa 10", 2, 3], ["Mesa 11", 3, 3], ["Mesa 12", 4, 3],
  ];
  defaultDesks.forEach(([name, x, y]) => insert.run(name, x, y));
}

module.exports = db;
