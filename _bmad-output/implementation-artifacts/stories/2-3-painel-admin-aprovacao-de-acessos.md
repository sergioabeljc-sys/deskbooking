# Story 2.3 — Painel Admin: Aprovação de Acessos

**Epic:** 2 — Autenticação SSO e Fluxo de Aprovação de Acesso
**Story ID:** 2.3
**Status:** in-progress
**Baseline commit:** 165da7376a0500999a583809e62334001cf814b5
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** GET /api/admin/access-requests lista pedidos com status pending
- **AC2:** POST /api/admin/access-requests/:id/approve cria user active, vincula entra_oid, notifica solicitante
- **AC3:** POST /api/admin/access-requests/:id/refuse atualiza status refused, notifica solicitante
- **AC4:** Ambas as ações registradas em audit_log
- **AC5:** GET/PUT /api/admin/departments lista e habilita/desabilita departamentos individualmente
- **AC6:** Rotas protegidas por authMiddleware + requireRole('admin')

---

## Definição de Pronto

- [ ] `routes/admin.js` criado
- [ ] Montado em `server.js` em `/api/admin`
- [ ] `tests/admin-access.test.js` com testes de integração
- [ ] `npm test` — 0 regressões
