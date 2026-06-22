# Story 6.1 — Notificações de Reserva e Cancelamento

**Epic:** 6 — Notificações por E-mail
**Story ID:** 6.1
**Status:** review
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** E-mail "booking-confirmed" enviado ao usuário após reserva de sala de reunião
- **AC2:** E-mail "booking-confirmed" enviado ao usuário após reserva de vaga no escritório
- **AC3:** E-mail "booking-cancelled" enviado ao titular quando admin cancela reserva de sala
- **AC4:** E-mail "booking-cancelled" enviado ao titular quando admin cancela vaga de escritório

---

## Definição de Pronto

- [x] sendEmail integrado em routes/rooms.js (POST /:id/bookings e DELETE /bookings/:id)
- [x] sendEmail integrado em routes/spots.js (POST /bookings e DELETE /bookings/:id)
- [x] emailService mockado nos testes; npm test — 0 regressões
