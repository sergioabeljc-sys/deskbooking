# Story 1.2 — Middleware RBAC

**Epic:** 1 — Fundação v2: Migração e Infraestrutura
**Story ID:** 1.2
**Status:** review
**Baseline commit:** 165da7376a0500999a583809e62334001cf814b5
**Criado em:** 2026-06-22

---

## User Story

Como desenvolvedor do sistema Desk Booking,
quero um middleware de controle de acesso baseado em perfil, departamento e propriedade de recurso,
para que as rotas da v2 possam ser protegidas de forma declarativa e centralizada.

---

## Contexto Técnico

O sistema v1 usa `authMiddleware` e `adminMiddleware` do `middleware/auth.js`. Esses serão mantidos intactos para compatibilidade com as rotas v1. O novo `middleware/rbac.js` expõe três funções adicionais para as rotas v2, validando sempre no banco — nunca apenas no payload do JWT.

---

## Critérios de Aceite

- **AC1:** `requireRole('admin')` retorna 403 para usuários não-admin; consulta `is_admin` no banco
- **AC2:** `requireDepartmentAccess()` retorna 403 se `can_book_spot = 0` para o departamento do usuário; consulta tabela `departments`
- **AC3:** `requireDepartmentAccess()` retorna 403 se o usuário não tiver departamento definido
- **AC4:** `requireOwnerOrAdmin(getResourceUserId)` permite acesso ao dono do recurso ou admin; bloqueia outros com 403
- **AC5:** Token ausente ou inválido retorna 401 (responsabilidade do `authMiddleware` existente — testar integração)
- **AC6:** Testes unitários cobrem todos os cenários de cada função (autorizado, não autorizado, token ausente)

---

## Arquivos

- **CRIAR:** `middleware/rbac.js`
- **CRIAR:** `tests/rbac.test.js`
- **NÃO MODIFICAR:** `middleware/auth.js` (compatibilidade v1)

---

## Definição de Pronto

- [x] `middleware/rbac.js` criado com as 3 funções
- [x] `tests/rbac.test.js` com testes unitários (mock req/res/next + mock DB)
- [x] `npm test` passa — 0 regressões

## Dev Agent Record

**Implementado em:** 2026-06-22
**Completion Notes:**
- `middleware/rbac.js` criado com `requireRole`, `requireDepartmentAccess`, `requireOwnerOrAdmin`
- Todas as funções consultam o banco (não confiam apenas no JWT)
- `tests/rbac.test.js` com 15 casos de teste cobrindo todos os ACs
- 75/75 testes passando (6 suites — rbac + migrations + auth + bookings + desks + ti)

**Arquivos criados:**
- `middleware/rbac.js` — CRIADO
- `tests/rbac.test.js` — CRIADO
