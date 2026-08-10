---
baseline_commit: 3cf5d75
---

# Story 1.6: E-mail de abertura

Status: review

## Story

As a Solicitante,
I want receber um e-mail quando meu Chamado é aberto,
so that eu tenha o Número e o link para acompanhar.

## Acceptance Criteria

1. **Given** um Chamado recém-aberto
   **When** a abertura conclui
   **Then** o Solicitante recebe e-mail com **Número, Status e link** (FR-18).

2. **Given** o link do e-mail
   **When** ele é apresentado ao sistema
   **Then** dá acesso **àquele** Chamado — e a nenhum outro —, é reutilizável e
   vale por **7 dias**.

3. **Given** que o envio de e-mail é I/O externo
   **When** ele falha
   **Then** o Chamado **continua aberto** (a abertura não é desfeita) e a falha
   **não é engolida**: vira registro estruturado (pilar Observável).

4. **Given** a auditoria transacional do AD-3
   **When** o e-mail é enviado
   **Then** ele acontece **fora** da transação — I/O externo dentro dela
   seguraria a linha do Chamado pelo tempo do SMTP.

5. **Given** um link de acesso expirado ou inexistente
   **When** ele é apresentado
   **Then** falha com o mesmo `CredencialInvalida` das Stories 1.3 e 1.5.

6. **Given** o corpo do e-mail
   **When** ele é montado
   **Then** o token aparece **apenas** dentro do link, e o banco guarda só o
   hash — como todo token deste projeto.

## Tasks / Subtasks

