---
baseline_commit: e959f14
---

# Story 1.3: Autenticação e identidade

Status: done

## Story

As a usuário (Agente ou Solicitante),
I want autenticar por magic link enviado ao meu e-mail corporativo,
so that o sistema saiba quem sou em cada ação.

## Acceptance Criteria

1. **Given** um usuário com e-mail corporativo cadastrado
   **When** ele solicita o link e troca o token recebido
   **Then** nasce uma sessão que identifica unicamente o principal `{identity, role, origin}` (FR-19)
   **And** o `role` vem do cadastro, **nunca** da entrada do usuário
   **And** não há SSO/AD no MVP (fora de escopo).

2. **Given** um principal autenticado
   **When** um caso de uso é invocado
   **Then** o principal é injetado no handler (base para AD-8/AD-9), com `origin` carimbado pelo adapter.

3. **Given** um e-mail **não** cadastrado
   **When** o link é solicitado
   **Then** a resposta é **idêntica** à do e-mail cadastrado — nenhum link é criado nem enviado.
   *(Resposta distinta transformaria o formulário de login num verificador de quem trabalha aqui.)*

4. **Given** um token de link ausente, malformado, expirado (>15 min), já usado, ou que simplesmente não existe
   **When** a troca por sessão é tentada
   **Then** todos falham com o **mesmo** erro `CredencialInvalida`, mesma mensagem
   **And** nenhuma sessão é criada.

5. **Given** uma sessão
   **When** ela passa de 8 horas
   **Then** deixa de resolver principal, com o mesmo `CredencialInvalida` do AC #4.

6. **Given** qualquer um dos fluxos acima
   **When** algo é persistido, logado ou devolvido em erro
   **Then** o token **em texto claro não aparece** em lugar nenhum: banco guarda só o hash, e a auditoria grava a `identity` (AD-9), nunca a credencial.

## Tasks / Subtasks

