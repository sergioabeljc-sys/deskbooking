process.env.NODE_ENV = "test";

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

function applyMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = path.join(__dirname, "..", "db", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = db
    .prepare("SELECT filename FROM schema_version")
    .all()
    .map((r) => r.filename);

  const run = db.transaction((filename, sql) => {
    db.exec(sql);
    db.prepare("INSERT INTO schema_version (filename) VALUES (?)").run(filename);
  });

  for (const file of files) {
    if (!applied.includes(file)) {
      run(file, fs.readFileSync(path.join(migrationsDir, file), "utf8"));
    }
  }
}

describe("Migrations v2", () => {
  let db;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Simula schema v1 existente
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        is_ti INTEGER DEFAULT 0,
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
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (desk_id) REFERENCES desks(id),
        UNIQUE(desk_id, date)
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER NOT NULL,
        actor_name TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  });

  afterEach(() => db.close());

  it("aplica todas as migrações sem erro", () => {
    expect(() => applyMigrations(db)).not.toThrow();
  });

  it("é idempotente: rodar duas vezes não gera erro", () => {
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
  });

  it("cria tabelas novas da v2", () => {
    applyMigrations(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    expect(tables).toContain("rooms");
    expect(tables).toContain("room_bookings");
    expect(tables).toContain("spot_bookings");
    expect(tables).toContain("spot_capacity");
    expect(tables).toContain("departments");
    expect(tables).toContain("access_requests");
  });

  it("adiciona colunas novas em users", () => {
    applyMigrations(db);
    const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
    expect(cols).toContain("company");
    expect(cols).toContain("department");
    expect(cols).toContain("entra_oid");
    expect(cols).toContain("entra_tenant");
    expect(cols).toContain("status");
  });

  it("adiciona colunas novas em desks", () => {
    applyMigrations(db);
    const cols = db.prepare("PRAGMA table_info(desks)").all().map((c) => c.name);
    expect(cols).toContain("type");
    expect(cols).toContain("owner_id");
    expect(cols).toContain("rotative_days");
  });

  it("insere seed de departamentos com can_book_spot = 1", () => {
    applyMigrations(db);
    const depts = db
      .prepare("SELECT name, can_book_spot FROM departments ORDER BY name")
      .all();
    expect(depts).toHaveLength(3);
    expect(depts.map((d) => d.name)).toEqual(
      expect.arrayContaining(["Auditoria", "RH", "Suprimentos"])
    );
    depts.forEach((d) => expect(d.can_book_spot).toBe(1));
  });

  it("preserva dados v1 existentes após migração", () => {
    db.prepare(
      "INSERT INTO users (name, email, password_hash) VALUES ('Ana', 'ana@tendaatacado.com.br', 'hash')"
    ).run();
    db.prepare(
      "INSERT INTO desks (name, pos_x, pos_y) VALUES ('Mesa 01', 1, 1)"
    ).run();

    applyMigrations(db);

    expect(db.prepare("SELECT COUNT(*) as c FROM users").get().c).toBe(1);
    expect(db.prepare("SELECT COUNT(*) as c FROM desks").get().c).toBe(1);
    // Dados originais intactos
    const user = db.prepare("SELECT email FROM users").get();
    expect(user.email).toBe("ana@tendaatacado.com.br");
  });

  it("registra todas as migrações aplicadas em schema_version", () => {
    applyMigrations(db);
    const versions = db
      .prepare("SELECT filename FROM schema_version ORDER BY filename")
      .all()
      .map((r) => r.filename);
    expect(versions).toContain("002_v2_users_company.sql");
    expect(versions).toContain("003_v2_desks_type.sql");
    expect(versions).toContain("004_v2_rooms.sql");
    expect(versions).toContain("005_v2_spots.sql");
    expect(versions).toContain("006_v2_departments.sql");
    expect(versions).toContain("007_v2_access_requests.sql");
    expect(versions.length).toBe(6);
  });

  it("não aplica migração já registrada em schema_version", () => {
    applyMigrations(db);
    const countBefore = db
      .prepare("SELECT COUNT(*) as c FROM schema_version")
      .get().c;

    applyMigrations(db); // segunda vez

    const countAfter = db
      .prepare("SELECT COUNT(*) as c FROM schema_version")
      .get().c;
    expect(countAfter).toBe(countBefore);
  });
});
