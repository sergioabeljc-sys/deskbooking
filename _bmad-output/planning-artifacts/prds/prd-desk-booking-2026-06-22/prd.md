---
title: "Desk Booking v2.0 — Vagas de Escritório e Salas de Reunião"
status: draft
created: 2026-06-22
updated: 2026-06-22
project: desk-booking
version: 2.0
---

# PRD — Desk Booking v2.0

## 1. Visão Geral

O Desk Booking v2.0 redefine o modelo de reservas do escritório. O sistema abandona a reserva de mesas específicas e introduz dois novos pilares: **reserva de vaga no escritório** (presença confirmada, com escolha de horário livre) e **reserva de salas de reunião** (com gestão de recursos e controle de conflito). A v2.0 preserva a base de usuários e perfis existentes, acrescentando controle departamental e visibilidade coletiva da semana.

---

## 2. Problema e Oportunidade

O modelo atual vincula cada reserva a uma mesa física específica, criando rigidez operacional: colaboradores em home office parcial e mesas subutilizadas convivem sem mecanismo de aproveitamento. Além disso, o sistema não cobre salas de reunião, forçando controles paralelos (planilhas, grupos de mensagens). A v2.0 resolve ambos os pontos com um único produto.

---

## 3. Objetivos

| Objetivo | Métrica de sucesso |
|---|---|
| Eliminar reservas de mesa específica para o público rotativo | 0 reservas de mesa individual para usuários de departamentos habilitados |
| Habilitar reserva de salas de reunião no sistema | >= 80% das reservas de sala migradas do controle manual em 60 dias |
| Aumentar previsibilidade de ocupação | Admin consegue visualizar ocupação da semana sem consulta manual |
| Reduzir no-shows | Taxa de cancelamento >= 24h antes superior a 60% dos cancelamentos totais |

**Contra-métricas:** não aumentar o tempo médio de reserva acima de 60 segundos; não reduzir a taxa de adoção entre usuários habilitados abaixo de 70% nos primeiros 30 dias.

---

## 4. Escopo

### 4.1 Incluído na v2.0
- Gestão de salas de reunião (admin)
- Reserva de salas com range de horário livre
- Novo conceito de vaga de escritório (sem mesa específica)
- Controle de mesas fixas e rotativas
- Visibilidade semanal de presenças
- Notificações por e-mail
- Controle de acesso por departamento (individual por departamento)
- Autenticação SSO via Microsoft Entra ID

### 4.2 Fora do escopo (v2.0)
- Mapa visual do escritório
- Integração com calendário externo (Google, Outlook)
- App mobile nativo
- Relatórios e exportação de dados (mantido da v1)

---

## 5. Perfis de Usuário

| Perfil | Descrição |
|---|---|
| **Usuário comum** | Reserva vaga e sala; vê disponibilidade e presenças da semana |
| **Dono de mesa fixa** | Usuário com mesa fixa atribuída; define dias em que a mesa é rotativa |
| **Administrador** | Controle total: salas, mesas, departamentos habilitados, vagas rotativas, aprovação de acessos |

Empresas suportadas: **Tenda Atacado** (`@tendaatacado.com.br`) e **Voxcred — Cartão Tenda** (`@voxcred.com.br`). Ambas compartilham o mesmo espaço físico e pool de vagas.

---

## 6. Funcionalidades

### F1 — Gestão de Salas de Reunião (Admin)

**FR-1.1** O admin pode cadastrar uma sala de reunião informando: nome, capacidade (padrão: 4 pessoas) e lista de recursos (padrão: TV).

**FR-1.2** O admin pode editar nome, capacidade e recursos de qualquer sala existente.

**FR-1.3** O admin pode desativar ou excluir uma sala; reservas futuras ativas nessa sala são canceladas e os usuários notificados.

**FR-1.4** Recursos são itens livres (ex: TV, Projetor, Videoconferência, Quadro Branco). O admin adiciona e remove recursos por sala.

---

### F2 — Reserva de Salas de Reunião (Usuário)

**FR-2.1** Qualquer usuário autenticado pode reservar uma sala de reunião.

**FR-2.2** O usuário define horário de início e fim livremente, dentro do intervalo permitido de **08h às 18h**, no mesmo dia ou com até **30 dias de antecedência**.

**FR-2.3** O sistema valida conflito de horário: se a sala já estiver reservada no intervalo solicitado (total ou parcial), a reserva é bloqueada e o sistema sugere o próximo horário disponível.

**FR-2.4** Usuários comuns visualizam salas como **"disponível"** ou **"ocupado"** para cada faixa de horário; não veem o nome do reservante nem detalhes da reserva.

**FR-2.5** Administradores visualizam todas as reservas de sala com nome do reservante, horário e sala.

