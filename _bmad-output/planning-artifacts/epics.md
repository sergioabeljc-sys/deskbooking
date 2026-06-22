# Épicos e Stories — Desk Booking v2.0

**Projeto:** desk-booking
**Gerado em:** 2026-06-22
**Referência:** PRD v2.0 + Arquitetura v2.0

---

## Epic 1: Fundação v2 — Migração e Infraestrutura

Prepara a base técnica para todos os módulos novos: migração de schema, middleware de autorização e módulo de e-mail isolado.

### Story 1.1: Scripts de Migração do Schema v2

Criar e executar os 6 scripts de migração SQL versionados (`002` a `007`) que evoluem o schema v1 para v2 sem perda de dados históricos.

**Critérios de aceite:**
- AC1: Scripts em `db/migrations/` numerados sequencialmente (002–007)
- AC2: `db.js` executa migrações pendentes na inicialização via tabela `schema_version`
- AC3: Tabelas criadas: `rooms`, `room_bookings`, `spot_bookings`, `spot_capacity`, `departments`, `access_requests`
- AC4: Colunas adicionadas em `users`: `company`, `department`, `entra_oid`, `status`, `entra_tenant`
- AC5: Colunas adicionadas em `desks`: `type`, `owner_id`, `rotative_days`
- AC6: Seed de departamentos iniciais inserido (`Suprimentos`, `Auditoria`, `RH` com `can_book_spot = 1`)
- AC7: Dados existentes da v1 preservados (sem DROP de tabelas existentes)
- AC8: Testes Jest validam que migrations rodam idempotentes (executar duas vezes não quebra)

### Story 1.2: Middleware RBAC

Criar `middleware/rbac.js` com funções de controle de acesso por perfil, departamento e propriedade do recurso.

**Critérios de aceite:**
- AC1: `requireRole('admin')` retorna 403 para não-admins
- AC2: `requireDepartmentAccess()` valida `can_book_spot` do departamento do usuário no banco (não no JWT)
- AC3: `requireOwnerOrAdmin(getResourceUserId)` permite acesso ao dono do recurso ou admin
- AC4: Testes unitários cobrem todos os cenários de cada função (autorizado, não autorizado, token ausente)

### Story 1.3: Módulo de E-mail

Criar `services/emailService.js` com transporte SMTP Office 365, templates por evento e fila de retentativa em memória.

**Critérios de aceite:**
- AC1: Configuração via env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- AC2: Função `sendEmail(to, template, data)` disponível para outros módulos
- AC3: Templates implementados: `access-request`, `access-approved`, `access-refused`, `booking-confirmed`, `booking-cancelled`
- AC4: Falha no envio não lança exceção para o chamador; retenta até 3x com backoff de 30s
- AC5: Teste unitário com mock de transporte SMTP valida chamadas por template

---

## Epic 2: Autenticação SSO e Fluxo de Aprovação de Acesso

Implementa o novo fluxo de primeiro acesso (pedido + aprovação admin) e autenticação SSO via Microsoft Entra ID para dois tenants.

### Story 2.1: Fluxo de Pedido de Acesso

Criar endpoint `POST /auth/request-access` e tela de primeiro acesso para usuários novos.

**Critérios de aceite:**
- AC1: Endpoint valida domínio do e-mail: aceita `@tendaatacado.com.br` e `@voxcred.com.br`; rejeita outros com erro genérico
- AC2: Cria registro em `access_requests` com `status: 'pending'`
- AC3: Envia e-mail para todos os admins via `emailService` (template `access-request`)
- AC4: Resposta para o usuário é sempre genérica ("verifique seu e-mail") — não confirma nem nega existência de conta
- AC5: Pedido duplicado (mesmo e-mail) com status `pending` retorna 200 sem criar novo registro
- AC6: Tela `login.html` exibe campo de e-mail e botão "Solicitar Acesso" antes do SSO

### Story 2.2: SSO Entra ID — Dois Tenants

Implementar `services/ssoService.js` e endpoints `GET /auth/sso/login` e `GET /auth/sso/callback` com suporte a dois tenants Entra ID.

