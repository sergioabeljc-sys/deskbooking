# Story 4.5 — Reserva de Vaga no Escritório

**Epic:** 4 — Vagas no Escritório
**Story ID:** 4.5
**Status:** review
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** Usuário autenticado com departamento habilitado pode reservar via POST /api/spots/bookings
- **AC2:** Aceita array de datas; horário entre 08:00–18:00; duração mínima 30min; antecedência máxima 30 dias
- **AC3:** Duplicatas bloqueadas por usuário/data; sem vagas disponíveis → erro por data
- **AC4:** Transação SQLite previne race conditions; e-mail de confirmação enviado após reserva

---

## Definição de Pronto

- [x] Endpoint implementado em routes/spots.js
- [x] tests/spots.test.js com testes de integração
- [x] npm test — 0 regressões