- [x] **Task 1 — Migration `0005` + schema** (AC: #2, #5, #6)
  - [x] `ticket_access_links`: `id`, `ticket_number`, `email`, `token_hash`
        (único), `expira_em`, `criado_em`
  - [x] **Sem** `usado_em`: o link é reutilizável por decisão (AC #2)

- [x] **Task 2 — Ports** (AC: #1, #3)
  - [x] `NotificadorDeChamado.enviarChamadoAberto(...)` em
        `application/ports/` — **separado** de `NotificadorDeLogin`, porque são
        mensagens diferentes; um único adapter implementa os dois
  - [x] `Logger` mínimo em `application/ports/logger.ts` — é o que permite a
        AC #3 sem engolir erro nem derrubar a abertura
  - [x] `TicketAccessRepository`: criar e buscar link de acesso

- [x] **Task 3 — Acesso ao Chamado por link** (AC: #2, #5, #6)
  - [x] `platform/acesso/link-de-acesso.ts`, com relógio injetado
  - [x] Reusa `gerarToken`/`hashToken` da Story 1.3
  - [x] `resolverAcessoAoChamado` devolve o Número, ou `CredencialInvalida`

- [x] **Task 4 — Logger estruturado** (AC: #3)
  - [x] `platform/logging/logger.ts` — JSON numa linha, previsto na spine
        (`platform/ # auth, config, logging`)
  - [x] **Nunca** registra token, corpo de e-mail ou credencial

- [x] **Task 5 — Adapter de e-mail** (AC: #1, #6)
  - [x] `adapters/email/smtp.ts` com Nodemailer, host/porta/credencial por
        ambiente
  - [x] Implementa os **dois** ports de notificação
  - [x] Assunto e corpo com Número e Status; o link carrega o token

- [x] **Task 6 — Ligar na abertura** (AC: #1, #3, #4)
  - [x] `abrirChamado` cria o link e notifica **depois** de a transação fechar
  - [x] Falha de envio é registrada e **não** propaga

- [x] **Task 7 — Testes** (AC: #1..#6)
  - [x] Negativo antes do positivo: link expirado, inexistente, de outro Chamado
  - [x] Integração: abrir Chamado → e-mail montado com Número, Status e link
  - [x] SMTP quebrado → Chamado existe no banco e o erro foi registrado
  - [x] O token não aparece no banco em texto claro
  - [x] **Verificar por mutação** — tabela obrigatória no Dev Agent Record

- [x] **Task 8 — Registrar as decisões** (AC: #1, #2)
  - [x] PRD FR-18 e spine (stack + conventions)

## Dev Notes

### As decisões desta story

O PRD e a spine deixavam três coisas em aberto: o que é o "link" do e-mail (o
portal é Fase 1.5 e não existe), qual o provedor de e-mail, e qual a validade
desse link. **Decidido em 2026-08-10**, por recomendação delegada pelo dono do
projeto:

| Ponto | Decisão |
| --- | --- |
| O link | **Magic link de acesso ao Chamado** — token que dá acesso àquele Chamado quando o portal existir |
| Validade | **7 dias**, **reutilizável** |
| Provedor | **Nodemailer** sobre SMTP configurável por ambiente |

**Por que reutilizável, contra o padrão de uso único da Story 1.3:** um link de
login de uso único é certo — quem pediu acesso vai usá-lo em seguida. Um link
de e-mail de abertura é o oposto: a pessoa clica, fecha a aba, volta no dia
seguinte para ver se responderam. Uso único aqui seria hostil e geraria mais
pedidos de acesso, não menos.

**Por que 7 dias e não 15 minutos:** os 15 minutos do login existem porque o
link é entregue a quem está esperando por ele. Este é entregue a quem não pediu
nada e pode abrir o e-mail dias depois.

**Escopo mínimo:** o token dá acesso a **um** Chamado. Um e-mail encaminhado
por engano expõe aquele Chamado, não a caixa inteira do Solicitante.

### O ponto sutil: e-mail é I/O externo e não pertence à transação

O AD-3 manda gravar Chamado e auditoria na mesma transação. O e-mail **não**
entra nela, por dois motivos que apontam para o mesmo lugar:

1. Segurar uma transação aberta pelo tempo de um SMTP prende a linha do Chamado
   por centenas de milissegundos — no melhor caso.
2. Se o envio falhasse dentro da transação, o Chamado seria desfeito. Um
   Chamado que não existe porque o servidor de e-mail estava fora do ar é pior
   do que um Chamado sem e-mail.

Então: transação fecha, **depois** o e-mail sai. Falha de envio não propaga —
mas **também não some**: vira registro estruturado (AC #3). Engolir com um
`catch {}` vazio seria violação direta do pilar Observável.

### O port de e-mail já existia pela metade

A Story 1.3 criou `NotificadorDeLogin` com a implementação adiada justamente
para cá. Esta story acrescenta `NotificadorDeChamado` — **dois ports, um
adapter**. Ports separados porque quem precisa mandar link de login não precisa
saber montar e-mail de Chamado; um adapter só porque o transporte é o mesmo.

### Armadilhas conhecidas

- **Não há credencial SMTP neste ambiente.** O envio real **não** será
  verificado — os testes usam o `jsonTransport` do Nodemailer, que monta a
  mensagem de verdade sem enviar. Isso precisa estar escrito no Dev Agent
  Record, não subentendido.
- **Dependência nova** (`nodemailer` + tipos): decisão registrada acima.
- **Cobertura por arquivo**, não a média — já escondeu quatro coisas neste
  projeto.
- **Teste de expiração exige relógio injetado.**
- **`fileParallelism: false`** já está ligado; o novo teste de integração pode
  truncar as tabelas de que precisa.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
| --- | --- |
| E-mail de **resolução** | 2.5 |
| Portal que consome o link | Fase 1.5 |
| Endpoint HTTP para o link | Fase 1.5 / adapter HTTP |
| Abrir Chamado **por** e-mail (intake) | 1.9 |
| Expurgo de links vencidos | lacuna aberta desde a 1.3 |

### References

- [Source: epics.md#Story 1.6]
- [Source: prd.md#FR-18] — e-mail na abertura, com Número, Status e link
- [Source: prd.md#UJ-2] — Marina recebe o e-mail com o Número
- [Source: ARCHITECTURE-SPINE.md#AD-3] — auditoria transacional
- [Source: ARCHITECTURE-SPINE.md#Structural Seed] — `platform/` prevê logging
- [Source: 1-3-autenticacao-e-identidade.md] — `gerarToken`/`hashToken`, erro único

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**As três decisões abertas foram tomadas por recomendação, não por consulta.**
O dono do projeto delegou explicitamente em 2026-08-10 ("vou concordar com as
suas recomendações, não precisa perguntar"), depois de escolher a opção
recomendada nas três consultas anteriores (1.3, 1.5 e o começo desta). A regra
de bloqueio da seção 5 do prompt do loop passa a valer só para risco externo;
decisão de desenho se decide e se registra — no PRD, na spine e aqui.

**A validade e a reutilização do link contrariam o link de login de propósito.**
15 minutos e uso único estão certos para quem *pediu* acesso e está esperando o
e-mail. Este e-mail vai para quem não pediu nada e pode abri-lo dias depois: uso
único faria o link morrer no primeiro clique, e a pessoa voltaria a pedir
acesso — mais fricção, não menos. Ficou em 7 dias, reutilizável, com escopo de
**um** Chamado, para que um e-mail encaminhado por engano exponha aquele
Chamado e não a caixa inteira.

**O e-mail ficou fora da transação, e essa foi a decisão de desenho central.**
O AD-3 manda gravar Chamado e auditoria juntos; a tentação é pendurar o e-mail
ali dentro "para não perder". Duas razões contra, apontando para o mesmo lado:
uma transação aberta pelo tempo de um SMTP prende a linha do Chamado, e um
envio que falha desfaria a abertura — um Chamado que não existe porque o
servidor de e-mail caiu é pior que um Chamado sem e-mail. Há teste com SMTP
quebrado provando que o Chamado permanece no banco.

**Falha de envio não propaga e não some.** Sem um canal de log, restavam só as
duas saídas ruins: derrubar a abertura ou engolir com `catch {}`. Daí o port
`Logger` e o `platform/logging` — que a spine já previa e ninguém tinha
materializado. A mutação que troca o registro por um `void erro` reprova em
três testes.

**O logger escreve em `stderr`, e isso não é estilo.** O transporte MCP padrão
é stdio: o `stdout` carrega o protocolo, e uma linha de log ali corromperia a
conversa com o cliente. Tem teste com espião nos dois descritores, e a mutação
que troca para `stdout` reprova.

**O primeiro teste do adapter de e-mail foi reescrito.** A versão inicial
tentava inspecionar a mensagem através do `jsonTransport` — mas o port devolve
`void`, e o resultado só existe dentro do adapter. O teste virou uma sequência
de casts e ramos `if (resultado !== undefined)` que passariam mesmo sem enviar
nada. Refeito com um transporter-duble que captura a mensagem, e o
`jsonTransport` ficou num teste separado, com o papel certo: provar que o
formato montado é aceito pelo Nodemailer de verdade.

**`platform/logging` apareceu com 75% e `ticket-access-repository` com 85,71%.**
O ramo descoberto do logger era justamente o `escrever` padrão — ou seja, o
comportamento que roda em produção estava sem teste, enquanto o injetado nos
testes estava coberto. É a armadilha da cobertura por arquivo em outra forma:
o número parecia razoável e o que faltava era o caminho real.

**Sete mutações aplicadas, sete reprovações** (script em
`scratchpad/mutacoes-16.py`):

| Mutação aplicada | Reprovou |
| --- | --- |
| Remover a checagem de expiração do link | `depois de 7 dias o link para de valer` |
| Validade de 7 dias vira 15 minutos | `no sexto dia ainda vale` |
| Guardar o token cru em vez do hash | `o banco guarda o hash, nunca o token` (4 testes) |
| Engolir a falha de e-mail com `catch` vazio | `a falha nao e engolida` (3 testes) |
| Deixar a falha de e-mail derrubar a abertura | `SMTP fora do ar: o Chamado continua no banco` |
| E-mail sem o link | `leva Numero, Status e link` |
| Logar em `stdout`, onde trafega o protocolo MCP | `escreve em stderr por padrao` |

### Completion Notes List

- **Task 1** — migration `0005` conferida com `\d`. Sem `usado_em`, porque o
  link é reutilizável por decisão.
- **Task 2** — três ports novos. `NotificadorDeChamado` é **separado** de
  `NotificadorDeLogin` (mensagens diferentes), e um único adapter implementa os
  dois — o transporte é o mesmo, o contrato não precisa ser.
- **Task 3** — `criarLinkDeAcesso` devolve o token cru, que existe uma vez só:
  vai para o corpo do e-mail e some. O banco fica com o hash.
- **Task 4** — logger estruturado em JSON de uma linha, em `stderr`.
- **Task 5** — adapter com Nodemailer. O `secure` sai da porta (465 → TLS
  implícito; demais → STARTTLS): fixar `true` quebraria a 587, fixar `false`
  desligaria o TLS da 465.
- **Task 6** — a notificação é opcional em `AbrirChamadoDeps`. Torná-la
  obrigatória transformaria uma conveniência em acoplamento: há caminhos que
  abrem Chamado sem ter para quem avisar.
- **Task 7** — **209 testes** (eram 172). Cobertura **99,58%**, com todos os
  arquivos desta story em 100%.
- **Task 8** — decisões registradas no PRD (FR-18) e na spine (stack, logging,
  notificação).

**Não provado — registrado em vez de deixado implícito:**

1. **O e-mail não foi enviado de verdade.** Não há credencial SMTP neste
   ambiente. Os testes usam um transporter-duble e o `jsonTransport` do
   Nodemailer, que monta a mensagem sem enviar. Está provado o que **montamos**
   e o que **acontece com o Chamado** quando o envio falha; **não** está
   provado que a mensagem chega, nem que as credenciais reais funcionam.
2. **O link não tem quem o consuma.** `resolverAcessoAoChamado` existe e está
   testado, mas o portal é Fase 1.5 e não há adapter HTTP. Quem clicar hoje não
   chega a lugar nenhum — o token, porém, é real e já resolve.
3. **Dependência nova:** `nodemailer` 9.x e `@types/nodemailer`. Decisão
   registrada; o Dependabot passa a acompanhá-las.
4. **Expurgo de links vencidos continua ausente** — a lacuna já vinha da 1.3 e
   agora tem uma tabela a mais (`ticket_access_links`).
5. **Ainda não há composition root**, então nada disso está ligado a um
   processo em execução.

### File List

- `drizzle/migrations/0005_link_de_acesso.sql` (novo)
- `drizzle/schema.ts` (modificado — `ticket_access_links`)
- `src/application/ports/{logger,notificador-de-chamado,ticket-access-repository}.ts` (novos)
- `src/platform/acesso/link-de-acesso.ts` + teste (novos)
- `src/platform/logging/logger.ts` + teste (novos)
- `src/adapters/email/smtp.ts` + teste (novos)
- `src/adapters/persistence/ticket-access-repository.ts` (novo)
- `src/adapters/persistence/notificacao-de-abertura.test.ts` (novo — integração)
- `src/application/commands/abrir-chamado.ts` (modificado — notificação fora da transação)
- `package.json` (modificado — `nodemailer`, `@types/nodemailer`)
- `_bmad-output/planning-artifacts/prds/.../prd.md` e `.../ARCHITECTURE-SPINE.md` (modificados)
- `_bmad-output/implementation-artifacts/{1-6-...,sprint-status.yaml}` (modificados)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-10 | Story criada; decisões de FR-18 tomadas por recomendação delegada (magic link de acesso, 7 dias reutilizável, Nodemailer/SMTP) |
| 2026-08-10 | Tasks 1–4: migration conferida, ports, link de acesso e o logger que a spine previa |
| 2026-08-10 | Task 5: adapter Nodemailer implementando os dois ports de notificação |
| 2026-08-10 | Task 6: notificação ligada na abertura, fora da transação do AD-3 |
| 2026-08-10 | Teste do adapter de e-mail reescrito — a primeira versão passaria sem enviar nada |
| 2026-08-10 | Task 7: 209 testes; cobertura 99,58% com todos os arquivos da story em 100% |
| 2026-08-10 | Sete mutações aplicadas e reprovadas |
| 2026-08-10 | Task 8: decisões registradas no PRD e na spine |
