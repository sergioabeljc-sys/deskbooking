# Story 1.1 — Scripts de Migração do Schema v2

**Epic:** 1 — Fundação v2: Migração e Infraestrutura
**Story ID:** 1.1
**Status:** review
**Baseline commit:** 165da7376a0500999a583809e62334001cf814b5
**Criado em:** 2026-06-22

---

## User Story

Como desenvolvedor do sistema Desk Booking,
quero scripts de migração SQL versionados que evoluam o schema v1 para v2,
para que as novas tabelas e colunas da v2.0 existam em produção sem perda de dados históricos.

---

## Contexto de Negócio

Esta é a story fundacional da v2.0. Todos os outros épicos dependem das tabelas e colunas criadas aqui. O sistema atual (v1) usa `db.js` com `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE` em try/catch inline — não há versionamento. Esta story introduz um sistema de migração versionado sem quebrar o banco de dados existente.

---

## Critérios de Aceite

- **AC1:** Pasta `db/migrations/` criada com scripts numerados `002` a `007` (o schema v1 atual = `001` implícito)
- **AC2:** Tabela `schema_version` criada no banco para rastrear migrações aplicadas
- **AC3:** `db.js` executa automaticamente na inicialização todas as migrações pendentes (não aplicadas ainda)
- **AC4:** Tabelas novas criadas: `rooms`, `room_bookings`, `spot_bookings`, `spot_capacity`, `departments`, `access_requests`
- **AC5:** Colunas novas em `users`: `company`, `department`, `entra_oid`, `status`, `entra_tenant`
- **AC6:** Colunas novas em `desks`: `type`, `owner_id`, `rotative_days`
- **AC7:** Seed inicial inserido em `departments`: Suprimentos, Auditoria e RH com `can_book_spot = 1`
- **AC8:** Dados v1 existentes preservados — nenhuma tabela existente é removida ou truncada
- **AC9:** Testes Jest validam que rodar as migrações duas vezes consecutivas não gera erro (idempotência)
- **AC10:** Sistema em `NODE_ENV=test` usa `:memory:` e as migrações rodam corretamente nele também

---

## Análise Técnica

### Estado atual do `db.js`

O arquivo `db.js` (raiz do projeto) faz hoje:
1. Cria conexão `better-sqlite3` com WAL e foreign_keys ON
2. `db.exec()` inline cria as tabelas v1: `users`, `desks`, `bookings`, `refresh_tokens`
3. `try/catch` inline adiciona colunas com `ALTER TABLE` (padrão frágil, sem rastreamento)
4. Cria `ti_schedules` e `audit_log`
5. Seed de 12 mesas padrão

**Este padrão inline será preservado para o schema v1 e a nova lógica de migrações será adicionada logo após, antes do seed de mesas.**

### Abordagem de migração

```
Inicialização do db.js:
  1. Cria tabela schema_version (se não existir)
  2. Lê lista de arquivos em db/migrations/ ordenados por nome
  3. Para cada arquivo, verifica se o nome já está em schema_version
  4. Se não está: executa o SQL em transação, insere o nome em schema_version
  5. Se está: pula (idempotência garantida)
```

### Por que não usar uma lib de migration?

O stack atual não tem nenhuma ORM/migration lib. Adicionar Knex, Flyway, etc. seria over-engineering para o porte do sistema. A abordagem com `schema_version` + arquivos `.sql` é boring technology suficiente.

---

## Arquivos a Criar/Modificar

### MODIFICAR: `db.js`

Adicionar após a criação das tabelas v1 e antes do seed de mesas:

```js
// ─── Sistema de Migrations Versionadas ───────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const fs = require('fs');
const migrationsDir = path.join(__dirname, 'db', 'migrations');

if (fs.existsSync(migrationsDir)) {
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // ordem alfabética = ordem numérica pelo prefixo

  const applied = db.prepare('SELECT filename FROM schema_version').all()
    .map(r => r.filename);

  const runMigration = db.transaction((filename, sql) => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_version (filename) VALUES (?)').run(filename);
  });

  for (const file of files) {
    if (!applied.includes(file)) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      runMigration(file, sql);
      console.log(`[db] Migration aplicada: ${file}`);
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────
```

### CRIAR: `db/migrations/002_v2_users_company.sql`

```sql
-- Migração 002: Adicionar campos de empresa/SSO em users
ALTER TABLE users ADD COLUMN company TEXT;
ALTER TABLE users ADD COLUMN department TEXT;
ALTER TABLE users ADD COLUMN entra_oid TEXT;
ALTER TABLE users ADD COLUMN entra_tenant TEXT;
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';
```

### CRIAR: `db/migrations/003_v2_desks_type.sql`

```sql
-- Migração 003: Adicionar tipo e propriedade em desks
ALTER TABLE desks ADD COLUMN type TEXT DEFAULT 'rotative';
ALTER TABLE desks ADD COLUMN owner_id INTEGER REFERENCES users(id);
ALTER TABLE desks ADD COLUMN rotative_days TEXT DEFAULT '[]';
```

### CRIAR: `db/migrations/004_v2_rooms.sql`

```sql
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
```

### CRIAR: `db/migrations/005_v2_spots.sql`

```sql
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
```

### CRIAR: `db/migrations/006_v2_departments.sql`

```sql
-- Migração 006: Departamentos com controle de acesso a vagas
CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  can_book_spot INTEGER NOT NULL DEFAULT 0,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO departments (name, can_book_spot) VALUES
  ('Suprimentos', 1),
  ('Auditoria', 1),
  ('RH', 1);
```

### CRIAR: `db/migrations/007_v2_access_requests.sql`

```sql
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
```

---

## Testes (Jest)

### CRIAR: `tests/migrations.test.js`