**Critérios de aceite:**
- AC1: Variáveis de ambiente por tenant: `ENTRA_TENDA_*` e `ENTRA_VOXCRED_*`
- AC2: `/auth/sso/login?email=x` detecta tenant pelo domínio e redireciona para o Entra ID correto
- AC3: Fluxo usa Authorization Code + PKCE; parâmetro `state` gerado por `crypto.randomBytes(32)`
- AC4: Callback valida `state` (anti-CSRF), troca `code` por tokens, valida `id_token` (iss, aud, exp)
- AC5: Extrai `oid` do token → busca user por `entra_oid` → gera JWT interno (exp: 8h)
- AC6: Usuário com `status: 'pending'` ou `status: 'revoked'` recebe erro 403 com mensagem clara
- AC7: Login local (e-mail + senha) mantido como fallback em `POST /auth/login`

### Story 2.3: Painel Admin — Aprovação de Acessos

Criar endpoint e tela para admins aprovarem ou recusarem pedidos de acesso pendentes.

**Critérios de aceite:**
- AC1: `GET /api/admin/access-requests` lista pedidos com `status: 'pending'`
- AC2: `POST /api/admin/access-requests/:id/approve` cria user com `status: 'active'`, vincula `entra_oid` informado pelo admin, registra `reviewed_by` e `reviewed_at`
- AC3: `POST /api/admin/access-requests/:id/refuse` atualiza `status: 'refused'`, registra revisor
- AC4: Ambas as ações disparam e-mail para o solicitante via `emailService`
- AC5: Tela `admin-access.html` lista pedidos pendentes com nome, e-mail, empresa e botões Aprovar/Recusar
- AC6: Ação de aprovar exibe campo para o admin informar o `entra_oid` correto do usuário
- AC7: Ações registradas no log de auditoria existente

---

## Epic 3: Salas de Reunião

Implementa gestão completa de salas (admin) e reserva com detecção de conflito (usuário).

### Story 3.1: CRUD de Salas (Admin)

Backend e frontend para criação, edição e desativação de salas de reunião.

**Critérios de aceite:**
- AC1: `POST /api/rooms` cria sala com nome, capacidade (padrão: 4) e recursos (padrão: `["TV"]`)
- AC2: `PUT /api/rooms/:id` edita nome, capacidade e recursos
- AC3: `DELETE /api/rooms/:id` desativa sala (`active = 0`); reservas futuras são canceladas e usuários notificados
- AC4: `GET /api/rooms` retorna salas ativas com capacidade e recursos
- AC5: Tela `admin-rooms.html` com listagem, formulário de criação e edição inline
- AC6: Todas as ações registradas em auditoria

### Story 3.2: Reserva de Sala com Detecção de Conflito

Backend e frontend para usuários reservarem salas com range de horário livre (08h–18h).

**Critérios de aceite:**
- AC1: `POST /api/rooms/:id/bookings` valida: horário dentro de 08h–18h, duração >= 30 min, antecedência <= 30 dias
- AC2: Detecção de conflito em transação SQLite (WAL); se conflito → 409 com sugestão do próximo slot disponível
- AC3: `GET /api/rooms/:id/availability?date=YYYY-MM-DD` retorna slots livres do dia
- AC4: Usuários comuns veem slots como "disponível" / "ocupado" sem detalhes do reservante
- AC5: Admins veem nome do reservante, horário e sala
- AC6: Tela `rooms.html` exibe salas com timeline do dia e time picker para reserva

### Story 3.3: Cancelamento de Reserva de Sala

**Critérios de aceite:**
- AC1: `DELETE /api/rooms/bookings/:id` cancela reserva; usuário comum só pode cancelar a própria reserva e apenas até 24h antes
- AC2: Admin cancela qualquer reserva sem restrição de prazo
- AC3: Notificação por e-mail ao usuário ao cancelar (template `booking-cancelled`)
- AC4: Registro em auditoria

---

## Epic 4: Vagas no Escritório

Implementa o novo modelo de presença: vagas rotativas, mesas fixas com dias configuráveis, controle de capacidade e departamentos.

### Story 4.1: Gestão de Mesas Fixas e Rotativas (Admin)

**Critérios de aceite:**
- AC1: `PUT /api/desks/:id/type` define `type` (`fixed`/`rotative`) e `owner_id` (obrigatório para `fixed`)
- AC2: Admin visualiza listagem de mesas com tipo e dono atual
- AC3: Mudança de tipo registrada em auditoria

### Story 4.2: Configuração de Dias Rotativos pelo Dono