**FR-2.6** O usuário pode cancelar sua própria reserva de sala até **24 horas antes** do início. Cancelamentos feitos pelo admin não têm restrição de prazo.

---

### F3 — Novo Conceito: Vaga no Escritório

**FR-3.1** O sistema abandona a reserva de mesa específica para o público rotativo. O usuário reserva uma **vaga** — um slot de presença no escritório — e pode sentar em qualquer mesa marcada como rotativa.

**FR-3.2** Mesas marcadas como **fixas** não estão disponíveis para o público rotativo.

**FR-3.3** O admin configura quais **departamentos** têm permissão para reservar vagas, de forma **individual por departamento** (habilitar/desabilitar um de cada vez). Ao lançar a v2.0, os departamentos habilitados são: **Suprimentos**, **Auditoria** e **RH**.

**FR-3.4** Usuários de departamentos não habilitados não visualizam a opção de reservar vaga.

---

### F4 — Mesas Fixas e Rotativas

**FR-4.1** Cada mesa é classificada pelo admin como **Fixa** (com usuário dono atribuído) ou **Rotativa** (sempre disponível para o pool).

**FR-4.2** O dono de uma mesa fixa pode definir, para cada dia da semana (segunda a sexta), se sua mesa será **fixa** (reservada para ele) ou **rotativa** (entra no pool daquele dia).

**FR-4.3** A configuração de dias rotativos pelo dono entra em vigor automaticamente, sem aprovação do admin.

**FR-4.4** Se o dono deseja reverter um dia de rotativo para fixo:
- Se ainda houver vagas rotativas disponíveis naquele dia: a reversão é permitida imediatamente.
- Se o pool de vagas rotativas do dia já estiver no limite: a reversão é **bloqueada** e o sistema exibe mensagem explicativa.

**FR-4.5** O admin define e ajusta o **número máximo de vagas rotativas** disponíveis por dia. Essa capacidade pode ser aumentada ou reduzida a qualquer momento.

**FR-4.6** Quando o total de vagas rotativas disponíveis para um dia atingir zero, o sistema exibe a mensagem **"Sem vagas disponíveis para este dia"** e bloqueia novas reservas para aquela data.

---

### F5 — Reserva de Vaga (Usuário)

**FR-5.1** O usuário de departamento habilitado acessa a tela de reserva de vaga e visualiza, para cada data, o **número de vagas rotativas disponíveis**.

**FR-5.2** O usuário define horário de início e fim livremente, dentro do intervalo de **08h às 18h**.

**FR-5.3** O usuário pode reservar **múltiplos dias de uma vez**, com limite de até **30 dias à frente** da data atual.

**FR-5.4** O usuário pode cancelar sua reserva de vaga até **24 horas antes** do horário de início reservado.

---

### F6 — Visibilidade Semanal de Presenças

**FR-6.1** Todos os usuários autenticados têm acesso à **visão semanal de presenças**: quais colegas têm vagas confirmadas em cada dia da semana corrente (e semanas seguintes navegáveis).

**FR-6.2** A visão semanal é a **tela principal** do sistema ao fazer login.

**FR-6.3** A visão diária (lista de presenças de um único dia) está disponível como complemento, acessível a partir da visão semanal.

**FR-6.4** A visão exibe nome do colaborador, e-mail, empresa (Tenda Atacado ou Voxcred — Cartão Tenda), horário reservado e status (confirmado).

---

### F7 — Notificações por E-mail

**FR-7.1** O sistema envia notificação por **e-mail** ao usuário nos seguintes eventos:
- Reserva de vaga confirmada
- Reserva de sala confirmada
- Reserva de vaga cancelada (pelo próprio usuário ou pelo admin)
- Reserva de sala cancelada (pelo próprio usuário ou pelo admin)

**FR-7.2** O conteúdo do e-mail inclui: tipo de reserva, data, horário e (para salas) nome da sala.

**FR-7.3** O módulo de e-mail é independente e configurável, permitindo troca do provedor SMTP sem alteração no restante do sistema. Falha no envio não bloqueia a confirmação da reserva; o sistema retenta em background.

---

### F8 — Autenticação SSO via Microsoft Entra ID e Fluxo de Aprovação de Acesso

**FR-8.1** No primeiro acesso, o usuário informa seu e-mail corporativo (`@tendaatacado.com.br` ou `@voxcred.com.br`). O sistema identifica a empresa automaticamente pelo domínio do e-mail.

**FR-8.2** Após informar o e-mail, a conta fica com status **"Pendente de aprovação"**. O usuário não acessa nenhuma funcionalidade até ser aprovado por um admin.

**FR-8.3** O admin recebe notificação por e-mail de novo pedido de acesso e pode:
- **Aprovar**: vincula a conta ao Entra ID correto (Tenda Atacado ou Voxcred) e define o perfil do usuário.
- **Recusar**: o pedido é negado e o usuário notificado por e-mail.

