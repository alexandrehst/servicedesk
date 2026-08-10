---
baseline_commit: 9ee7b49
---

# Story 1.5: Segurança do adapter MCP (token escopado + rate limit)

Status: done

## Story

As a construtor,
I want que cada cliente MCP use token escopado por identidade e sofra rate limit,
so that uma IA em loop ou um token vazado não comprometam o sistema.

## Acceptance Criteria

1. **Given** o adapter MCP exposto
   **When** um cliente se conecta
   **Then** autentica com **token de máquina** escopado por identidade, e a
   identidade — não o nome da tool — é gravada como autor no audit (FR-21, AD-9).

2. **Given** um cliente excedendo 60 chamadas por minuto
   **When** o limite é atingido
   **Then** novas chamadas são recusadas até a janela reabrir, com erro
   **distinto** do de credencial inválida.

3. **Given** uma ação via token
   **When** ela é auditada
   **Then** o registro distingue "humano via IA" de agente autônomo **pela
   identidade** (AD-9) — provado com as duas identidades gravando no mesmo
   `audit_entries`.

4. **Given** um token revogado
   **When** ele é apresentado
   **Then** deixa de resolver principal, com o mesmo `CredencialInvalida` da
   Story 1.3 — sem distinguir revogado de inexistente.

5. **Given** que o contador vive no Postgres
   **When** o processo reinicia no meio da janela
   **Then** o limite continua valendo — contador em memória zeraria e um cliente
   em loop contornaria reiniciando.

6. **Given** duas chamadas simultâneas da mesma identidade
   **When** ambas incrementam o contador
   **Then** nenhuma se perde: o incremento é atômico no banco, como o consumo do
   link de login da Story 1.3.

## Tasks / Subtasks

