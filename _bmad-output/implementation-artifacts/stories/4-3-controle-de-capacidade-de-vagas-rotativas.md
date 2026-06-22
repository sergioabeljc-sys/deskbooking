# Story 4.3 — Controle de Capacidade de Vagas Rotativas

**Epic:** 4 — Vagas no Escritório
**Story ID:** 4.3
**Status:** review
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** Admin pode definir capacidade por dia da semana ou data específica via PUT /api/admin/spot-capacity
- **AC2:** GET /api/admin/spot-capacity lista todas as entradas de capacidade
- **AC3:** Data específica tem prioridade sobre dia da semana no cálculo
- **AC4:** Capacidade mínima é 0 (bloqueia novas reservas)

---

## Definição de Pronto

- [x] Endpoints implementados em routes/admin.js
- [x] tests/desk-type.test.js cobre os casos de capacidade
- [x] npm test — 0 regressões