**FR-8.4** Após aprovação, o usuário realiza login via **SSO com Microsoft Entra ID** (OAuth 2.0 / OpenID Connect), sem necessidade de senha no sistema.

**FR-8.5** O admin pode vincular ou desvincular a conta Entra ID de qualquer usuário existente, bem como revogar o acesso a qualquer momento.

**FR-8.6** O login local (usuário + senha) é mantido como fallback exclusivo para contas de serviço ou administradores sem conta Entra ID — a critério do admin.

**FR-8.7** O perfil do usuário armazena: nome, e-mail, empresa (derivada do domínio), departamento e perfil de acesso (usuário / dono de mesa / admin).

---

## 7. Requisitos Não Funcionais

**NFR-1 — Desempenho:** A tela de visão semanal deve carregar em até 2 segundos para semanas com até 200 reservas ativas.

**NFR-2 — Consistência de dados:** Conflitos de reserva de sala devem ser detectados com lock transacional para evitar double-booking em condições de concorrência.

**NFR-3 — Segurança:** Somente admins acessam dados de reservas de sala além do status ocupado/disponível. Controle por perfil no backend, não apenas no frontend.

**NFR-4 — Notificações:** Falha no envio de e-mail não deve bloquear a confirmação da reserva; retentar em background com fila de retentativa.

**NFR-6 — SSO:** A autenticação Entra ID deve seguir as boas práticas de segurança OAuth 2.0 (PKCE, validação de state, tokens com expiração). Sessões devem ser invalidadas no logout.

**NFR-5 — Auditoria:** Todas as ações de admin (criar/editar/excluir sala, alterar capacidade de vagas, habilitar/desabilitar departamento) devem ser registradas no log de auditoria existente.

---

## 8. Regras de Negócio

| ID | Regra |
|---|---|
| RN-01 | Horário de reserva (vaga ou sala): somente entre 08h e 18h. |
| RN-02 | Antecedência máxima para qualquer reserva: 30 dias corridos. |
| RN-03 | Cancelamento pelo usuário: somente até 24h antes do início. |
| RN-04 | Sala com conflito de horário: reserva bloqueada, sugestão de próximo slot disponível. |
| RN-05 | Vaga rotativa esgotada: reserva bloqueada com mensagem clara. |
| RN-06 | Mesa fixa com dia rotativo configurado: entra automaticamente no pool sem confirmação do admin. |
| RN-07 | Reversão de dia rotativo para fixo: só permitida se houver vagas rotativas remanescentes naquele dia. |
| RN-08 | Departamentos não habilitados: não visualizam nem acessam a função de reserva de vaga. |
| RN-09 | Duração mínima de qualquer reserva (vaga ou sala): 30 minutos. |
| RN-10 | Empresa identificada automaticamente pelo domínio do e-mail: `@tendaatacado.com.br` = Tenda Atacado; `@voxcred.com.br` = Voxcred — Cartão Tenda. E-mails de outros domínios são rejeitados no cadastro. |
| RN-11 | Contas com status "Pendente" não acessam nenhuma funcionalidade do sistema. |
| RN-12 | Um usuário pode ter reserva de vaga e reserva de sala ativas no mesmo horário. |

---

## 9. Questões em Aberto

| # | Questão | Impacto | Status |
|---|---|---|---|
| Q-01 | O admin pode habilitar/desabilitar departamentos individualmente ou apenas em lote? | Médio | Resolvido: individualmente |
| Q-02 | As notificações push são web push (PWA) ou via app mobile futuro? | Alto | Resolvido: sem push — apenas e-mail |
| Q-03 | Existe prazo mínimo para uma reserva? (ex: mínimo 30 min) | Baixo | Resolvido: mínimo 30 minutos (RN-09) |
| Q-04 | Um usuário pode ter reserva de vaga e sala no mesmo horário? | Baixo | Resolvido: sim, permitido |

---

## 10. Dependências

- Provedor SMTP para envio de e-mail (Nodemailer foi removido na v1 — definir substituto com TI)
- **Microsoft Entra ID (Tenda Atacado)**: tenant configurado, App Registration com permissões de leitura de perfil (claims: `name`, `email`)
- **Microsoft Entra ID (Voxcred)**: tenant configurado separadamente, App Registration equivalente
- Departamento do usuário gerenciado no sistema (não via claims do Entra ID)

---

## 11. Próximos Passos Sugeridos

1. Validar questões em aberto (Q-01 a Q-04) com Sabel
2. Invocar `bmad-create-architecture` para desenho técnico da v2.0
3. Invocar `bmad-create-epics-and-stories` para planejamento de sprints
