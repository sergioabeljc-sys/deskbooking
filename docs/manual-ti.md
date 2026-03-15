# Manual do Usuário — Desk Booking

**Sistema:** Desk Booking — Escritório SP
**Perfil:** Equipe TI

---

## 1. Visão geral

Membros da equipe TI possuem todas as funcionalidades de um usuário comum **mais** acesso à **Programação TI**, onde cada membro declara onde estará trabalhando a cada dia da semana.

Essa programação é visível para toda a equipe e sincroniza automaticamente com as reservas de mesa.

---

## 2. Acesso e login

Igual ao usuário padrão. Após o login, o menu superior exibirá o link **"Programação TI"**.

---

## 3. Programação TI

Acesse pelo menu: **"Programação TI"**

### Visualizando a programação
- A grade exibe todos os membros da equipe TI em linhas e os dias da semana em colunas
- Navegue entre semanas com as setas ← → ou clique em **"Hoje"** para voltar à semana atual
- Cada célula mostra a localização declarada:
  - 🏠 **Home Office**
  - 🏢 **Escritório SP**
  - 🏭 **Itaquá**
  - — (traço) — não declarado

### Declarando sua localização
1. Clique na célula do seu nome no dia desejado
2. Escolha a localização:
   - **🏠 Home Office** — cancela automaticamente qualquer reserva de mesa naquele dia
   - **🏢 Escritório SP** — se você ainda não tem mesa reservada, será redirecionado para reservar
   - **🏭 Itaquá** — cancela automaticamente qualquer reserva de mesa naquele dia
3. Para remover uma declaração, clique na célula e escolha **"Remover declaração"**

> Você só pode editar a própria linha. As linhas dos outros membros são somente leitura.

### Regras da programação TI
- Máximo de **2 dias de Home Office por semana**
- Não é permitido declarar **fins de semana**
- Limite de **4 semanas** de antecedência
- Declarar **Home Office ou Itaquá** cancela automaticamente a reserva de mesa daquele dia (e você recebe um e-mail de confirmação do cancelamento)
- Declarar **Escritório SP** sem reserva de mesa exibe um alerta para que você reserve uma

### Sincronização com reservas
| Ação na Programação TI | Efeito nas Reservas |
|---|---|
| Declara Home Office | Cancela a reserva do dia (se houver) |
| Declara Itaquá | Cancela a reserva do dia (se houver) |
| Declara Escritório SP | Convida a reservar mesa (se não houver) |
| Remove declaração | Cancela reserva automática de SP |
| Reserva uma mesa | Declara SP automaticamente |
| Cancela uma reserva de mesa | Remove a declaração SP automática |

---

## 4. Reservas de mesa

Funciona da mesma forma que o usuário padrão. Quando você reserva uma mesa, o sistema declara automaticamente **Escritório SP** na sua programação TI para aquele dia.

Veja o **Manual do Usuário** para instruções completas sobre reservas.

---

## 5. Minha Semana

Acesse pelo menu: **"Minha Semana"**

Exibe o resumo da semana combinando reservas de mesa **e** sua localização TI declarada em cada dia. Útil para ter uma visão consolidada da semana sem precisar abrir duas páginas.

---

## 6. Exportar para calendário (.ics)

Em qualquer reserva de mesa (painel lateral, Minha Semana ou Programação TI), clique no botão 📅 para baixar um arquivo `.ics` e adicionar ao seu calendário pessoal.

---

## Dúvidas frequentes

**Apareceu "Limite de 2 dias de home office por semana atingido"**
Você já tem 2 dias de Home Office declarados na semana selecionada. Escolha outro dia ou remova uma declaração existente.

**Declarei Home Office mas minha reserva não foi cancelada**
Se você não tinha reserva para aquele dia, não há nada a cancelar. A declaração foi salva normalmente.

**Reservei uma mesa mas não apareceu SP na programação**
Recarregue a página de Programação TI. O sistema sincroniza automaticamente, mas pode ser necessário atualizar.

**Não consigo editar a célula de outro membro**
Somente administradores podem alterar a programação de outros membros. Para solicitar uma correção, contate o administrador do sistema.
