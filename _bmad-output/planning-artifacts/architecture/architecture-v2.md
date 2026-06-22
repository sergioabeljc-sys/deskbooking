# Arquitetura Técnica — Desk Booking v2.0

**Data:** 2026-06-22
**Arquiteto:** Winston
**Status:** Aprovado para implementação

---

## 1. Princípios Arquiteturais

- **Boring technology:** manter o stack existente (Node.js + Express + SQLite). Sem reescritas desnecessárias.
- **Migração incremental:** o schema v1 evolui via scripts de migração versionados; sem big bang.
- **Separação de responsabilidades:** cada módulo novo (salas, vagas, e-mail, SSO) tem fronteira clara. O restante do sistema não conhece seus detalhes internos.
- **Segurança no backend:** controles de acesso (perfil, departamento, empresa) validados no servidor — nunca apenas no frontend.

---

## 2. Visão Geral do Sistema

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (SPA HTML/JS)               │
│   Visão Semanal │ Reservas │ Salas │ Admin │ Login/SSO   │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / REST API
┌────────────────────────▼────────────────────────────────┐
│                    Express (Node.js)                     │
│                                                          │
│  routes/          middleware/          services/         │
│  ├─ auth.js       ├─ auth.js          ├─ emailService   │
│  ├─ bookings.js   ├─ audit.js         ├─ ssoService     │
│  ├─ rooms.js  ◄── ├─ validate.js      └─ notifyService  │
│  ├─ spots.js      └─ rbac.js (novo)                     │
│  ├─ desks.js                                            │
│  ├─ users.js                                            │
│  └─ admin.js                                            │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   SQLite (better-sqlite3)                │
│              data.db — schema v2 (migrado)              │
└─────────────────────────────────────────────────────────┘

Serviços externos:
  ├─ SMTP Office 365 (e-mail)
  ├─ Entra ID Tenda Atacado (OAuth 2.0/OIDC)
  └─ Entra ID Voxcred (OAuth 2.0/OIDC)
```

---

## 3. Schema do Banco de Dados (v2)

### 3.1 Tabelas existentes — alterações

#### `users` — colunas adicionadas
```sql
ALTER TABLE users ADD COLUMN company TEXT;        -- 'tenda' | 'voxcred'
ALTER TABLE users ADD COLUMN department TEXT;
ALTER TABLE users ADD COLUMN entra_oid TEXT;      -- object ID do Entra ID
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';
  -- 'pending' | 'active' | 'revoked'
ALTER TABLE users ADD COLUMN entra_tenant TEXT;   -- 'tenda' | 'voxcred'
```

#### `desks` — colunas adicionadas
```sql
ALTER TABLE desks ADD COLUMN type TEXT DEFAULT 'rotative';
  -- 'fixed' | 'rotative'
ALTER TABLE desks ADD COLUMN owner_id INTEGER REFERENCES users(id);
ALTER TABLE desks ADD COLUMN rotative_days TEXT DEFAULT '[]';
  -- JSON: ["mon","tue","wed","thu","fri"] — dias em que mesa fixa vira rotativa