```js
process.env.NODE_ENV = 'test';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function applyMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const applied = db.prepare('SELECT filename FROM schema_version').all().map(r => r.filename);
  const run = db.transaction((filename, sql) => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_version (filename) VALUES (?)').run(filename);
  });
  for (const file of files) {
    if (!applied.includes(file)) {
      run(file, fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    }
  }
}

describe('Migrations v2', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Simula schema v1
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

  it('aplica todas as migrações sem erro', () => {
    expect(() => applyMigrations(db)).not.toThrow();
  });

  it('é idempotente: rodar duas vezes não gera erro', () => {
    applyMigrations(db);
    expect(() => applyMigrations(db)).not.toThrow();
  });

  it('cria tabelas novas da v2', () => {
    applyMigrations(db);
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all().map(r => r.name);
    expect(tables).toContain('rooms');
    expect(tables).toContain('room_bookings');
    expect(tables).toContain('spot_bookings');
    expect(tables).toContain('spot_capacity');
    expect(tables).toContain('departments');
    expect(tables).toContain('access_requests');
  });

  it('adiciona colunas novas em users', () => {
    applyMigrations(db);
    const info = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    expect(info).toContain('company');
    expect(info).toContain('department');
    expect(info).toContain('entra_oid');
    expect(info).toContain('entra_tenant');
    expect(info).toContain('status');
  });

  it('adiciona colunas novas em desks', () => {
    applyMigrations(db);
    const info = db.prepare('PRAGMA table_info(desks)').all().map(c => c.name);
    expect(info).toContain('type');
    expect(info).toContain('owner_id');
    expect(info).toContain('rotative_days');
  });

  it('insere seed de departamentos', () => {
    applyMigrations(db);
    const depts = db.prepare('SELECT name, can_book_spot FROM departments').all();
    expect(depts).toHaveLength(3);
    expect(depts.map(d => d.name)).toEqual(
      expect.arrayContaining(['Suprimentos', 'Auditoria', 'RH'])
    );
    depts.forEach(d => expect(d.can_book_spot).toBe(1));
  });

  it('preserva dados v1 existentes', () => {
    db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('A', 'a@tendaatacado.com.br', 'hash')").run();
    db.prepare("INSERT INTO desks (name, pos_x, pos_y) VALUES ('Mesa 01', 1, 1)").run();
    applyMigrations(db);
    expect(db.prepare('SELECT COUNT(*) as c FROM users').get().c).toBe(1);
    expect(db.prepare('SELECT COUNT(*) as c FROM desks').get().c).toBe(1);
  });

  it('registra migrações aplicadas em schema_version', () => {
    applyMigrations(db);
    const versions = db.prepare('SELECT filename FROM schema_version').all().map(r => r.filename);
    expect(versions).toContain('002_v2_users_company.sql');
    expect(versions).toContain('007_v2_access_requests.sql');
    expect(versions.length).toBe(6); // 002 a 007
  });
});
```

---

## Guardrails para o Desenvolvedor

1. **NÃO** remover ou alterar as tabelas existentes: `users`, `desks`, `bookings`, `refresh_tokens`, `ti_schedules`, `audit_log`
2. **NÃO** usar `DROP TABLE` em nenhum script de migração
3. **NÃO** usar `CREATE TABLE` sem `IF NOT EXISTS` nos scripts SQL
4. Usar `INSERT OR IGNORE` no seed de departamentos — nunca `INSERT` direto
5. O `require('fs')` já vem do Node.js nativo — não adicionar dependência nova
6. O bloco de migração em `db.js` deve ficar **antes** do seed de mesas (linha final do arquivo atual)
7. Os testes de migração usam banco `:memory:` e simulam o schema v1 no `beforeEach` — não importar `db.js` diretamente nos testes de migração para manter isolamento

---

## Ordem de Implementação Recomendada

1. Criar pasta `db/migrations/`
2. Criar os 6 arquivos `.sql` (002 a 007)
3. Modificar `db.js` adicionando o bloco de migrations
4. Criar `tests/migrations.test.js`
5. Rodar `npm test` — todos os testes existentes devem continuar passando
6. Verificar que o servidor sobe sem erro: `npm start`

---

## Definição de Pronto

- [x] `db/migrations/` com 6 arquivos `.sql` criados
- [x] `db.js` executa migrations na inicialização
- [x] `npm test` passa sem regressões (incluindo os testes existentes de auth, bookings, desks, ti)
- [x] `tests/migrations.test.js` com todos os casos do AC9 passando
- [x] Servidor sobe com `npm start` sem erro no terminal

## Dev Agent Record

**Implementado em:** 2026-06-22
**Completion Notes:**
- 6 scripts SQL criados em `db/migrations/` (002–007)
- `db.js` modificado: `require('fs')` adicionado no topo; bloco de migrations versionadas inserido antes do seed de mesas
- `schema_version` rastreia migrações aplicadas via transação atômica
- `tests/migrations.test.js` com 8 casos de teste cobrindo AC1–AC10
- 60/60 testes passando (5 suites — migrations + auth + bookings + desks + ti)
- Banco real validado: 6 migrations aplicadas, 14 tabelas, 3 departamentos seed, idempotência confirmada

**Arquivos modificados/criados:**
- `db.js` — MODIFICADO
- `db/migrations/002_v2_users_company.sql` — CRIADO
- `db/migrations/003_v2_desks_type.sql` — CRIADO
- `db/migrations/004_v2_rooms.sql` — CRIADO
- `db/migrations/005_v2_spots.sql` — CRIADO
- `db/migrations/006_v2_departments.sql` — CRIADO
- `db/migrations/007_v2_access_requests.sql` — CRIADO
- `tests/migrations.test.js` — CRIADO
