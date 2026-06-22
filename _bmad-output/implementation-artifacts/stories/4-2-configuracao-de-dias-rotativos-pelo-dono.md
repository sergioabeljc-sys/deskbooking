# Story 4.2 — Configuração de Dias Rotativos pelo Dono

**Epic:** 4 — Vagas no Escritório
**Story ID:** 4.2
**Status:** review
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** Dono da mesa ou admin pode configurar dias rotativos via PUT /api/desks/:id/rotative-days
- **AC2:** Apenas dias válidos aceitos: mon, tue, wed, thu, fri
- **AC3:** Remoção de dia bloqueada se existem reservas futuras que ficariam sem vaga
- **AC4:** Resultado é deduplicado e ordenado

---

## Definição de Pronto

- [x] Endpoint implementado em routes/desks.js
- [x] tests/desk-type.test.js com testes de integração
- [x] npm test — 0 regressões