- [x] **Task 1 — Migration `0003` + schema** (AC: #1, #4, #5, #6)
  - [x] `users`: `id`, `email` (único, normalizado), `papel`, `criado_em`
  - [x] `login_links`: `id`, `email`, `token_hash` (único), `expira_em`, `usado_em` (null), `criado_em`
  - [x] `sessions`: `id`, `email`, `papel`, `token_hash` (único), `expira_em`, `criado_em`
  - [x] **Nenhuma coluna guarda token em texto claro** — só `token_hash`
  - [x] Índice por `token_hash` nas duas tabelas de credencial

- [x] **Task 2 — `platform/auth/token.ts`** (AC: #6)
  - [x] `gerarToken()`: 32 bytes de `randomBytes` em base64url (256 bits de entropia)
  - [x] `hashToken(token)`: SHA-256 hex — o que vai ao banco
  - [x] Sem salt é correto **aqui**: token de 256 bits não é senha, não há dicionário a percorrer. Salt só protegeria contra rainbow table de segredo de baixa entropia

- [x] **Task 3 — Contratos Zod** (AC: #1)
  - [x] `application/contracts/autenticacao.ts` — fonte única (AD-6)
  - [x] Input de solicitar link (e-mail), input de trocar token, output da sessão
  - [x] O output da sessão **não** repete o token: quem o recebe já o tem

- [x] **Task 4 — Port de identidade** (AC: #1, #4, #5)
  - [x] `application/ports/identity-repository.ts`
  - [x] `buscarUsuarioPorEmail`, `criarLinkDeLogin`, `consumirLinkDeLogin`, `criarSessao`, `buscarSessaoPorHash`
  - [x] `consumirLinkDeLogin` é **uma** operação atômica (`UPDATE ... WHERE usado_em IS NULL RETURNING`) — ler-e-depois-marcar deixa janela para usar o mesmo link duas vezes
  - [x] Port de envio do link (`application/ports/notificador.ts`); o transporte real é a Story 1.6

- [x] **Task 5 — `platform/auth/autenticacao.ts`** (AC: #1, #3, #4, #5)
  - [x] `solicitarLink`, `autenticarComLink`, `resolverPrincipal`
  - [x] **Relógio injetado** (`agora: () => Date`) — expiração testada sem `sleep`
  - [x] Um erro só: `CredencialInvalida`, mesma mensagem para todos os casos do AC #4
  - [x] `papel` lido de `users`; nunca da entrada

- [x] **Task 6 — Adapter de persistência** (AC: #1, #4, #5)
  - [x] `adapters/persistence/identity-repository.ts` com Drizzle
  - [x] E-mail normalizado (trim + lowercase) na escrita e na busca

- [x] **Task 7 — Adapter MCP: a origem do principal muda** (AC: #2)
  - [x] `McpDeps.principal` (valor de config) → `McpDeps.autenticar` (função que resolve a sessão)
  - [x] Resolve **a cada chamada**: sessão que expira no meio da conexão precisa parar de funcionar
  - [x] `origin: 'mcp'` segue carimbado pelo adapter (AD-9)
  - [x] Falha de credencial vira erro de tool com o mesmo shape `[code] mensagem` da 1.1/1.2

- [x] **Task 8 — Testes** (AC: #1..#6)
  - [x] **Caminho negativo antes do positivo**: ausente, malformado, expirado, já usado, inexistente, de outro principal
  - [x] Comparar as mensagens **entre si** (padrão da 1.2), não cada uma isolada
  - [x] Integração contra Postgres real: fluxo completo e-mail → link → sessão → principal
  - [x] E-mail não cadastrado: mesma resposta **e** zero linhas em `login_links`
  - [x] Grep no que é persistido/retornado: token cru não aparece
  - [x] **Verificar por mutação** — tabela obrigatória no Dev Agent Record

- [x] **Task 9 — Fechar a questão em aberto nos artefatos** (AC: #1)
  - [x] PRD §13 Q7 → respondida
  - [x] Spine *Deferred* → "Auth concreta" sai de deferido e vira decisão registrada

## Dev Notes

### A decisão que destravou esta story

FR-19 dizia "login corporativo **ou** magic link" e a escolha estava aberta em
dois lugares: PRD §13 Q7 e a seção *Deferred* da spine. Story bloqueada até
2026-08-10, quando o dono do projeto decidiu:

| Ponto | Decisão |
| --- | --- |
| Mecanismo | **Magic link** por e-mail — sem senha para armazenar, hashear ou resetar |
| Onde a sessão mora | **Tabela no Postgres**, token guardado **hasheado** |
| Validade do link | **15 min**, uso único |
| Validade da sessão | **8 horas** |

Nada além disso foi decidido. Se a implementação precisar de uma política de
segurança que não esteja nesta tabela, **isso é bloqueio** — não invente.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
| --- | --- |
| Envio real de e-mail (SMTP/Resend) | 1.6 — aqui só o **port**, com fake nos testes |
| Regras de visibilidade por papel | 1.4 |
| Token escopado do cliente MCP + rate limit | 1.5 |
| Revogação/logout, refresh de sessão | fora do MVP |
| Cadastro de usuário pela aplicação | fora do MVP — `users` é semeado |

### ⚠️ O ponto sutil desta story: o desenho não pode vazar para dentro

Até aqui o principal vem de configuração (`McpDeps.principal`, um
`Omit<Principal, 'origin'>`). Esta story troca **a origem do valor**, e só isso.

**Teste objetivo ao final:** `git diff --stat` deve mostrar **zero** mudanças em
`src/domain/ticket.ts`, `src/domain/visibilidade.ts`,
`src/application/commands/`, `src/application/queries/`,
`src/application/ports/ticket-repository.ts` e
`src/adapters/persistence/ticket-repository.ts`. Se algum desses aparecer no
diff, o desenho está errado — pare e reveja, não force.

O que é aditivo e permitido: tabelas novas, port novo, adapter novo, um `code`
novo em `domain/errors.ts`. A spine cita `Unauthorized` entre os erros de
domínio tipados, então `CredencialInvalida` no mesmo enum mantém **um** shape de
erro em vez de duplicar a classe.

### ⚠️ O segundo ponto sutil: o que cada erro conta a quem sonda

A 1.2 estabeleceu que "não existe" e "não é seu" precisam ser indistinguíveis.
Aqui o mesmo raciocínio se aplica em **dois** lugares distintos, e por motivos
distintos:

1. **Solicitar link** (AC #3) — e-mail cadastrado e não cadastrado dão a mesma
   resposta. Diferença aqui vaza *quem trabalha na empresa*.
2. **Trocar token / resolver sessão** (AC #4, #5) — inexistente, expirado e já
   usado dão o mesmo erro. Diferença aqui diz ao atacante se o token que ele
   tem é *real mas velho* (vale continuar tentando variações) ou *inventado*.

Falha de autenticação e "credencial válida sem permissão" são coisas diferentes
— a segunda é a Story 1.4. Aqui **tudo** que é credencial ruim colapsa em
`CredencialInvalida`.

### Padrão das Stories 1.1 e 1.2 — copiar

- Domínio puro, sem imports para fora (AD-1); contratos Zod como fonte única (AD-6)
- Erros tipados com `code`; adapter traduz, não inventa formato
- Arquivos `kebab-case`, um caso de uso por arquivo
- Imports com extensão `.js`, `import type` para tipos (`verbatimModuleSyntax`)
- Port com operação **única e atômica** quando a atomicidade é a garantia
  (foi assim que a 1.1 resolveu auditoria transacional; aqui vale para o
  consumo do link)
- Datas ISO 8601 UTC no wire (Consistency Conventions)

### Armadilhas conhecidas — herdadas das stories anteriores

- **Cobertura global esconde arquivo descoberto.** Ler a tabela **por arquivo**
  do `pnpm test:coverage`. Na 1.2, 87,5% global passava o gate de 80% com o
  adapter MCP em 72% e uma função sem nenhum teste.
- **`await promessa.catch((e) => e as Error)` não devolve `Error`** — devolve a
  união com a saída de sucesso. Reusar o helper `erroDe` que estreita com
  `ehDomainError` e falha quando não há erro.
- **`psql -f` sai com código 0 mesmo com SQL quebrado** — o `db:migrate` já usa
  `-v ON_ERROR_STOP=1` e itera sobre `drizzle/migrations/*.sql`. **Não**
  referenciar migration por nome.
- **`noUncheckedIndexedAccess`**: acesso a índice de array pode ser `undefined`.
- **Teste de tempo sem relógio injetado vira `sleep`** — lento e instável no CI.
- **`required_conversation_resolution`**: o `claude-review` comenta em todo PR;
  conversa aberta bloqueia o merge. Ler, corrigir se for achado real, e só
  então resolver.

### Verificação por mutação — obrigatória

As 1.1 e 1.2 provaram os testes enfraquecendo o código e confirmando reprovação.
Auth que passa no teste com a verificação removida **não está testada**. Mínimo
a aplicar e registrar:

| Mutação | Teste que deve reprovar |
| --- | --- |
| Remover a checagem de expiração do link | expirado |
| Remover a checagem de `usado_em` | uso único |
| Remover a checagem de expiração da sessão | sessão de 8h |
| Comparar token **cru** em vez do hash | fluxo completo |
| Ler `papel` da entrada em vez de `users` | escalada de papel |
| Criar link para e-mail não cadastrado | AC #3 (zero linhas) |

### Ambiente

```bash
source ~/.nvm/nvm.sh && nvm use 24
export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
docker-compose up -d    # `docker compose` sem hífen NÃO existe nesta máquina
pnpm db:migrate
```

Sob sandbox, `docker`, `psql`/Postgres e `gh` são bloqueados — o que inclui
qualquer teste de integração e todo o ciclo de PR.

### References

- [Source: epics.md#Story 1.3] — user story e ACs originais
- [Source: prd.md#FR-19] — autenticação simples, sem SSO/AD no MVP
- [Source: prd.md#§13 Q7] — a questão que esta story fecha
- [Source: ARCHITECTURE-SPINE.md#AD-8] — principal injetado em todo caso de uso
- [Source: ARCHITECTURE-SPINE.md#AD-9] — identidade (nunca a credencial) é o autor auditado
- [Source: ARCHITECTURE-SPINE.md#Capability Map] — identidade vive em `platform/auth` + `application`
- [Source: ARCHITECTURE-SPINE.md#Deferred] — "auth concreta" era deferido; esta story o fecha
- [Source: 1-1-abrir-um-chamado-via-mcp-tracer-bullet.md] — padrão base
- [Source: 1-2-ver-um-chamado-via-mcp.md] — erro único e não-vazamento

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A story começou bloqueada e só saiu do bloqueio por decisão do dono.** FR-19
oferecia dois mecanismos e nenhum artefato escolhia: PRD §13 Q7 aberta, spine
com "auth concreta" em *Deferred*. Implementar a AC #1 sem isso exigiria
inventar mecanismo, formato de credencial, onde ela mora e por quanto tempo
vale — política de segurança fabricada por quem estava com pressa de fechar a
story. O loop parou e perguntou; a decisão veio e está registrada na tabela do
Dev Notes, no PRD e na spine (Task 9).

**A subtask "o output da sessão não repete o token" estava errada e foi
invertida.** Ela vale para o token do *link* (quem troca já o tem), mas o token
de *sessão* nasce no servidor durante a troca: se não voltar ali, não volta
nunca, e a sessão criada é inutilizável. O `sessaoCriadaOutputSchema` devolve
`tokenDeSessao` — e esse é o único instante em que a credencial existe em texto
claro fora do cliente. Corrigido no contrato, com o motivo escrito nele.

**A normalização de e-mail ficou num lugar só, contra o que a Task 6 pedia.**
A subtask mandava normalizar "na escrita e na busca" do adapter; o serviço
também precisa normalizar antes de procurar o cadastro. Dois pontos de
normalização podem divergir, e divergir aqui significa a mesma pessoa virar
duas identidades. Ficou no serviço (`normalizarEmail`), e o adapter grava o que
recebe. Consequência que precisa ser respeitada: **o seed de `users` tem que
gravar e-mail já normalizado** — não há aplicação cadastrando usuário no MVP.

**`sessions` não guarda `papel`, ao contrário do que a Task 1 listava.** Papel
congelado na sessão sobreviveria por até 8 horas a um rebaixamento, e a sessão
de alguém removido do cadastro continuaria resolvendo. Com o `INNER JOIN users`
na resolução, as duas coisas passam a valer imediatamente. Custa uma junção por
chamada, sobre índice único, com ~100 usuários. Os dois comportamentos têm
teste de integração e a mutação "congelar o papel" reprova.

**Link expirado é consumido ao ser tentado.** Consequência de o `usado_em` ser
marcado pelo `UPDATE` atômico antes de o serviço olhar o relógio. Deliberado:
o link já não valia, queimá-lo não abre porta nenhuma, e separar "expirado" de
"usado" no SQL devolveria ao serviço exatamente a distinção que o AC #4 manda
esconder.

**`papelSchema.parse` no adapter, onde o `ticket-repository` usa `as`.** A
diferença é consciente: `status as Status` errado dá um Chamado com status
estranho; `papel as Papel` errado cai silenciosamente no ramo "não é agente" —
ou pior, num papel que nenhuma regra reconhece. Numa fronteira que decide o que
a pessoa enxerga, a falha tem que ser alta e visível.

**Cobertura: 99,33% global, e a leitura foi por arquivo.** Todos os arquivos
desta story estão em 100%. A única linha descoberta do projeto inteiro é
`ticket-repository.ts:37` (o `throw` de INSERT sem retorno), herdada da Story
1.1 e fora deste escopo. O `contracts/autenticacao.ts` apareceu com **0%** na
primeira medição — os schemas eram usados só como tipo, e nada os importava em
runtime. É a mesma armadilha que a 1.2 catalogou, e a média global de 96,68%
teria escondido. Coberto com testes que travam o shape, inclusive um que
verifica que a saída de `solicitarLink` não ganhou campo revelando existência.

**Sete mutações aplicadas, sete reprovações** (script em
`scratchpad/mutacoes.py`, executado com o banco real):

| Mutação aplicada | Reprovou |
| --- | --- |
| Remover a checagem de expiração do link | `recusa token expirado` (unidade **e** integração) |
| Remover a checagem de expiração da sessão | `recusa sessao expirada` (unidade **e** integração) |
| Buscar a sessão pelo token cru em vez do hash | `fluxo completo` (3 testes) |
| Devolver papel fixo em vez do papel do cadastro | `o papel vem do cadastro` (unidade **e** integração) |
| Criar link para e-mail fora do cadastro | `nao cria nem envia link` (14 testes) |
| Remover o `usado_em IS NULL` do consumo | `o mesmo token nao entra duas vezes` (3 testes) |
| Congelar o papel na sessão | `rebaixar o usuario derruba o privilegio` |

**O desenho não vazou para dentro, e isso foi medido, não presumido.**
`git diff --name-only` sobre `domain/ticket.ts`, `domain/visibilidade.ts`,
`application/commands/`, `application/queries/`,
`application/ports/ticket-repository.ts` e
`adapters/persistence/ticket-repository.ts` volta **vazio**. O que mudou fora
do que é novo: `drizzle/schema.ts` (três tabelas), `domain/errors.ts` (um
`code`) e `adapters/mcp/server.ts` (a troca de `principal` por `autenticar`).

### Completion Notes List

- **Task 1** — migration `0003` aplicada e conferida no banco com `\d` (as três
  tabelas existem, com os `UNIQUE` em `token_hash`). O `UNIQUE` já cria o
  índice; um índice adicional seria redundante.
- **Task 2** — token de 32 bytes (`randomBytes`) em base64url; SHA-256 hex no
  banco. Sem salt e sem KDF lento, com o motivo escrito no módulo: o segredo
  tem 256 bits sorteados, não há dicionário nem tabela a pré-computar.
- **Task 3** — contratos Zod como fonte única (AD-6); `role` no output usa o
  `papelSchema` já existente em vez de redeclarar os dois papéis.
- **Task 4** — `consumirLinkDeLogin` é uma operação só. O uso único é garantia
  do banco, não da ordem em que o código roda — e há um teste que dispara duas
  trocas simultâneas do mesmo link e exige **uma** sessão.
- **Task 5** — relógio injetado; expiração testada sem `sleep`. Um erro só
  (`CredencialInvalida`) para inexistente, expirado, usado, vazio e usuário fora
  do cadastro. A borda é `<=`: no instante do vencimento já não vale.
- **Task 6** — adapter só guarda, busca e consome; nenhuma decisão de validade.
- **Task 7** — `McpDeps.autenticar` no lugar de `McpDeps.principal`, resolvido
  **a cada** chamada de tool. Autenticar acontece antes do caso de uso: Chamado
  gravado antes de saber o autor violaria o AD-3 e ficaria no banco.
- **Task 8** — **112 testes** no total (eram 100 na 1.2 → 12 arquivos). 27 de
  unidade em `platform/auth`, 14 de integração contra Postgres real, 11 de
  contrato, 3 novos no adapter MCP.
- **Task 9** — Q7 respondida no PRD (§13 e FR-19) e "auth concreta" saiu do
  *Deferred* da spine, com a decisão registrada nas Consistency Conventions.

**Decisão sobre mensagem de erro, escrita porque a seção 6 do prompt do loop
pede que seja deliberada:** falha de autenticação e "credencial válida sem
permissão" são coisas diferentes, mas a segunda é a Story 1.4 — aqui **tudo**
que é credencial ruim colapsa em `CredencialInvalida`, com mensagem
`'Credencial invalida.'`. Há teste que compara os erros **entre si** (não cada
um isolado) e outro que varre a mensagem procurando as palavras que
distinguiriam os casos (`expir`, `usado`, `inexistente`, `cadastr`).

**Não provado — registrado em vez de deixado implícito:**

1. **O envio do e-mail não foi exercitado.** O port `NotificadorDeLogin` existe
   e os testes usam um duble que captura o token. O transporte real é a Story
   1.6: o fluxo está provado **até** a fronteira do envio, não através dela.
2. **Não há composition root.** O projeto ainda não tem entrypoint (`main.ts`),
   então `resolverPrincipal` não está ligado a um servidor MCP em execução —
   como o `McpDeps.principal` também não estava. O que existe é a estrutura e a
   prova em teste; a ligação acontece quando a Story 1.5 trouxer o token do
   cliente MCP.
3. **Sem rate limit em `solicitarLink`.** Forçar bruta contra token de 256 bits
   é inviável, mas pedir muitos links é um vetor de spam de caixa de entrada. O
   rate limit é a Story 1.5, e esta story não o antecipa.
4. **Sem revogação/logout.** Fora do MVP — a sessão morre por expiração, por
   rebaixamento ou por remoção do usuário.
5. **`solicitarLink` vaza pelo relógio, não pela resposta.** O caminho do
   e-mail cadastrado faz um INSERT e chama o notificador; o do não cadastrado
   não faz nada. As respostas são idênticas (AC #3, com teste), mas os tempos
   não. É um oráculo fraco e mensurável só com muitas amostras, e some quando
   o envio da Story 1.6 for assíncrono. Registrado por ser um vazamento real
   que nenhum teste desta story pega.
6. **Solicitar o link várias vezes cria vários links válidos ao mesmo tempo.**
   Invalidar os anteriores a cada pedido é o padrão comum, e reduziria a
   janela de um link interceptado. **Não implementado de propósito**: é
   política de segurança, e a decisão do dono cobriu mecanismo, armazenamento
   e prazos — não isto. Fica para decisão explícita, junto do rate limit da
   Story 1.5.
7. **`login_links` e `sessions` crescem sem expurgo.** Linha usada ou vencida
   fica para sempre. Não é exposição (só há hash), mas é dívida operacional —
   a limpeza precisa de dono.

**O `claude-review` passou sem dizer nada — duas vezes.** Primeira execução:
5 turns, 14 s, US$ 0,15, `is_error: false`, "No buffered inline comments".
Segunda, sobre o commit seguinte: 1m42s de job, e mesmo assim **zero**
comentários — nem inline (`/pulls/31/comments` vazio), nem geral, nem review
formal. No PR #28, com diff *menor*, foram 26–31 turns e dois comentários.

Não é o silêncio da Story 0.6 (PR tocando o próprio workflow), porque o modelo
de fato executou. É um quarto modo: **executa e não emite nada**, nem para
dizer que não encontrou violação. Como o check fica verde e nenhuma conversa
abre, o merge não depende dele — e é exatamente por isso que fica registrado:
na story de **autenticação**, a que a seção 6 do prompt do loop marcou como a
fronteira de segurança do sistema, o review por IA contribuiu com nada. As
lacunas 5 a 7 acima saíram de releitura própria, não do revisor.

Isso reforça o resultado da Story 0.6 em vez de contradizê-lo: o `claude-review`
segue sem ter reprovado nada neste projeto, e agora também sem falar.

### File List

- `drizzle/migrations/0003_identidade.sql` (novo)
- `drizzle/schema.ts` (modificado — `users`, `login_links`, `sessions`)
- `src/platform/auth/token.ts` + teste (novos)
- `src/platform/auth/autenticacao.ts` + teste (novos)
- `src/application/contracts/autenticacao.ts` + teste (novos)
- `src/application/ports/identity-repository.ts` (novo)
- `src/application/ports/notificador-de-login.ts` (novo)
- `src/adapters/persistence/identity-repository.ts` + teste (novos)
- `src/domain/errors.ts` (modificado — code `CredencialInvalida`)
- `src/adapters/mcp/server.ts` + teste (modificados — `principal` → `autenticar`)
- `_bmad-output/planning-artifacts/prds/prd-ServiceDesk-2026-08-08/prd.md` (modificado — Q7 e FR-19)
- `_bmad-output/planning-artifacts/architecture/architecture-ServiceDesk-2026-08-08/ARCHITECTURE-SPINE.md` (modificado — Deferred e Conventions)
- `_bmad-output/implementation-artifacts/{1-3-...,sprint-status.yaml}` (modificados)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-10 | Story criada; decisão de FR-19/Q7 tomada pelo dono do projeto (magic link, sessão em tabela, 15 min / 8 h) |
| 2026-08-10 | Tasks 1–2: migration `0003` conferida no banco; geração e hash de token |
| 2026-08-10 | Tasks 3–5: contratos, ports e o serviço de autenticação com relógio injetado |
| 2026-08-10 | Tasks 6–7: adapter Drizzle e a troca de `McpDeps.principal` por `McpDeps.autenticar` |
| 2026-08-10 | Task 8: 112 testes; cobertura 99,33% com todos os arquivos da story em 100% |
| 2026-08-10 | Sete mutações aplicadas e reprovadas — AC #1 a #6 verificadas |
| 2026-08-10 | Task 9: Q7 fechada no PRD e "auth concreta" removida do *Deferred* da spine |
| 2026-08-10 | PR #31: nove checks verdes; `claude-review` executou duas vezes e não comentou nenhuma |
| 2026-08-10 | Registradas três lacunas encontradas em releitura própria (timing, links simultâneos, expurgo) |
| 2026-08-10 | PR #31 mergeado. Story `done` |
