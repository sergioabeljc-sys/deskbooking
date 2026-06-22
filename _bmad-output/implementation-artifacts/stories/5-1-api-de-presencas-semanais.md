# Story 5.1 — API de Presenças Semanais

**Epic:** 5 — Visão Semanal de Presenças
**Story ID:** 5.1
**Status:** review
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** GET /api/spots/week?start=YYYY-MM-DD retorna presenças confirmadas seg–sex
- **AC2:** Resposta inclui por dia: name, email, company, start_time, end_time
- **AC3:** Sem start → usa segunda-feira da semana atual
- **AC4:** Qualquer usuário autenticado pode chamar

---

## Definição de Pronto

- [x] Endpoint implementado em routes/spots.js
- [x] tests/week.test.js com testes de integração
- [x] npm test — 0 regressões
