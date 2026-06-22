# Story 4.1 — Gestão de Mesas Fixas e Rotativas (Admin)

**Epic:** 4 — Vagas no Escritório
**Story ID:** 4.1
**Status:** review
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** Admin pode definir tipo de mesa (`fixed` / `rotative`) via PUT /api/desks/:id/type
- **AC2:** Mesa fixa requer `owner_id` (usuário existente); campo `rotative_days` é zerado
- **AC3:** Mesa rotativa pode ter `owner_id = null`; `rotative_days` é preservado
- **AC4:** Retorna 404 se mesa não encontrada, 400 se tipo inválido

---

## Definição de Pronto

- [x] Endpoint implementado em routes/desks.js
- [x] tests/desk-type.test.js com testes de integração
- [x] npm test — 0 regressões
