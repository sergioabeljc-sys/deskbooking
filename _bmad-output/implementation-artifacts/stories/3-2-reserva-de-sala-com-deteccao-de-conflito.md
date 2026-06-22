# Story 3.2 — Reserva de Sala com Detecção de Conflito

**Epic:** 3 — Salas de Reunião
**Story ID:** 3.2
**Status:** in-progress
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** POST /api/rooms/:id/bookings valida: horário 08h–18h, duração >= 30 min, antecedência <= 30 dias
- **AC2:** Detecção de conflito em transação SQLite; se conflito → 409 com next_available slot
- **AC3:** GET /api/rooms/:id/availability?date=YYYY-MM-DD retorna slots livres do dia
- **AC4:** Usuários comuns veem "disponível"/"ocupado" sem detalhes do reservante
- **AC5:** Admins veem nome do reservante, horário e sala

---

## Definição de Pronto

- [x] Endpoints POST /api/rooms/:id/bookings e GET /api/rooms/:id/availability implementados
- [x] Detecção de conflito via transação SQLite
- [x] `tests/room-bookings.test.js` com testes de integração
- [x] `npm test` — 0 regressões
