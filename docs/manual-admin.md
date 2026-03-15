# Manual do Administrador — Desk Booking

**Sistema:** Desk Booking — Escritório SP
**Perfil:** Administrador

---

## 1. Visão geral

Administradores têm acesso a todas as funcionalidades de usuários comuns e da equipe TI, **mais** o **Painel Admin** com controle total sobre reservas, mesas, usuários e programação TI da equipe.

Acesse o painel pelo menu superior: **"Painel Admin"**

O painel é dividido em 6 abas: **Dashboard**, **Reservas**, **Mesas**, **Usuários**, **Prog. TI** e **Auditoria**.

---

## 2. Dashboard

Exibe indicadores gerais do sistema.

### Cards de resumo
| Card | Descrição |
|---|---|
| Reservas nos últimos 30 dias | Total de reservas criadas no período |
| Mesa mais reservada | Mesa com maior número de reservas |
| Taxa de ocupação média | % de uso das mesas nos últimos 30 dias |
| 🏢 Ocupação SP esta semana | % de usuários que foram ao escritório SP esta semana |
| 🏭 Ocupação Itaquá esta semana | % de membros TI em Itaquá esta semana |

### Gráficos
- **Ocupação por Mesa (30 dias)** — barras horizontais por mesa
- **Reservas por Dia da Semana** — barras por dia (segunda a sexta)
- **Usuários que mais reservam** — gráfico de pizza com os top usuários

---

## 3. Reservas

Lista todas as reservas do sistema.

### Filtrar por período
Use os campos **"De"** e **"Até"** para filtrar reservas por intervalo de datas.

### Cancelar uma reserva
1. Localize a reserva na tabela
2. Clique em **"Cancelar"**
3. Confirme a ação

> O usuário receberá um e-mail de cancelamento. A ação será registrada no log de Auditoria.

### Exportar para calendário (.ics)
Clique no botão 📅 ao lado de qualquer reserva para baixar o arquivo `.ics`.

### Exportar CSV
Clique em **"Exportar CSV"** para baixar todas as reservas do período selecionado em formato de planilha.

---

## 4. Mesas

Gerencia o mapa de mesas do escritório.

### Criar nova mesa
1. Clique em **"+ Nova Mesa"**
2. Informe o **nome** (ex: Mesa 13), a **coluna (X)** e a **linha (Y)** na grade
3. Clique em **"Criar"**

> A posição (X, Y) define onde a mesa aparece no mapa. Não podem existir duas mesas na mesma posição.

### Ativar ou desativar uma mesa
- Clique no botão de **status** ao lado da mesa para alternar entre ativa e inativa
- Mesas inativas aparecem no mapa como indisponíveis (ícone 🚫) e não podem ser reservadas

### Excluir uma mesa
Clique em **"Excluir"** na linha da mesa. Reservas futuras associadas a ela serão canceladas.

---

## 5. Usuários

Lista todos os usuários cadastrados.

### Perfis disponíveis
| Perfil | Descrição |
|---|---|
| Usuário | Acesso básico — reservas de mesa |
| TI | Acesso básico + Programação TI da equipe |
| Admin | Acesso total ao Painel Admin |

### Conceder / remover perfil TI
Clique no botão **"TI"** na coluna TI da linha do usuário. O status alterna entre ativo e inativo.

> A ação é registrada na Auditoria.

### Conceder / remover perfil Admin
Na linha do usuário, clique em **"Admin"** na coluna Perfil.

> Não é possível remover seu próprio perfil de administrador.

### Excluir usuário
Clique em **"Excluir"** na linha do usuário. Reservas e programações associadas serão removidas.

> Não é possível excluir sua própria conta.

---

## 6. Programação TI (Prog. TI)

Permite ao administrador visualizar e gerenciar a programação semanal de toda a equipe TI.

### Visualizar a programação
- Grade com todos os membros TI em linhas e os dias da semana em colunas
- Navegue entre semanas com as setas ← →
- Clique em **"Hoje"** para voltar à semana atual

### Definir localização para um membro
1. Clique na célula do membro no dia desejado
2. Escolha a localização: 🏠 Home Office, 🏢 Escritório SP ou 🏭 Itaquá
3. Se escolher **Escritório SP** e o membro ainda não tiver mesa reservada, será exibida uma lista de mesas disponíveis para reservar em nome do membro
4. Clique em **"Pular — apenas marcar SP"** para declarar SP sem reservar mesa

### Remover localização de um membro
1. Clique na célula com localização definida
2. Clique em **"Remover declaração"**

> Todas as ações na aba Prog. TI são registradas na Auditoria.

### Exportar CSV da programação TI
Use os campos **"De"** e **"Até"** e clique em **"Exportar CSV"** para baixar a programação da equipe no período.

---

## 7. Auditoria

Registra todas as ações administrativas realizadas no sistema.

### O que é registrado
| Ação | Quando ocorre |
|---|---|
| Reserva cancelada | Admin cancela qualquer reserva |
| Reserva criada (admin) | Admin cria reserva em nome de outro usuário |
| Perfil TI alterado | Admin ativa ou desativa perfil TI de um usuário |
| Perfil Admin alterado | Admin ativa ou desativa perfil Admin de um usuário |
| Usuário removido | Admin exclui um usuário |
| Local TI definido (admin) | Admin define localização na Programação TI |
| Local TI removido (admin) | Admin remove localização na Programação TI |

### Navegando no log
- Os registros são exibidos do mais recente para o mais antigo
- Use os botões de paginação na parte inferior para navegar
- Cada linha mostra: **data/hora**, **nome do admin**, **tipo de ação** e **detalhes** (mesa, data, usuário afetado)

---

## 8. Criar reserva em nome de outro usuário

Para reservar uma mesa para um usuário específico sem acessar a conta dele:

1. Acesse **Prog. TI** e clique na célula do membro desejado
2. Selecione **🏢 Escritório SP**
3. Na lista de mesas disponíveis, escolha uma e clique nela

Ou, via API diretamente (para integrações):
```
POST /api/bookings/admin
{ "user_id": <id>, "desk_id": <id>, "date": "YYYY-MM-DD" }
```

---

## 9. Boas práticas

- **Antes de excluir um usuário**, verifique se ele tem reservas futuras e cancele-as para liberar as mesas
- **Desative mesas** em vez de excluí-las quando houver indisponibilidade temporária (manutenção, reforma)
- **Revise a Auditoria** periodicamente para monitorar ações realizadas no sistema
- **Exporte o CSV de reservas** mensalmente para controle de presença no escritório

---

## Dúvidas frequentes

**Um usuário não consegue reservar — como verifico o motivo?**
Acesse a aba Reservas e filtre pelo nome do usuário. Verifique se já atingiu o limite de 3 reservas na semana ou se a data está além de 4 semanas à frente.

**Como definir outro administrador?**
Na aba Usuários, clique em **"Admin"** na linha do usuário desejado. O acesso ao Painel Admin é imediato após o próximo login do usuário.

**A mesa aparece inativa mas estava ativa antes**
Verifique na aba Mesas se ela foi desativada. Se não foi, verifique se não foi excluída. A Auditoria não registra alterações de mesas (somente ações sobre reservas, usuários e programação TI).

**Preciso bloquear o escritório em um feriado. O que faço?**
No momento, não há recurso de bloqueio de datas. Desative temporariamente as mesas na aba Mesas para impedir novos agendamentos naquele período, ou cancele manualmente as reservas existentes.
