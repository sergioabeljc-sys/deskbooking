# Story 2.1 — Fluxo de Pedido de Acesso

**Epic:** 2 — Autenticação SSO e Fluxo de Aprovação de Acesso
**Story ID:** 2.1
**Status:** in-progress
**Baseline commit:** 165da7376a0500999a583809e62334001cf814b5
**Criado em:** 2026-06-22

---

## User Story

Como usuário novo do sistema,
quero submeter meu e-mail corporativo para solicitar acesso,
para que um admin possa aprovar minha conta antes de eu fazer login.

---

## Critérios de Aceite

- **AC1:** `POST /api/auth/request-access` aceita `@tendaatacado.com.br` e `@voxcred.com.br`; rejeita outros domínios com erro genérico
- **AC2:** Cria registro em `access_requests` com status `pending`
- **AC3:** Envia e-mail para todos os admins via `emailService` (template `access-request`)
- **AC4:** Resposta ao usuário é sempre genérica — não confirma nem nega existência de conta
- **AC5:** Pedido duplicado (mesmo e-mail, status pending) retorna 200 sem criar novo registro
- **AC6:** `utils/validate.js` recebe função `validateRequestEmail` que aceita ambos os domínios

---

## Definição de Pronto

- [ ] `validateRequestEmail` em `utils/validate.js`
- [ ] `POST /api/auth/request-access` implementado em `routes/auth.js`
- [ ] `tests/access-request.test.js` com testes de integração
- [ ] `npm test` — 0 regressões
