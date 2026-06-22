# Story 1.3 — Módulo de E-mail

**Epic:** 1 — Fundação v2: Migração e Infraestrutura
**Story ID:** 1.3
**Status:** review
**Baseline commit:** 165da7376a0500999a583809e62334001cf814b5
**Criado em:** 2026-06-22

---

## User Story

Como desenvolvedor do sistema Desk Booking,
quero um serviço de e-mail isolado, configurável via SMTP e com retry automático,
para que todos os módulos da v2 possam enviar notificações sem acoplar lógica de transporte.

---

## Critérios de Aceite

- **AC1:** Configuração via env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- **AC2:** Função `sendEmail(to, template, data)` disponível para outros módulos
- **AC3:** Templates implementados: `access-request`, `access-approved`, `access-refused`, `booking-confirmed`, `booking-cancelled`
- **AC4:** Falha no envio não lança exceção para o chamador; retenta até 3x com backoff de 30s
- **AC5:** Quando SMTP não configurado (vars vazias), log de aviso e skip silencioso — sem erro
- **AC6:** Testes unitários com mock de transporte SMTP validam chamadas por template

---

## Arquivos

- **INSTALAR:** `nodemailer` (dependência de produção)
- **CRIAR:** `services/emailService.js`
- **CRIAR:** `tests/emailService.test.js`

---

## Definição de Pronto

- [x] `nodemailer` instalado e no `package.json`
- [x] `services/emailService.js` com `sendEmail` + 5 templates + retry queue
- [x] `tests/emailService.test.js` com mock do transporte
- [x] `npm test` passa — 0 regressões

## Dev Agent Record

**Implementado em:** 2026-06-22
**Completion Notes:**
- `nodemailer` instalado como dependência de produção
- `services/emailService.js` criado com: criação de transporter SMTP, 5 templates, retry queue em memória (3 tentativas, 30s backoff), skip silencioso quando SMTP não configurado
- `retryTimer.unref()` garante que o timer não impede o processo de encerrar
- `NODE_ENV=test` desativa o setInterval de retry automaticamente
- `tests/emailService.test.js` com 12 testes cobrindo todos os ACs (mock do `nodemailer.createTransport`)
- 87/87 testes passando (7 suites)

**Arquivos criados/modificados:**
- `services/emailService.js` — CRIADO
- `tests/emailService.test.js` — CRIADO
- `package.json` — MODIFICADO (nodemailer adicionado)