- [x] **Task 1 — Migration `0004` + schema** (AC: #1, #4, #5)
  - [x] `mcp_tokens`: `id`, `identity`, `token_hash` (único), `descricao`,
        `expira_em` (nullable), `revogado_em` (nullable), `criado_em`
  - [x] `rate_limit`: `identity`, `janela`, `chamadas`, com **chave primária
        composta** `(identity, janela)` — é ela que torna o UPSERT atômico
  - [x] Nenhuma coluna guarda token em texto claro

- [x] **Task 2 — Ports** (AC: #1, #4, #6)
  - [x] `buscarTokenMcpPorHash` no `IdentityRepository` — join com `users` para
        o papel **atual**, mesmo padrão da sessão (Story 1.3)
  - [x] `RateLimitRepository.registrarChamada(identity, janela)` devolvendo o
        contador **depois** do incremento
  - [x] O incremento é `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`: uma
        operação, sem janela entre ler e escrever

- [x] **Task 3 — Resolver principal de token de máquina** (AC: #1, #4)
  - [x] `resolverPrincipalDeTokenMcp` em `platform/auth`
  - [x] Token inexistente, revogado ou expirado → o **mesmo**
        `CredencialInvalida`
  - [x] Reusa `hashToken` — o banco continua vendo só hash

- [x] **Task 4 — Limitador** (AC: #2, #5, #6)
  - [x] `src/platform/limites/rate-limit.ts`, com relógio injetado
  - [x] Janela fixa de 1 minuto, limite **60** por identidade
  - [x] Erro `LimiteExcedido` — **distinto** de `CredencialInvalida`, com o
        instante em que a janela reabre

- [x] **Task 5 — Adapter MCP** (AC: #1, #2)
  - [x] `McpDeps.limitarChamadas`, aplicado **depois** de autenticar (o limite é
        por identidade, então precisa saber quem é antes)
  - [x] Limite estourado vira erro de tool com o mesmo shape `[code] mensagem`

- [x] **Task 6 — Testes** (AC: #1..#6)
  - [x] Negativo antes do positivo: token inexistente, revogado, expirado
  - [x] Revogado e inexistente comparados **entre si**
  - [x] Integração: 60 passam, a 61ª é recusada, e a janela seguinte libera
  - [x] Concorrência: N chamadas simultâneas incrementam N vezes, sem perder
  - [x] Auditoria com **duas identidades** distintas (pessoa e bot) no mesmo
        `audit_entries`
  - [x] **Verificar por mutação** — tabela obrigatória no Dev Agent Record

- [x] **Task 7 — Fechar a decisão nos artefatos** (AC: #1, #2)
  - [x] PRD FR-21 e spine passam a registrar: token de máquina revogável,
        60/min por identidade, contador no Postgres

## Dev Notes

### A decisão que destravou esta story

FR-21 pedia "token escopado por identidade e rate limit" sem dizer o que é o
token nem qual é o limite, e a spine não cobria nenhum dos dois. Bloqueada até
2026-08-10, quando o dono do projeto decidiu:

| Ponto | Decisão |
| --- | --- |
| Token do cliente MCP | **Credencial de máquina separada**, revogável, com identidade própria |
| Limite | **60 chamadas por minuto**, por identidade |
| Onde o contador mora | **Postgres** |

O motivo da primeira decisão é o AD-9: se o agente autônomo usasse a sessão da
pessoa, as ações dele ficariam auditadas como se fossem dela — e a AC #3
("distingue humano via IA de agente autônomo") seria impossível de cumprir.

Nada além disso foi decidido. **Prazo de validade do token não foi definido** —
a coluna `expira_em` existe e aceita `null` (não expira), mas nenhum valor
padrão é inventado aqui.

### O que já existe e não deve ser reinventado

| O que | Onde | Desde |
| --- | --- | --- |
| `gerarToken` / `hashToken` | `platform/auth/token.ts` | 1.3 |
| `CredencialInvalida`, erro único | `domain/errors.ts` + `platform/auth` | 1.3 |
| Papel lido do cadastro a cada resolução | `buscarSessaoPorHash` | 1.3 |
| Identidade como autor da auditoria | `criarComAuditoria` | 1.1 |
| Autorização por papel | `domain/papeis.ts` + `visivelPara` | 1.4 |

O token de máquina **reusa `users`**: o bot é uma linha de cadastro com papel,
então toda a autorização da 1.4 vale para ele sem uma linha de código nova.

### O ponto sutil: dois erros que não podem virar um

`CredencialInvalida` e `LimiteExcedido` **precisam** ser distinguíveis, e isso é
o oposto do que as 1.2 e 1.3 decidiram para os casos delas.

O motivo é que a informação vazada aqui é útil para quem tem direito e inútil
para quem não tem: um cliente legítimo que bate no limite precisa saber que
**adianta tentar de novo mais tarde** — se receber "credencial inválida", vai
concluir que o token morreu e alguém vai reemitir um token que estava bom.

Já *dentro* de cada categoria a regra anterior continua valendo: token
inexistente, revogado e expirado devolvem exatamente a mesma coisa.

### O ponto sutil 2: quem é limitado é a identidade, não a conexão

Limitar por conexão ou por processo seria contornável abrindo outra. O contador
é por identidade e vive no banco — é isso que faz a AC #5 (sobreviver ao
restart) e a AC #6 (incremento atômico) serem verificáveis.

**Consequência aceita:** credencial inválida **não** consome quota, porque a
identidade só é conhecida depois de autenticar. Isso deixa a força bruta de
token sem rate limit — irrelevante contra 256 bits de entropia, e registrado no
Dev Agent Record em vez de deixado implícito.

**Janela fixa, não deslizante.** Uma rajada na virada do minuto pode chegar a
120 chamadas em poucos segundos. É a limitação conhecida do modelo simples, e o
objetivo — barrar uma IA em loop, que faria centenas por minuto — segue
atingido.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
| --- | --- |
| Emissão de token por interface (CLI/API) | fora do MVP — token é semeado, como `users` |
| Rate limit em `solicitarLink` | lacuna da 1.3, ainda aberta — ver Dev Agent Record |
| Invalidar links de login anteriores | idem |
| Expurgo de `login_links`/`sessions`/`rate_limit` | idem |
| Confirmação de ações irreversíveis | 2.6 |

### Armadilhas conhecidas

- **Teste de janela precisa de relógio injetado** — `sleep(60s)` no CI é
  inaceitável.
- **Teste de concorrência precisa de `Promise.all` de verdade**: sequencial,
  ele passaria mesmo com incremento não-atômico (foi assim que a 1.3 provou o
  uso único do link).
- **Cobertura por arquivo**, não a média.
- **Verde do `claude-review` não é evidência de review** — três PRs seguidos
  sem um comentário. Conferir `/pulls/NN/comments`.
- **Migration nova entra em `drizzle/migrations/`** e o `db:migrate` itera sobre
  todas — não referenciar por nome.

### Ambiente

```bash
source ~/.nvm/nvm.sh && nvm use 24
export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
docker-compose up -d && pnpm db:migrate
```

### References

- [Source: epics.md#Story 1.5]
- [Source: prd.md#FR-21] — token escopado e rate limit
- [Source: prd.md#FR-22] — auditoria distingue humano via IA de agente autônomo
- [Source: ARCHITECTURE-SPINE.md#AD-9] — identidade do token é o autor auditado
- [Source: 1-3-autenticacao-e-identidade.md] — hash, erro único, atomicidade no banco
- [Source: 1-4-papeis-e-autorizacao.md] — papel do cadastro vale para o bot também

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A story começou bloqueada, como a 1.3.** FR-21 pedia "token escopado por
identidade e rate limit" e nenhum artefato dizia o que era o token nem qual era
o limite. As duas decisões vieram do dono em 2026-08-10 e estão na tabela do
Dev Notes, no PRD (FR-21) e na spine (Consistency Conventions).

**O motivo de o token de máquina ser separado não é organização, é o AD-9.**
Se o agente autônomo usasse a sessão da pessoa, as ações dele apareceriam na
auditoria como se fossem dela — e a AC #3, que pede exatamente essa distinção,
seria impossível de cumprir com qualquer quantidade de código. O teste que a
prova abre dois Chamados, um por token, e compara os dois autores em
`audit_entries`.

**O bot é uma linha de `users`.** Consequência boa e deliberada: toda a
autorização por papel da Story 1.4 vale para ele sem uma linha nova, inclusive
rebaixá-lo. E `buscarTokenMcpPorHash` usa o mesmo `INNER JOIN users` da sessão,
então bot removido do cadastro para de resolver mesmo com token válido — tem
teste.

**A ordem no adapter importa e está testada.** Autenticar → limitar → executar.
Limitar antes de autenticar é impossível (o limite é por identidade, e ela só
existe depois); limitar depois de executar deixaria a IA em loop gravar tudo
antes de ser barrada. O teste `sem tocar no repositorio` trava isso, e a
mutação que remove a chamada do limitador reprova nele.

**Credencial inválida não consome quota.** É consequência direta de limitar por
identidade: sem identidade, não há o que contar. Na prática significa que força
bruta de token não é limitada — irrelevante contra 256 bits de entropia, mas
registrado aqui em vez de deixado implícito, e com teste que documenta o
comportamento.

**`LimiteExcedido` é distinto de `CredencialInvalida`, e isso contraria o
padrão das 1.2 e 1.3 de propósito.** Ali, distinguir os casos ajudava quem
sondava. Aqui, quem recebe o erro já provou quem é: se ler "credencial
inválida" ao bater no limite, vai concluir que o token morreu e alguém vai
reemitir um token que estava bom. A mensagem diz **quando** a janela reabre e
**não** diz a identidade — ela vira log do lado do cliente, que já sabe quem é.

**O contador incrementa antes de checar, e a chamada recusada também conta.**
Deliberado: um cliente em loop que ignora o erro continua somando e não ganha
uma janela de chamadas grátis por estar sendo recusado.

**`rate-limit-repository.ts` apareceu com 83,33%** — a linha descoberta era o
`throw` do UPSERT sem retorno. Vale mais que cobertura: se aquele caminho
devolvesse `0` em silêncio, o contador ficaria eternamente abaixo do teto e **o
rate limit deixaria de existir**, sem nenhum teste vermelho e sem nenhum log.
Coberto com um duble mínimo do encadeamento do Drizzle devolvendo zero linhas.

**Sete mutações aplicadas, sete reprovações** (script em
`scratchpad/mutacoes-15.py`):

| Mutação aplicada | Reprovou |
| --- | --- |
| Afrouxar o teto (10×) | `a chamada 61 e recusada` (9 testes) |
| Apertar o teto em um (off-by-one) | `a chamada 60 ainda passa` (11 testes) |
| Ignorar a janela: contar num balde só | `a janela seguinte reabre` (4 testes) |
| Limite global em vez de por identidade | `o limite de um cliente nao derruba o outro` |
| UPSERT que sobrescreve em vez de somar | `chamadas simultaneas nao se perdem` (6 testes) |
| Aceitar token de máquina revogado | `token revogado para de resolver` (3 testes) |
| Não limitar a escrita no adapter | `sem tocar no repositorio` |

A quinta é a que mais importa: ela simula exatamente o incremento não-atômico,
e só é pega porque o teste usa `Promise.all`. Em sequência, o código errado
passaria — mesma armadilha que a Story 1.3 documentou para o uso único do link.

### Completion Notes List

- **Task 1** — migration `0004` aplicada e conferida com `\d`. A chave primária
  composta `(identity, janela)` não é detalhe: é ela que dá ao `ON CONFLICT` a
  linha sobre a qual travar.
- **Task 2** — `registrarChamada` devolve o contador **já incrementado**. Se
  devolvesse o anterior, quem chama somaria 1 por conta própria e duas chamadas
  simultâneas somariam sobre o mesmo número.
- **Task 3** — inexistente, revogado e expirado devolvem o mesmo
  `CredencialInvalida`; comparados entre si em teste.
- **Task 4** — janela fixa de um minuto, limite 60, relógio injetado. Um teste
  trava o próprio número: mudá-lo sem revisitar a decisão do dono reprova.
- **Task 5** — `McpDeps.limitarChamadas` aplicado nas duas tools. A leitura
  também conta: uma IA em loop consultando sem parar custa banco igual, e o
  FR-21 fala de chamadas, não de escritas.
- **Task 6** — **172 testes** (eram 134). Cobertura **99,5%**, com todos os
  arquivos desta story em 100%.
- **Task 7** — decisão registrada no PRD (FR-21) e na spine.

**Não provado — registrado em vez de deixado implícito:**

1. **Janela fixa, não deslizante.** Uma rajada na virada do minuto pode chegar a
   120 chamadas em poucos segundos. Limitação conhecida do modelo simples; o
   alvo declarado (IA em loop, centenas por minuto) segue coberto.
2. **Emissão de token não tem interface.** `mcp_tokens` é semeada direto no
   banco, como `users`. Fora do MVP.
3. **Prazo do token não foi decidido** — `expira_em` aceita nulo e o mecanismo
   de expiração está testado, mas nenhum padrão foi inventado.
4. **As três lacunas da Story 1.3 continuam abertas**: `solicitarLink` sem rate
   limit, links de login válidos simultâneos sem invalidação do anterior, e
   `login_links`/`sessions`/`rate_limit` sem expurgo. O limitador agora existe e
   pode ser reusado no primeiro caso — não foi feito aqui porque o limite é por
   identidade autenticada, e em `solicitarLink` ainda não há identidade provada.
5. **Ainda não há composition root.** Nem `autenticar` nem `limitarChamadas`
   estão ligados a um servidor em execução; o que existe é a estrutura e a prova
   em teste.
6. **`claude-review` mudo pelo quinto PR seguido.** No PR #35 passou verde em
   48 s com zero comentários. A sequência agora é #31 (duas execuções), #32,
   #33, #34 e #35 — atravessando as três stories de fronteira de segurança do
   Epic 1. Nenhum achado desta story veio dele: saíram das mutações, da leitura
   da cobertura por arquivo e da releitura própria.

### File List

- `drizzle/migrations/0004_token_mcp_e_rate_limit.sql` (novo)
- `drizzle/schema.ts` (modificado — `mcp_tokens`, `rate_limit`)
- `src/application/ports/rate-limit-repository.ts` (novo)
- `src/application/ports/identity-repository.ts` (modificado — `buscarTokenMcpPorHash`)
- `src/platform/limites/rate-limit.ts` + teste (novos)
- `src/platform/auth/autenticacao.ts` + teste (modificados — `resolverPrincipalDeTokenMcp`)
- `src/adapters/persistence/rate-limit-repository.ts` + teste (novos)
- `src/adapters/persistence/identity-repository.ts` (modificado)
- `src/domain/errors.ts` (modificado — code `LimiteExcedido`)
- `src/adapters/mcp/server.ts` + teste (modificados — `limitarChamadas`)
- `_bmad-output/planning-artifacts/prds/.../prd.md` (modificado — FR-21)
- `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` (modificado)
- `_bmad-output/implementation-artifacts/{1-5-...,sprint-status.yaml}` (modificados)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-10 | Story criada; decisão de FR-21 tomada pelo dono (token de máquina, 60/min, contador no Postgres) |
| 2026-08-10 | Tasks 1–4: migration conferida no banco, ports, resolvedor de token de máquina e limitador |
| 2026-08-10 | Task 5: `limitarChamadas` no adapter MCP, depois de autenticar e antes de executar |
| 2026-08-10 | Task 6: 172 testes; cobertura 99,5% com todos os arquivos da story em 100% |
| 2026-08-10 | Sete mutações aplicadas e reprovadas |
| 2026-08-10 | Task 7: decisão de FR-21 registrada no PRD e na spine |
| 2026-08-10 | PR #35: nove checks verdes; `claude-review` mudo pelo quinto PR seguido |
| 2026-08-10 | PR #35 mergeado. Story `done` |
