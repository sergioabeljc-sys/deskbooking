# Story 6.2 — Notificações do Fluxo de Acesso

**Epic:** 6 — Notificações por E-mail
**Story ID:** 6.2
**Status:** review
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** E-mail "access-request" enviado ao admin quando novo pedido de acesso é criado
- **AC2:** E-mail "access-approved" enviado ao solicitante quando admin aprova pedido
- **AC3:** E-mail "access-refused" enviado ao solicitante quando admin recusa pedido

---

## Definição de Pronto

- [x] Implementado em routes/auth.js e routes/admin.js (já existia do Epic 2)
- [x] emailService mockado nos testes; npm test — 0 regressões
