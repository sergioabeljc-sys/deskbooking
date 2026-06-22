const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath =
  process.env.NODE_ENV === "test"
    ? ":memory:"
    : process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, "data.db");

if (process.env.NODE_ENV === "production" && !process.env.DB_PATH) {
  console.warn(
    "⚠️  AVISO: DB_PATH não definido. Usando ./data.db no diretório da aplicação.\n" +
    "   Em produção, aponte DB_PATH para um volume persistente para evitar perda de dados."
  );
}
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

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migrations incrementais
try { db.exec("ALTER TABLE users ADD COLUMN is_ti INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN weekly_office_days INTEGER DEFAULT 3"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS ti_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    location TEXT NOT NULL CHECK(location IN ('home','sp','itaqua')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER NOT NULL,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Sistema de Migrations Versionadas ───────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const migrationsDir = path.join(__dirname, "db", "migrations");

if (fs.existsSync(migrationsDir)) {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = db
    .prepare("SELECT filename FROM schema_version")
    .all()
    .map((r) => r.filename);

  const runMigration = db.transaction((filename, sql) => {
    db.exec(sql);
    db.prepare("INSERT INTO schema_version (filename) VALUES (?)").run(filename);
  });

  for (const file of files) {
    if (!applied.includes(file)) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      runMigration(file, sql);
      console.log(`[db] Migration aplicada: ${file}`);
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────

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
