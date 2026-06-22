# Story 5.2 — Frontend da Visão Semanal (Tela Principal)

**Epic:** 5 — Visão Semanal de Presenças
**Story ID:** 5.2
**Status:** review
**Criado em:** 2026-06-22

---

## Critérios de Aceite

- **AC1:** Página /week.html exibe grade semanal seg–sex com cards de presença
- **AC2:** Cards mostram: nome, e-mail, badge de empresa (Tenda=verde, Voxcred=azul), horário
- **AC3:** Navegação entre semanas (anterior / próxima / hoje); dia atual destacado em azul
- **AC4:** Sem token → redireciona para /login.html; responsivo (tablet 2 cols, mobile 1 col)

---

## Definição de Pronto

- [x] Página implementada em public/week.html (vanilla JS + CSS Grid)
- [x] SSO token via ?sso_token= suportado
- [x] npm test — 0 regressões (frontend não possui testes automatizados de unidade)
