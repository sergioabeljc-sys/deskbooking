# Story 2.2 — SSO Entra ID — Dois Tenants

**Epic:** 2 — Autenticação SSO e Fluxo de Aprovação de Acesso
**Story ID:** 2.2
**Status:** in-progress
**Baseline commit:** 165da7376a0500999a583809e62334001cf814b5
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** Env vars por tenant: ENTRA_TENDA_CLIENT_ID/SECRET/TENANT_ID e ENTRA_VOXCRED_*
- **AC2:** GET /api/auth/sso/login?email=x detecta tenant pelo domínio e redireciona
- **AC3:** Fluxo usa Authorization Code + state (CSRF); state guardado em Map com TTL 10min
- **AC4:** Callback valida state, troca code por tokens via POST ao Azure AD
- **AC5:** Extrai oid do id_token → busca user por entra_oid → gera JWT interno (8h)
- **AC6:** Usuário pending/revoked recebe 403; user não encontrado recebe 401
- **AC7:** Login local (email+senha) mantido intacto como fallback

---

## Definição de Pronto

- [ ] `services/ssoService.js` criado
- [ ] Endpoints SSO adicionados a `routes/auth.js`
- [ ] `.env` atualizado com vars SSO comentadas
- [ ] `tests/sso.test.js` com mock do fetch ao Azure AD
- [ ] `npm test` — 0 regressões
