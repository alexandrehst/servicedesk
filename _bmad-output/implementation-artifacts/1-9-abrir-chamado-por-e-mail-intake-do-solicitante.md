---
baseline_commit: 7bfc12f
---

# Story 1.9: Abrir Chamado por e-mail (intake do Solicitante)

Status: review

## Story

As a Solicitante sem interface própria no MVP,
I want abrir um Chamado enviando um e-mail para o endereço de suporte,
so that eu tenha uma porta de entrada própria antes da UI da Fase 1.5.

## Acceptance Criteria

1. **Given** um endereço de suporte monitorado pelo adapter de e-mail
   (direção de entrada)
   **When** um remetente **cadastrado** e com autenticidade **aprovada** envia
   uma mensagem
   **Then** um Chamado é aberto pelo **mesmo command de FR-1** (AD-2), com
   Solicitante = remetente, Título = assunto e Descrição = corpo
   **And** o Solicitante recebe o e-mail de abertura com Número e link
   (reusa Story 1.6).

2. **Given** um remetente **não cadastrado** em `users`
   **When** o e-mail chega
   **Then** nenhum Chamado é criado, **nenhuma resposta é enviada ao
   remetente**, e a recusa vira registro estruturado (`stderr`, sem corpo do
   e-mail).

3. **Given** uma mensagem cuja autenticidade **não foi aprovada** pelo servidor
   de recepção (SPF/DKIM reprovados ou ausentes)
   **When** o e-mail chega
   **Then** é recusada pelo mesmo caminho da AC #2 — **mesmo que o `From` case
   com um usuário cadastrado**.

4. **Given** uma mensagem que já foi processada (mesmo `Message-ID`)
   **When** ela é entregue de novo
   **Then** **nenhum segundo Chamado** é criado, e o resultado aponta o Chamado
   que já existe.

5. **Given** um Chamado aberto por e-mail
   **When** seu histórico é consultado (Story 1.8)
   **Then** a entrada de auditoria tem `origin` que identifica o canal
   **e-mail** — distinto de `api` e de `mcp` (AD-9)
   **And** o autor é a identidade do **cadastro**, não o texto do cabeçalho.

## Tasks / Subtasks

