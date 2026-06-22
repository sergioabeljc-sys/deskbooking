# Story 3.1 — CRUD de Salas (Admin)

**Epic:** 3 — Salas de Reunião
**Story ID:** 3.1
**Status:** in-progress
**Baseline commit:** (in-progress)
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** POST /api/rooms cria sala com nome, capacidade (padrão: 4) e recursos (padrão: `["TV"]`)
- **AC2:** PUT /api/rooms/:id edita nome, capacidade e recursos
- **AC3:** DELETE /api/rooms/:id desativa sala (active = 0); reservas futuras são canceladas e usuários notificados
- **AC4:** GET /api/rooms retorna salas ativas com capacidade e recursos
- **AC5:** Todas as ações registradas em auditoria
- **AC6:** Rotas protegidas por authMiddleware + requireRole('admin') exceto GET (qualquer auth)

---

## Definição de Pronto

- [x] `routes/rooms.js` criado com CRUD completo
- [x] Montado em `server.js` em `/api/rooms`
- [x] `tests/rooms.test.js` com testes de integração
- [x] `npm test` — 0 regressões

---

## Dev Agent Record

### Completion Notes

- Implementado CRUD completo de salas em `routes/rooms.js`
- GET /api/rooms: qualquer usuário autenticado pode listar salas ativas
- POST/PUT: admin cria e edita salas; recursos armazenados como JSON string, validados
- DELETE: soft-delete (active=0), cancela reservas futuras confirmadas, envia email booking-cancelled
- Auditoria em todas as ações de mutação
- Testes cobrem: criação, edição, desativação, cancelamento em cascata, proteção de rotas

### File List

- routes/rooms.js (novo)
- server.js (modificado — montagem /api/rooms)
- tests/rooms.test.js (novo)
- _bmad-output/implementation-artifacts/sprint-status.yaml (atualizado)