```

### 3.2 Tabelas novas

#### `rooms` — Salas de Reunião
```sql
CREATE TABLE rooms (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  capacity    INTEGER NOT NULL DEFAULT 4,
  resources   TEXT NOT NULL DEFAULT '["TV"]',  -- JSON array de strings
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### `room_bookings` — Reservas de Sala
```sql
CREATE TABLE room_bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id     INTEGER NOT NULL REFERENCES rooms(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  date        TEXT NOT NULL,          -- YYYY-MM-DD
  start_time  TEXT NOT NULL,          -- HH:MM
  end_time    TEXT NOT NULL,          -- HH:MM
  status      TEXT NOT NULL DEFAULT 'confirmed',  -- 'confirmed' | 'cancelled'
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),

  -- Constraint: sem sobreposição (verificada no código + índice)
  CHECK (start_time >= '08:00' AND end_time <= '18:00'),
  CHECK (end_time > start_time)
);
CREATE INDEX idx_room_bookings_room_date ON room_bookings(room_id, date, status);
```

#### `spot_bookings` — Reservas de Vaga no Escritório
```sql
CREATE TABLE spot_bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  date        TEXT NOT NULL,          -- YYYY-MM-DD
  start_time  TEXT NOT NULL,          -- HH:MM
  end_time    TEXT NOT NULL,          -- HH:MM
  status      TEXT NOT NULL DEFAULT 'confirmed',  -- 'confirmed' | 'cancelled'
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),

  CHECK (start_time >= '08:00' AND end_time <= '18:00'),
  CHECK (end_time > start_time),
  UNIQUE (user_id, date)  -- um usuário, uma vaga por dia
);
CREATE INDEX idx_spot_bookings_date ON spot_bookings(date, status);
```

#### `spot_capacity` — Capacidade de Vagas Rotativas por Dia
```sql
CREATE TABLE spot_capacity (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  day_of_week  TEXT,       -- 'mon'|'tue'|'wed'|'thu'|'fri' (padrão da semana)
  specific_date TEXT,      -- YYYY-MM-DD (sobrescreve o padrão para datas específicas)
  capacity     INTEGER NOT NULL,
  updated_by   INTEGER REFERENCES users(id),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),

  CHECK (day_of_week IS NOT NULL OR specific_date IS NOT NULL)
);
```

#### `departments` — Departamentos com Acesso a Vagas
```sql
CREATE TABLE departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  can_book_spot INTEGER NOT NULL DEFAULT 0,  -- 0 = bloqueado, 1 = habilitado
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed inicial
INSERT INTO departments (name, can_book_spot) VALUES
  ('Suprimentos', 1),
  ('Auditoria', 1),
  ('RH', 1);
```

#### `access_requests` — Pedidos de Acesso Pendentes
```sql
CREATE TABLE access_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  company     TEXT NOT NULL,     -- 'tenda' | 'voxcred'
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'approved'|'refused'
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 4. Autenticação e SSO

### 4.1 Fluxo de Primeiro Acesso

```
Usuário informa e-mail
        │
        ▼
Sistema valida domínio
  @tendaatacado.com.br → company = 'tenda'
  @voxcred.com.br      → company = 'voxcred'
  outro domínio        → erro: "E-mail não autorizado"
        │
        ▼
Cria registro em access_requests (status: pending)
        │
        ▼
Envia e-mail para todos os admins: "Novo pedido de acesso"
        │
        ▼
Admin aprova → cria user (status: active) + vincula entra_oid
Admin recusa → access_request.status = 'refused' + notifica usuário
```

### 4.2 Fluxo de Login SSO (após aprovação)

```
Usuário clica "Entrar com Microsoft"
        │
        ▼
Backend detecta domínio do e-mail cadastrado
  company = 'tenda'   → redirect para tenant Tenda Atacado
  company = 'voxcred' → redirect para tenant Voxcred
        │
        ▼
Entra ID autentica o usuário (OAuth 2.0 Authorization Code + PKCE)
        │
        ▼
Callback /auth/sso/callback?tenant={tenda|voxcred}
  Valida state (CSRF)
  Troca code por tokens
  Valida id_token (iss, aud, exp)
  Extrai oid do token → busca user por entra_oid
        │
        ▼
Gera JWT interno (exp: 8h) → retorna ao frontend
```

### 4.3 Configuração por Tenant (variáveis de ambiente)

```
# Tenda Atacado
ENTRA_TENDA_CLIENT_ID=...
ENTRA_TENDA_CLIENT_SECRET=...
ENTRA_TENDA_TENANT_ID=...

# Voxcred
ENTRA_VOXCRED_CLIENT_ID=...
ENTRA_VOXCRED_CLIENT_SECRET=...
ENTRA_VOXCRED_TENANT_ID=...

# Login local (fallback admin)
JWT_SECRET=...
```

### 4.4 Middleware RBAC (novo: `middleware/rbac.js`)

```js
// Uso nas rotas:
requireRole('admin')           // apenas admins
requireDepartmentAccess()      // valida can_book_spot do departamento do user
requireOwnerOrAdmin()          // dono do recurso ou admin
```

---

## 5. Módulo de E-mail (`services/emailService.js`)

### Transporte
- **Provedor:** SMTP Office 365 corporativo
- **Lib:** `nodemailer` (reintroduzido, mas isolado em `emailService`)
- **Configuração via env:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

### Fila de retentativa
- Implementação simples com array em memória + `setInterval` de retry (3 tentativas, backoff de 30s)
- Sem dependência de Redis/Bull — adequado ao porte do sistema

### Eventos notificados
| Evento | Destinatário |
|---|---|
| Novo pedido de acesso | Todos os admins |
| Pedido aprovado / recusado | Usuário solicitante |
| Reserva de vaga confirmada | Usuário |
| Reserva de sala confirmada | Usuário |
| Reserva de vaga cancelada | Usuário |
| Reserva de sala cancelada | Usuário |
| Sala excluída com reservas futuras | Usuários afetados |

---

## 6. Novos Módulos de Rota

### `routes/rooms.js` — Salas de Reunião
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/rooms` | Autenticado | Lista salas ativas com disponibilidade |
| POST | `/api/rooms` | Admin | Cria sala |
| PUT | `/api/rooms/:id` | Admin | Edita sala |
| DELETE | `/api/rooms/:id` | Admin | Desativa/exclui sala |
| GET | `/api/rooms/:id/availability` | Autenticado | Slots disponíveis por data |
| POST | `/api/rooms/:id/bookings` | Autenticado | Reserva sala |
| DELETE | `/api/rooms/bookings/:id` | Dono ou Admin | Cancela reserva de sala |

### `routes/spots.js` — Vagas no Escritório
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/spots/availability` | Autenticado | Vagas disponíveis por data (ou semana) |
| POST | `/api/spots/bookings` | Depto habilitado | Reserva vaga (aceita array de datas) |
| DELETE | `/api/spots/bookings/:id` | Dono ou Admin | Cancela reserva de vaga |
| GET | `/api/spots/week` | Autenticado | Presenças da semana (visão semanal) |

### `routes/desks.js` — alterações
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| PUT | `/api/desks/:id/type` | Admin | Define tipo (fixed/rotative) e dono |
| PUT | `/api/desks/:id/rotative-days` | Dono da mesa | Define dias rotativos da semana |

### `routes/auth.js` — alterações
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/auth/request-access` | Público | Submete pedido de acesso |
| GET | `/auth/sso/login` | Público | Inicia fluxo SSO (param: email) |
| GET | `/auth/sso/callback` | Público | Callback OAuth Entra ID |

### `routes/admin.js` — ampliado
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/admin/access-requests` | Admin | Lista pedidos pendentes |
| POST | `/api/admin/access-requests/:id/approve` | Admin | Aprova + vincula Entra ID |
| POST | `/api/admin/access-requests/:id/refuse` | Admin | Recusa pedido |
| GET | `/api/admin/departments` | Admin | Lista departamentos e acesso |
| PUT | `/api/admin/departments/:id` | Admin | Habilita/desabilita departamento |
| PUT | `/api/admin/spot-capacity` | Admin | Ajusta capacidade de vagas |

---

## 7. Lógica Crítica de Negócio

### 7.1 Detecção de Conflito de Sala (sem double-booking)
```
-- Verificação transacional (SQLite WAL mode recomendado)
SELECT id FROM room_bookings
WHERE room_id = ?
  AND date = ?
  AND status = 'confirmed'
  AND NOT (end_time <= ? OR start_time >= ?)
  -- (end_time da existente <= start_time nova) OR (start_time existente >= end_time nova)
LIMIT 1;
-- Se retornar resultado: conflito → rejeitar
```

### 7.2 Cálculo de Vagas Rotativas Disponíveis por Dia
```
vagas_totais     = spot_capacity para o dia (specific_date > day_of_week)
mesas_rotativas  = COUNT(desks WHERE type='rotative')
                 + COUNT(desks WHERE type='fixed' AND day_of_week IN rotative_days)
pool_efetivo     = MIN(vagas_totais, mesas_rotativas)
reservas_ativas  = COUNT(spot_bookings WHERE date=? AND status='confirmed')
disponíveis      = pool_efetivo - reservas_ativas
```

### 7.3 Reversão de Mesa Fixa → Fixa (bloquear se esgotado)
```
Se dono quer remover dia do rotative_days:
  disponíveis = cálculo acima para aquele dia
  Se disponíveis > 0:
    → permite (remove o dia de rotative_days)
  Senão:
    → bloqueia com mensagem "Não é possível reverter: vagas esgotadas para este dia"
```

### 7.4 Duração Mínima (30 min)
```
Validação em middleware/validate.js:
  diff = parse(end_time) - parse(start_time)
  if (diff < 30 * 60 * 1000) → erro 400
```

---

## 8. Frontend — Telas Novas/Modificadas

| Tela | Tipo | Descrição |
|---|---|---|
| `login.html` | Modificada | Adiciona botão "Entrar com Microsoft" + fluxo de pedido de acesso |
| `week.html` | Nova (tela principal) | Visão semanal: colunas = dias, linhas = pessoas; exibe empresa + e-mail |
| `rooms.html` | Nova | Listagem de salas com slots de horário; reserva com time picker |
| `spot-booking.html` | Nova | Seleção de data(s) + horário; exibe vagas disponíveis |
| `admin-rooms.html` | Nova | CRUD de salas (admin) |
| `admin-access.html` | Nova | Aprovação/recusa de pedidos de acesso (admin) |
| `admin-departments.html` | Nova | Habilitar/desabilitar departamentos (admin) |
| `desk-settings.html` | Modificada | Dono da mesa configura dias rotativos |

---

## 9. Plano de Migração do Schema

Os scripts de migração ficam em `db/migrations/`:

```
db/
  migrations/
    001_v1_initial.sql        ← já existe (representado pelo schema atual)
    002_v2_users_company.sql  ← ALTER TABLE users (company, department, entra_oid, status, entra_tenant)
    003_v2_desks_type.sql     ← ALTER TABLE desks (type, owner_id, rotative_days)
    004_v2_rooms.sql          ← CREATE TABLE rooms, room_bookings
    005_v2_spots.sql          ← CREATE TABLE spot_bookings, spot_capacity
    006_v2_departments.sql    ← CREATE TABLE departments + seed inicial
    007_v2_access_requests.sql← CREATE TABLE access_requests
```

O `db.js` executa as migrações pendentes na inicialização (lê tabela `schema_version`).

**Dados existentes:** bookings da v1 (reservas de mesa) são preservados na tabela `bookings` original — sem remoção. As novas reservas de vaga usam `spot_bookings`. As duas tabelas coexistem durante a transição.

---

## 10. Segurança

| Risco | Mitigação |
|---|---|
| CSRF no fluxo OAuth | Parâmetro `state` gerado por `crypto.randomBytes(32)`, validado no callback |
| Token leakage | JWT com `exp: 8h`, `httpOnly cookie` opcional; nunca exposto em URL |
| Acesso indevido por departamento | Middleware `requireDepartmentAccess()` valida `can_book_spot` no banco, não no payload do JWT |
| Double-booking de sala | Query de conflito em transação SQLite (WAL mode ativo) |
| Enumeração de e-mails | Resposta genérica no pedido de acesso ("verifique seu e-mail") |
| Domínio não autorizado | Validação de domínio no backend; frontend nunca é fonte de verdade |

---

## 11. Decisões e Justificativas

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| SQLite com migração incremental | PostgreSQL | Volume não justifica; SQLite com WAL é suficiente para <500 usuários |
| Dois App Registrations Entra ID | Multi-tenant Azure | Menor complexidade; roteamento por domínio é simples e auditável |
| SMTP Office 365 corporativo | SendGrid/Resend | Sem custo adicional; volume de e-mails é baixo |
| Fila de retry em memória | Bull/Redis | Sem infra adicional; falhas de e-mail são toleráveis neste porte |
| `spot_bookings` tabela separada | Reusar `bookings` com tipo | Separação clara; não quebra o histórico v1 |

---

## 12. Próximos Passos

1. Criar scripts de migração (`db/migrations/002` a `007`)
2. Implementar `services/ssoService.js` (fluxo OAuth por tenant)
3. Implementar `services/emailService.js` (SMTP + retry)
4. Implementar `middleware/rbac.js`
5. Criar rotas novas (`rooms`, `spots`, `admin`)
6. Criar telas frontend
7. Chamar **Amelia (Dev)** para execução por épicos/stories
