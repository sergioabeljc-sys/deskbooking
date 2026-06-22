# Story 4.6 — Cancelamento de Vaga

**Epic:** 4 — Vagas no Escritório
**Story ID:** 4.6
**Status:** review
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** Usuário cancela própria vaga via DELETE /api/spots/bookings/:id com mínimo 24h de antecedência
- **AC2:** Admin cancela qualquer vaga sem restrição de prazo
- **AC3:** Admin que cancela vaga de outro usuário dispara e-mail de notificação ao titular
- **AC4:** Reserva já cancelada retorna 409

---

## Definição de Pronto

- [x] Endpoint implementado em routes/spots.js
- [x] tests/spots.test.js com testes de integração
- [x] npm test — 0 regressões
