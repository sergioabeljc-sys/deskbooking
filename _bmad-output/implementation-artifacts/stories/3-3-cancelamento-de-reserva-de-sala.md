# Story 3.3 — Cancelamento de Reserva de Sala

**Epic:** 3 — Salas de Reunião
**Story ID:** 3.3
**Status:** in-progress
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** DELETE /api/rooms/bookings/:id cancela reserva; usuário comum só cancela a própria e apenas até 24h antes
- **AC2:** Admin cancela qualquer reserva sem restrição de prazo
- **AC3:** Notificação por e-mail ao usuário ao cancelar (template booking-cancelled)
- **AC4:** Registro em auditoria

---

## Definição de Pronto

- [x] DELETE /api/rooms/bookings/:id implementado em routes/rooms.js
- [x] `tests/room-cancellation.test.js` com testes de integração
- [x] `npm test` — 0 regressões