- [x] **Task 1 — Domínio: origem e categoria** (AC: #1, #5)
  - [x] Acrescentar `'email'` a `ORIGENS` em `domain/origem.ts` — uma linha,
        porque a 1.8 unificou a lista. Verificar que `origemSchema` e o filtro
        de histórico a aceitam **sem alteração**
  - [x] Acrescentar `'nao_classificado'` a `CATEGORIAS` em `domain/ticket.ts`
        (justificativa em Dev Notes) — e conferir se algum teste existente
        assume o tamanho da lista
- [x] **Task 2 — Contrato da mensagem recebida** (AC: #1, #3, #4)
  - [x] `application/contracts/intake-de-email.ts`: `MensagemRecebida`
        (`messageId`, `de`, `assunto`, `corpo`, `autenticacao`) como schema Zod
        (AD-6) — é fronteira externa, valida na entrada
  - [x] `autenticacao` é um enum fechado: `'aprovada' | 'reprovada' | 'ausente'`
- [x] **Task 3 — Port de entrada e dedup no banco** (AC: #1, #4)
  - [x] `application/ports/caixa-de-entrada.ts`: buscar mensagens novas e
        marcar como processada
  - [x] Migration `0007_intake_de_email.sql`: tabela `email_intake` com
        `message_id text NOT NULL UNIQUE` e `ticket_number`
  - [x] `TicketRepository`: `buscarIntakePorMessageId` + gravar o `message_id`
        **dentro da transação** de `criarComAuditoria` (parâmetro opcional)
- [x] **Task 4 — O processador de intake** (AC: #1..#5)
  - [x] `application/commands/abrir-chamado-por-email.ts` — orquestra:
        autenticidade → cadastro → dedup → `abrirChamado` → notificação
  - [x] **Não** reimplementa abertura: chama o command da 1.1
  - [x] Recusa devolve resultado tipado (não lança) e vira log estruturado
- [x] **Task 5 — Adapters de e-mail (entrada)** (AC: #1)
  - [x] `adapters/email/mensagem.ts`: RFC822 bruto → `MensagemRecebida`
        (`mailparser`), lendo `Authentication-Results`
  - [x] `adapters/email/imap.ts`: casca fina do port (`imapflow`)
  - [x] O que **não** puder ser testado sem servidor IMAP vai para o Dev Agent
        Record como não provado — não marcar a story `done` sem isso
- [x] **Task 6 — Testes** (AC: #1..#5)
  - [x] Recusa **antes** do caminho feliz: não autenticado, não cadastrado,
        e o cruzamento perigoso (não autenticado **com** `From` cadastrado)
  - [x] Dedup: a mesma mensagem duas vezes → um Chamado, dois resultados
  - [x] Integração: `origin = 'email'` aparece no histórico da 1.8
  - [x] Parsing de `.eml` sintético — assunto vazio, corpo vazio, multipart
  - [x] **Verificar por mutação** — tabela no Dev Agent Record
- [x] **Task 7 — Registro das decisões** (AC: —)
  - [x] PRD (FR-1, FR-18) e spine (AD-9, Stack) atualizados com as seis
        decisões tomadas por delegação

## Dev Notes

### O que torna esta story diferente de todas as anteriores

Tudo até aqui entrou por um ponto autenticado por token: o MCP resolve uma
credencial de máquina, a sessão humana resolve um hash. **Esta é a primeira
escrita que chega de fora**, por um canal que ninguém controla, onde a
identidade vem de um cabeçalho de texto.

O `From` de um e-mail é escrito por quem envia. Sem verificação, "e-mail
corporativo reconhecido" é só uma string que casa com um domínio — e abrir
Chamado em nome de outra pessoa passa a ser trivial. É por isso que a AC #3
existe separada da #2, e por isso o teste do **cruzamento** (autenticidade
reprovada + remetente cadastrado) é o mais importante da story: é exatamente o
caso que um `if` na ordem errada deixa passar.

### As seis decisões tomadas por delegação

O dono do projeto delegou a decisão em 2026-08-10. Todas abaixo estão tomadas;
o dev **não** deve reabri-las, e sim registrá-las no PRD e na spine.

**1. Autenticidade do remetente: exigida, verificada por quem recebe.**
O ServiceDesk **não** valida SPF/DKIM por conta própria — validação de
criptografia de e-mail é um sistema inteiro, e o servidor de recepção
(Google Workspace, Microsoft 365, qualquer MTA corporativo) já faz isso e
escreve o veredito no cabeçalho `Authentication-Results`. A decisão é
**consumir esse veredito e recusar tudo que não for aprovação explícita**.

Ausência de cabeçalho é recusa, não permissão: um relay que não avalia
autenticidade não é base para confiar em identidade. Isso é deliberadamente
mais restritivo do que "aceitar se não houver prova contra".

**2. `origin` ganha o valor `'email'`.**
`api` e `mcp` não descrevem o canal. Deixar como `api` faria o Log afirmar algo
falso e cegaria a revisão da 1.8, que filtra justamente por `origin`. Graças à
1.8, `ORIGENS` é uma lista só e isto é **uma linha** no domínio. A coluna
`origin` em `audit_entries` é `text` sem `CHECK` — nada no banco precisa mudar.

Atualizar o AD-9 na spine, que hoje diz `api|mcp`.

**3. Categoria: `nao_classificado`, não `outros`.**
FR-1 exige Categoria de lista fixa, e um e-mail não traz uma. Inventar
`'software'` seria mentira estrutural — o dado ficaria errado no banco e
ninguém saberia.

`nao_classificado` foi escolhido em vez de `outros` porque as duas afirmam
coisas diferentes: `outros` diz "avaliei e não é nenhuma das anteriores";
`nao_classificado` diz "ninguém avaliou ainda". Só a segunda é verdade num
intake automático, e é ela que a triagem do Epic 3 vai querer filtrar. Efeito
colateral aceito: a tool MCP passa a aceitar o valor — o que é bom, porque uma
IA que não sabe classificar chutando categoria é pior do que uma que admite.

**4. Deduplicação por `Message-ID`, garantida pelo banco.**
Reentrega é comportamento normal de SMTP. A garantia é `UNIQUE` em
`email_intake.message_id`, gravado **na mesma transação** da abertura — pelo
mesmo motivo do AD-3: duas transações separadas deixam uma janela em que o
processo morre com o Chamado criado e o `Message-ID` não registrado, e a
reentrega abre o segundo.

Ler antes (`buscarIntakePorMessageId`) resolve o caso comum. A corrida — a
mesma mensagem processada em paralelo — é fechada pelo `UNIQUE`: capture a
violação (`23505`) e trate como duplicata, devolvendo o Chamado existente. **Não
deixe o `UNIQUE` como única defesa e nem a leitura como única defesa** —
uma cobre o caso comum, a outra cobre a corrida.

**5. Direção de entrada: IMAP com polling.**
Webhook exigiria endpoint público, e a topologia de deploy é um `Deferred` da
spine — não há onde receber. IMAP funciona contra qualquer provedor corporativo
sem infraestrutura nova. `imapflow` e `mailparser` são do mesmo autor do
Nodemailer, que a 1.6 já trouxe.

O adapter IMAP é **casca fina**: busca, entrega ao processador, marca como
processada. Toda decisão fica no processador, que é testável sem rede — o mesmo
movimento que a 1.6 fez com `jsonTransport`. Se a casca não puder ser testada
neste ambiente (não há servidor IMAP), isso vai para o Dev Agent Record como
**não provado**, com o que foi coberto e o que não foi.

**6. Assunto e corpo vazios.**
O domínio rejeita título e descrição vazios (Story 1.1), e mensagem sem assunto
é comum demais para virar recusa silenciosa.

| Situação | Decisão |
| --- | --- |
| Assunto vazio, corpo preenchido | Título vira `(sem assunto)` — é o que todo cliente de e-mail mostra; não é dado inventado, é a representação padrão da ausência |
| Assunto preenchido, corpo vazio | Descrição recebe o assunto |
| Ambos vazios | Recusa, com log — não há Chamado ali |

### Passe pelo command, não pelo repositório

O processador de intake **orquestra**; ele não abre Chamado. A abertura é
`abrirChamado` (Story 1.1), que já faz validação de domínio, auditoria
transacional (AD-3) e notificação fora da transação (1.6). Se você estiver
escrevendo `insert(tickets)` no caminho do e-mail, parou no lugar errado — é o
mesmo erro que a 1.8 evitou na leitura.

O `requester` sai de `autor.identity`, então o principal precisa estar certo
**antes** da chamada:

```
identity = e-mail normalizado do CADASTRO   (não o texto do From)
role     = papel do CADASTRO                 (nunca inventar 'solicitante')
origin   = 'email'
```

Reuse `buscarUsuarioPorEmail` do `IdentityRepository` (Story 1.3) e a mesma
normalização (`trim().toLowerCase()`) — se o intake normalizasse diferente, a
mesma pessoa viraria duas identidades. Um **Agente** que mande e-mail abre
Chamado como Agente, e isso está certo: FR-1 diz "Solicitante ou Agente em seu
nome".

### Recusa é silenciosa para fora e barulhenta para dentro

Nada volta para o remetente. Responder a um remetente forjado transforma o
suporte em amplificador de spam, e confirma para quem sonda que o endereço
existe — o mesmo raciocínio da resposta cega do `solicitarLink` (Story 1.3).

Para dentro, cada recusa é log estruturado em `stderr` (`platform/logging`),
**sem corpo do e-mail e sem cabeçalho completo**. Silêncio nos dois lados
faria um intake quebrado parecer um intake sem demanda.

Recusa **não é exceção**: o processador devolve um resultado tipado
(`aberto` / `duplicado` / `recusado` com motivo). Um lote de e-mails não pode
parar no primeiro remetente desconhecido.

### Armadilhas conhecidas

- **A ordem dos `if` é a story.** Autenticidade antes de cadastro, sempre.
  Testar o cruzamento.
- **`Message-ID` é opcional no RFC 5322.** Mensagem sem ele não pode ser
  deduplicada — decida (recusar é defensável) e registre.
- **`mailparser` devolve `text` e `html`.** Use o texto; se só houver HTML,
  decida e registre. Não jogue HTML cru na Descrição.
- **Cobertura por arquivo** (1.2), não a global.
- **Verde do `claude-review` não é evidência** — confira `/pulls/NN/comments`.
- **`pnpm` não existe no Node 24 desta máquina** sem `corepack enable` — só o
  Node 22 tem o shim.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
| --- | --- |
| Responder por e-mail a comentário/resolução | FR-18 cobre abertura e resolução; Epic 2 |
| Anexos | Não está no MVP |
| Reclassificar categoria | Epic 2/3 (triagem) |
| Auditar login e token de máquina | decidido na 1.8: tabela separada, se houver necessidade |

### References

- [Source: epics.md#Story 1.9]
- [Source: prd.md#FR-1] — Título, Descrição e Categoria obrigatórios
- [Source: prd.md#FR-18] — e-mail de abertura, decisões da 1.6
- [Source: prd.md#FR-19] — cadastro e normalização de e-mail
- [Source: ARCHITECTURE-SPINE.md#AD-2] — domínio é o único ponto de mutação
- [Source: ARCHITECTURE-SPINE.md#AD-3] — auditoria na mesma transação
- [Source: ARCHITECTURE-SPINE.md#AD-9] — identidade e origem até a auditoria
- [Source: 1-1-abrir-um-chamado-via-mcp-tracer-bullet.md] — o command reusado
- [Source: 1-3-autenticacao-e-identidade.md] — cadastro, normalização, resposta cega
- [Source: 1-6-e-mail-de-abertura.md] — port de notificação e link de acesso
- [Source: 1-8-revisao-do-log-de-auditoria-acoes-mcp.md] — `ORIGENS` no domínio

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A ordem dos `if` é a story, e ela precisou de um teste que ninguém escreveria
por acidente.** O teste "óbvio" do cruzamento — autenticidade reprovada com
`From` de usuário cadastrado — **não** trava a ordem: com a checagem de
cadastro na frente, o usuário existe, o fluxo segue, e a recusa sai como
`autenticidade` do mesmo jeito. Descobri isso montando a mutação e vendo que
ela sobrevivia. O caso que distingue é **remetente forjado de endereço
inexistente**: com a ordem certa o motivo é `autenticidade`; com a ordem
trocada vira `remetente_desconhecido`, e o log passa a dizer "faltou cadastrar
alguém" para o que era uma tentativa de forjar identidade. A mutação de
reordenação reprova exatamente 1 teste — esse.

**O `23505` não estava onde eu procurei.** A primeira versão do predicado de
violação de unicidade olhava `erro.code` no topo, e o teste da corrida reprovou
com "expected false". O Drizzle embrulha o erro do driver num `Error` genérico
(`Failed query: insert into "email_intake" ...`) e o código do Postgres fica na
`cause`. Percorrer a cadeia resolveu. O modo de falha que isso evitava é sutil:
sem reconhecer a violação, a reentrega — que é rotina de SMTP — viraria erro
ruidoso, a mensagem não seria marcada como lida, e voltaria em toda varredura.

**`mailparser` não reprova lixo.** Escrevi um teste assumindo que texto que não
é e-mail faria o parsing lançar. Não faz: vira uma mensagem com todos os campos
vazios. Isso é bom — lixo chega mesmo — mas move a defesa de lugar: quem
protege contra lixo é a recusa por `mensagem_vazia` do caso de uso, não o
parser. O teste foi reescrito para travar essa expectativa; se um dia o parser
passar a lançar, a varredura contará como falha em vez de recusa e o
comportamento mudaria em silêncio.

**Só o primeiro `Authentication-Results` vale, e isso é uma decisão de
segurança, não um detalhe de parsing.** Qualquer remetente pode incluir esse
cabeçalho na mensagem que envia; o servidor de recepção adiciona o dele no
topo, porque cabeçalhos são prefixados. Ler "algum cabeçalho diz pass"
entregaria o intake a quem soubesse escrever um cabeçalho — e o teste com um
cabeçalho forjado logo abaixo do verdadeiro é o que prova a diferença.

**`spf=pass` sozinho não aprova.** SPF valida o envelope (`MAIL FROM`) e a
identidade que o intake usa é o `From` do cabeçalho: são campos diferentes, e
nada obriga que combinem. Um domínio com SPF próprio e válido pode enviar
mensagem cujo `From` diga `marina@empresa.com`. DKIM assina o cabeçalho; DMARC
exige o alinhamento entre os dois.

**A normalização de e-mail subiu para o domínio.** Ela era uma função privada
de `platform/auth`, e o comentário de lá já avisava o risco — "se o adapter
também normalizasse, os dois poderiam divergir e a mesma pessoa viraria duas
identidades". O intake é o segundo caminho de identidade, então o risco virou
certeza. Mesmo movimento que a 1.8 fez com `ORIGENS`.

**`Pick` nas deps eliminou casts, não só linhas.** A primeira versão recebia
`IdentityRepository` e `TicketRepository` inteiros, e o duble precisava de
`as TicketRepository` — que o `tsc` recusou por falta de overlap. Declarar
`Pick<TicketRepository, 'buscarIntakePorMessageId'>` resolveu o tipo e diz o
que o caso de uso **não** faz: não cria sessão, não emite token, não lê Chamado.

**Cobertura lida por arquivo, e foi ela que achou o buraco.** O global estava
em 92% com `imap.ts` em **0%** — o gate de 80% passaria sem tocar no arquivo.
Refatorar a conexão para ser injetada (como o transporter da 1.6) levou o
arquivo a 85% e o global a **98,5%**.

**O `claude-review` achou algo real, e a correção melhorou o desenho.** A
primeira versão calculava o veredito de autenticidade **dentro do adapter**
(`interpretarAutenticacao` em `mensagem.ts`). O review apontou que isso é
política de confiança, não tradução de formato — equivalente em criticidade à
autorização que o AD-8 exige no domínio — e que o comentário do próprio
`imap.ts` já antecipava "trocar IMAP por webhook amanhã". Quem escrevesse esse
segundo adapter teria que redescobrir as duas regras não óbvias (só o primeiro
cabeçalho; `spf=pass` não basta), e uma versão mais fraca abriria bypass sem
que `abrir-chamado-por-email.ts` — que só via `autenticacao !== 'aprovada'` —
tivesse como perceber.

A política virou `domain/autenticidade-de-email.ts`, e o contrato passou a
carregar `autenticacaoBruta: readonly string[]` — os cabeçalhos como vieram.
Agora **nenhum adapter consegue entregar veredito pronto**: o schema recusa uma
string no lugar da lista, e a única implementação possível da regra é a do
domínio. A mutação nova ("adapter inverter a ordem dos cabeçalhos") existe por
causa disso: dividir a defesa entre adapter e domínio criou uma forma nova de
quebrá-la — o adapter preservar a ordem errada — e ela precisava de teste
próprio.

**E achou um segundo, de outra natureza.** `marcarProcessada` abria uma sessão
IMAP inteira por chamada, e a varredura a chamava uma vez por mensagem: com o
teto de 50, uma única varredura custava **51 handshakes** (TCP + TLS + LOGIN)
em vez de 2 — no caminho quente de um polling periódico, e contra o mesmo
limite de conexões simultâneas que o próprio módulo cita como motivo do
`logout` no `finally`. O port passou a `marcarProcessadas(ids)`, a varredura
acumula e marca o lote de uma vez, e lista vazia — o caso comum no polling —
não abre conexão nenhuma.

O custo dessa mudança é um atraso entre processar e marcar: morrer no meio faz
as mensagens voltarem na próxima varredura. É aceitável **porque a dedup por
`Message-ID` existe**; sem ela, esta otimização abriria Chamado repetido. As
duas decisões se sustentam juntas.

**Dezessete mutações aplicadas, dezessete reprovações** (script em
`scratchpad/mutacoes-19.py`, versionado porque a referência da 1.8 morreu):

| Mutação aplicada | Reprovou |
| --- | --- |
| Aceitar mensagem não autenticada | 6 testes |
| Checar cadastro **antes** da autenticidade (ordem trocada) | 1 teste |
| Usar o `From` cru como identidade | 2 testes |
| Carimbar `origin: 'api'` em vez de `'email'` | 3 testes |
| Ignorar a deduplicação prévia | 1 teste |
| Não gravar o vínculo da mensagem na abertura | 3 testes |
| Aceitar `spf=pass` sozinho | 1 teste |
| Julgar o **último** `Authentication-Results` | 2 testes |
| Tratar ausência de autenticação como aprovada | 3 testes |
| **Adapter inverter a ordem dos cabeçalhos** | 1 teste |
| Marcar como processada mesmo quando falha | 2 testes |
| Abortar o lote na primeira falha | 3 testes |
| Tratar violação de unicidade como erro comum | 1 teste |
| Remover o teto de mensagens por varredura | 1 teste |
| **Marcar mensagem por mensagem, em vez de em lote** | 1 teste |
| **Abrir conexão mesmo sem nada a marcar** | 1 teste |
| Não fazer `logout` quando a operação falha | 2 testes |

As que mais valem são a segunda (prova a ordem dos `if`), a oitava e a décima
(juntas provam que cabeçalho forjado não passa, nem pela regra nem pela
extração) e a décima terceira (prova que o vínculo está na mesma transação).

### Completion Notes List

- **Task 1** — `'email'` em `ORIGENS` e `'nao_classificado'` em `CATEGORIAS`.
  A primeira foi literalmente uma linha, porque a 1.8 unificou a lista; o
  contrato Zod e o filtro de histórico a aceitaram sem alteração.
- **Task 2** — contrato com `autenticacao` como enum fechado. `messageId` é
  `string | null`: ausência não pode ser `''`, que casaria com a próxima
  mensagem sem cabeçalho.
- **Task 3** — `email_intake` com `UNIQUE`, gravada dentro da transação de
  `criarComAuditoria`. Asserção contra o catálogo do banco prova os dois lados.
- **Task 4** — o processador **não** abre Chamado: delega ao command da 1.1.
- **Task 5** — `mensagem.ts` (parsing) e `imap.ts` (casca fina, conexão
  injetada), mais `varredura.ts`, que garante que uma mensagem ruim não derruba
  o lote.
- **Task 6** — **350 testes** (eram 248 na 1.8); cobertura **98,5%**.
- **Task 7** — PRD (FR-1) e spine (AD-9, Conventions, Stack) atualizados.

**Não provado — registrado em vez de deixado implícito:**

1. **Não há conversa com um servidor IMAP real.** `conectarPorImap` (linhas
   62–73, os únicos 15% descobertos de `imap.ts`) constrói o cliente e chama
   `connect()`; nada neste ambiente exercita isso. A casca ao redor está
   coberta — teto, trava, `logout` em falha, tradução de UID —, mas o handshake,
   TLS e o comportamento real de `fetch({seen:false})` só serão exercitados
   contra um provedor. **É o item que mais pede validação manual antes de
   apontar o intake para uma caixa de produção.**
2. **Nenhum agendador chama a varredura.** `criarVarredura` existe e é testada,
   mas nada a executa em intervalo — não há processo de entrada montado, porque
   a topologia de deploy segue `Deferred` na spine. O intake está pronto e
   desligado.
3. **Duas guardas defensivas seguem sem teste** em `ticket-repository.ts`
   (linhas 67 e 94): "INSERT não retornou linha" e o repasse de erro que não é
   violação de unicidade. Ambas exigiriam provocar falhas do driver que o
   Postgres não oferece por caminho normal.
4. **Mensagem só-HTML entra sem corpo.** O texto puro é usado quando existe; se
   a mensagem só tiver HTML, a Descrição recebe o assunto. Converter HTML em
   texto ficou fora — jogar marcação crua na Descrição seria pior. Provedores
   corporativos costumam enviar `multipart/alternative`, então o caso é
   minoria, mas existe.
5. **Anexos são descartados.** Não estão no MVP; uma mensagem com print da tela
   vira Chamado sem o print, e ninguém é avisado disso.
6. **A política de autenticidade depende de o MTA escrever
   `Authentication-Results`.** Se a caixa monitorada estiver atrás de um relay
   que não avalia SPF/DKIM, **todo** e-mail será recusado por `ausente` — o
   intake fica inerte, e de forma silenciosa para quem envia. É o modo de falha
   mais provável na primeira configuração, e o log de recusa é onde ele
   aparece.
7. **O `claude-review` revisou de verdade** (PR #43, 4m38s) e apontou uma
   violação real de AD-1/AD-8: a política de autenticidade estava no adapter.
   Foi corrigida movendo-a para o domínio, e o contrato passou a carregar
   cabeçalhos crus — o que torna a violação impossível de repetir num adapter
   futuro. É a quarta revisão com conteúdo em onze rodadas, e a primeira que
   mudou o desenho em vez de só confirmar o que já estava lá.

### File List

- `src/domain/origem.ts` + teste (modificado/novo — `'email'`)
- `src/domain/ticket.ts` + teste (modificados — `'nao_classificado'`)
- `src/domain/email.ts` (novo — `normalizarEmail`, subiu de `platform/auth`)
- `src/domain/autenticidade-de-email.ts` + teste (novos — a politica de confianca, movida do adapter apos o review do PR #43)
- `src/domain/errors.ts` (modificado — `MensagemJaProcessada`)
- `src/application/contracts/intake-de-email.ts` + teste (novos)
- `src/application/ports/caixa-de-entrada.ts` (novo)
- `src/application/ports/ticket-repository.ts` (modificado — `RegistroDeIntake`,
  `buscarIntakePorMessageId`)
- `src/application/ports/logger.ts` (modificado — `aviso`)
- `src/application/commands/abrir-chamado.ts` (modificado — terceiro parâmetro)
- `src/application/commands/abrir-chamado-por-email.ts` + teste (novos)
- `src/adapters/email/mensagem.ts` + teste (novos)
- `src/adapters/email/imap.ts` + teste (novos)
- `src/adapters/email/varredura.ts` + teste (novos)
- `src/adapters/persistence/ticket-repository.ts` (modificado)
- `src/adapters/persistence/intake-de-email.test.ts` (novo — integração)
- `src/adapters/persistence/intake-ponta-a-ponta.test.ts` (novo — integração)
- `src/platform/auth/autenticacao.ts` (modificado — usa o domínio)
- `src/platform/logging/logger.ts` + teste (modificados — `aviso`)
- `drizzle/migrations/0007_intake_de_email.sql` e `drizzle/schema.ts` (novos/mod.)
- `scratchpad/mutacoes-19.py` (novo — verificação por mutação)
- Dubles de teste em `adapters/mcp` e `application/{commands,queries}` (mod.)
- `package.json` / `pnpm-lock.yaml` (mailparser, imapflow, @types/mailparser)
- `prd.md` e `ARCHITECTURE-SPINE.md` (modificados — as seis decisões)
- `_bmad-output/implementation-artifacts/{1-9-...,sprint-status.yaml}` (mod.)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-10 | Story criada; seis decisões tomadas por delegação (autenticidade, `origin`, categoria, dedup, IMAP, campos vazios) |
| 2026-08-10 | Tasks 1–2: `'email'` e `'nao_classificado'` no domínio; contrato com veredito de autenticidade |
| 2026-08-10 | Task 3: `email_intake` com `UNIQUE` dentro da transação; `23505` estava na `cause` do erro do Drizzle |
| 2026-08-10 | Task 4: processador delega ao command da 1.1; normalização de e-mail subiu para o domínio |
| 2026-08-10 | Task 5: parsing com `mailparser`, casca IMAP com conexão injetada, varredura tolerante a falha |
| 2026-08-10 | Task 6: 345 testes; cobertura 98,5% depois de `imap.ts` sair de 0% |
| 2026-08-10 | Catorze mutações aplicadas e reprovadas |
| 2026-08-10 | Task 7: decisões registradas no PRD (FR-1) e na spine (AD-9, Conventions, Stack) |
| 2026-08-10 | PR #43: `claude-review` apontou política de confiança no adapter; movida para `domain/autenticidade-de-email.ts` e contrato passou a levar cabeçalhos crus |
| 2026-08-10 | PR #43, segunda rodada: `claude-review` apontou 51 conexões IMAP por varredura; marcação virou lote (`marcarProcessadas`) |
| 2026-08-10 | Dezessete mutações aplicadas e reprovadas; 350 testes |
