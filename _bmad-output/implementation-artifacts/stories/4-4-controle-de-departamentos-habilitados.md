# Story 4.4 — Controle de Departamentos Habilitados

**Epic:** 4 — Vagas no Escritório
**Story ID:** 4.4
**Status:** review
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** Admin pode habilitar/desabilitar departamentos via PUT /api/admin/departments/:name
- **AC2:** GET /api/admin/departments lista todos os departamentos e seus status
- **AC3:** Usuário sem departamento habilitado recebe 403 ao tentar reservar vaga
- **AC4:** Middleware `requireDepartmentAccess` verifica `can_book_spot` na tabela departments

---

## Definição de Pronto

- [x] Implementado em routes/admin.js (já existia do Epic 2)
- [x] Middleware requireDepartmentAccess em middleware/rbac.js
- [x] npm test — 0 regressões