**Critérios de aceite:**
- AC1: `PUT /api/desks/:id/rotative-days` aceita array de dias `["mon","tue",...]`; apenas o dono da mesa ou admin pode chamar
- AC2: Configuração entra em vigor imediatamente sem aprovação do admin
- AC3: Ao tentar remover um dia do array (reverter para fixo): verifica vagas disponíveis naquele dia; se `disponíveis == 0` → 409 com mensagem explicativa
- AC4: Tela `desk-settings.html` exibe checkboxes segunda–sexta para o dono configurar

### Story 4.3: Controle de Capacidade de Vagas Rotativas

**Critérios de aceite:**
- AC1: `PUT /api/admin/spot-capacity` permite admin definir capacidade por `day_of_week` ou `specific_date`
- AC2: Cálculo de vagas disponíveis: `MIN(capacidade_admin, mesas_rotativas_do_dia) - reservas_ativas`
- AC3: Capacidade `specific_date` tem prioridade sobre `day_of_week`
- AC4: Tela admin exibe capacidade atual por dia da semana com campo editável

### Story 4.4: Controle de Departamentos Habilitados

**Critérios de aceite:**
- AC1: `GET /api/admin/departments` lista departamentos com status `can_book_spot`
- AC2: `PUT /api/admin/departments/:id` habilita ou desabilita individualmente
- AC3: Usuários de departamento desabilitado não visualizam a opção de reservar vaga (validado no backend)
- AC4: Alterações registradas em auditoria

### Story 4.5: Reserva de Vaga no Escritório

**Critérios de aceite:**
- AC1: `POST /api/spots/bookings` aceita uma ou múltiplas datas (array); valida departamento habilitado, horário (08h–18h), duração >= 30 min, antecedência <= 30 dias
- AC2: Para cada data: verifica vagas disponíveis; se esgotado → 409 para aquela data com mensagem "Sem vagas disponíveis"
- AC3: `GET /api/spots/availability?date=YYYY-MM-DD` retorna vagas disponíveis para a data
- AC4: Reserva duplicada (mesmo user + data) retorna 409
- AC5: Tela `spot-booking.html` exibe seletor de datas (múltiplas), horário e contador de vagas disponíveis

### Story 4.6: Cancelamento de Vaga

**Critérios de aceite:**
- AC1: `DELETE /api/spots/bookings/:id` cancela vaga; usuário só cancela a própria até 24h antes
- AC2: Admin cancela qualquer vaga sem restrição
- AC3: Notificação por e-mail (template `booking-cancelled`)

---

## Epic 5: Visão Semanal de Presenças

Implementa a tela principal do sistema: quem está no escritório em cada dia da semana.

### Story 5.1: API de Presenças Semanais

**Critérios de aceite:**
- AC1: `GET /api/spots/week?start=YYYY-MM-DD` retorna presenças confirmadas da semana (segunda a sexta)
- AC2: Resposta inclui por dia: lista de usuários com `name`, `email`, `company`, `start_time`, `end_time`
- AC3: Carrega em <= 2s para semanas com até 200 reservas
- AC4: Todos os usuários autenticados podem chamar o endpoint

### Story 5.2: Frontend da Visão Semanal (Tela Principal)

**Critérios de aceite:**
- AC1: `week.html` é a primeira tela após login
- AC2: Layout em colunas por dia (seg–sex) com lista de presenças por coluna
- AC3: Cada card exibe: nome, e-mail, empresa (badge visual diferenciando Tenda Atacado e Voxcred), horário
- AC4: Navegação entre semanas (anterior / próxima)
- AC5: Visão diária acessível clicando no cabeçalho do dia

---

## Epic 6: Notificações por E-mail

Conecta o `emailService` (Epic 1) a todos os eventos de reserva e acesso do sistema.

### Story 6.1: Notificações de Reserva e Cancelamento

**Critérios de aceite:**
- AC1: Confirmação de reserva de vaga dispara `emailService.sendEmail` com template `booking-confirmed`
- AC2: Confirmação de reserva de sala dispara `booking-confirmed` com nome da sala no corpo
- AC3: Cancelamento de vaga ou sala dispara `booking-cancelled`
- AC4: Cancelamento em massa (sala excluída) notifica todos os afetados

### Story 6.2: Notificações do Fluxo de Acesso

**Critérios de aceite:**
- AC1: Novo pedido de acesso notifica todos os admins (template `access-request`)
- AC2: Aprovação notifica o solicitante (template `access-approved`) com instrução para fazer login via SSO
- AC3: Recusa notifica o solicitante (template `access-refused`)
