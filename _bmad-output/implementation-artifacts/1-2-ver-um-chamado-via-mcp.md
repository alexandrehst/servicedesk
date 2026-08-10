---
baseline_commit: e8caf8f
---

# Story 1.2: Ver um Chamado via MCP

Status: review

## Story

As a Agente operando via IA,
I want consultar um Chamado pela tool `ver_chamado(numero)`,
so that eu tenha o contexto completo antes de agir.

## Acceptance Criteria

1. **Given** um Chamado existente
   **When** a IA chama `ver_chamado(numero)`
   **Then** retorna todos os campos **e** a thread de Comentários em ordem cronológica (FR-2, FR-13)
   **And** as datas vêm em **ISO 8601 / UTC**.

2. **Given** um Número inexistente
   **When** a tool é chamada
   **Then** retorna erro "não encontrado", **sem vazar existência** de outros Chamados.

3. **Given** um Solicitante pedindo Chamado que não é dele
   **When** a tool é chamada
   **Then** recebe o **mesmo** erro "não encontrado" do AC #2 — não um erro de autorização.
   *(Mensagens distintas revelariam que o Chamado existe. É o que "sem vazar existência" significa na prática.)*

4. **Given** um Solicitante consultando o próprio Chamado
   **When** a thread é montada
   **Then** vê apenas Comentários **públicos**; um Agente vê públicos e internos (FR-2, AD-8).

5. **Given** que a tool é de leitura
   **When** ela executa
   **Then** **não** altera estado e **não** grava registro de auditoria (FR-13).

## Tasks / Subtasks

- [x] **Task 1 — Tabela de Comentários** (AC: #1, #4)
  - [x] Migration `0002`: tabela `comments` com `ticket_number`, `autor`, `corpo`, `internal` (bool), `criado_em`
  - [x] Índice por `ticket_number`
  - [x] **Escrita de comentário é a Story 2.1** — aqui só a estrutura, para a leitura ter o que ler

- [x] **Task 2 — Domínio: regra de visibilidade** (AC: #3, #4)
  - [x] `podeVerTicket(principal, ticket)` — Agente vê todos; Solicitante só os próprios
  - [x] `filtrarComentarios(principal, comentarios)` — Solicitante não recebe internos
  - [x] Erro `TicketNaoEncontrado` — **um só**, usado tanto para inexistente quanto para não autorizado
  - [x] Funções puras, sem I/O

- [x] **Task 3 — Contrato e port** (AC: #1)
  - [x] `contracts/ver-chamado.ts`: input (`numero`) e output com datas como **string ISO**
  - [x] Port `buscarPorNumero(numero)` retornando ticket + comentários, ou `null`

- [x] **Task 4 — Query handler** (AC: #1..#5)
  - [x] `application/queries/ver-chamado.ts`
  - [x] Aplica visibilidade **no domínio**, não no adapter (AD-8)
  - [x] Converte datas para ISO 8601 UTC
  - [x] **Sem** escrita de auditoria — é leitura

- [x] **Task 5 — Adapter de persistência** (AC: #1)
  - [x] `buscarPorNumero` com join/duas queries, comentários ordenados por `criado_em`
  - [x] **Sem** transação de escrita

- [x] **Task 6 — Tool MCP** (AC: #1, #2)
  - [x] `ver_chamado` derivando do contrato (AD-6)
  - [x] Erro de domínio → erro de tool, mesmo shape da Story 1.1

- [x] **Task 7 — Testes** (AC: #1..#5)
  - [x] Unidade: visibilidade por papel, filtro de internos
  - [x] Integração: chamado com comentários, ordem cronológica, datas ISO
  - [x] **Inexistente e alheio devolvem erro idêntico** — comparar as duas mensagens
  - [x] Verificar que **nenhuma linha nova** aparece em `audit_entries` após a leitura

## Dev Notes

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
| --- | --- |
| Escrever comentário | 2.1 |
| Autenticação real (o principal ainda vem de config) | 1.3 |
| Papéis além de `solicitante`/`agente` | 1.4 |
| `buscar_chamados`, `resumo_fila`, `chamados_parecidos` | Epic 3 |

A tabela `comments` é criada aqui porque a AC #1 exige retornar a thread. Sem
a tabela não há o que ler. A **escrita** continua sendo a 2.1.

### ⚠️ O ponto sutil desta story: erro único

A AC #2 diz "sem vazar existência de outros Chamados". Isso tem uma
consequência que é fácil errar: **inexistente e não-autorizado precisam
devolver a mesma coisa**.

Se um Solicitante pedir o Chamado #1042 (que existe, mas é de outro) e receber
*"não autorizado"*, enquanto o #9999 devolve *"não encontrado"*, ele descobre
por sondagem quais Números existem. A AC #3 existe para forçar isso, e a Task 7
manda **comparar as duas mensagens** em vez de checar cada uma isoladamente.

### Padrão da Story 1.1 — copiar

- Domínio puro, sem imports para fora (AD-1)
- Contratos Zod como fonte única; a tool MCP deriva (AD-6)
- Erros tipados com `code`, shape nascendo no domínio
- Arquivos `kebab-case`, um caso de uso por arquivo
- Imports com extensão `.js`, `import type` para tipos (`verbatimModuleSyntax`)

**Diferença importante:** a 1.1 é escrita e usa `application/commands/`. Esta é
leitura e vai em **`application/queries/`** — a árvore da spine separa os dois.

### Datas em ISO 8601 UTC

A spine (Consistency Conventions) fixa: ISO 8601 em UTC no armazenamento e no
wire. O Postgres devolve `Date`; o contrato de saída expõe **string**. A
conversão é no query handler, não no adapter nem no domínio.

### Armadilhas conhecidas

- **`noUncheckedIndexedAccess`**: acesso a índice de array pode ser `undefined`.
- **Ordem cronológica precisa de `ORDER BY` explícito** — sem ele o Postgres
  não garante ordem, e o teste passaria por acaso até não passar mais.
- **Cobertura ≥80%**: todo arquivo novo precisa de teste.
- **`required_conversation_resolution`**: o `claude-review` comenta em todo PR
  e a conversa aberta bloqueia o merge. Ler, corrigir se for achado real,
  então resolver.

### Ambiente

Docker sob sandbox exigiu `sandbox.filesystem.allowWrite` para o
`docker.sock` (ajustado em `.claude/settings.json`). Subir o banco:
`docker-compose up -d` e `pnpm db:migrate` com `DATABASE_URL`.

### References

- [Source: epics.md#Story 1.2]
- [Source: prd.md#FR-2] — Solicitante vê só os próprios e só Comentários Públicos
- [Source: prd.md#FR-13] — tools de leitura não alteram estado
- [Source: ARCHITECTURE-SPINE.md#AD-8] — autorização aplicada no domínio
- [Source: ARCHITECTURE-SPINE.md#Consistency Conventions] — datas ISO 8601 UTC
- [Source: 1-1-abrir-um-chamado-via-mcp-tracer-bullet.md] — padrão a copiar

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**O `db:migrate` só aplicava a `0001` — e o CI chama exatamente ele.** O script
era `psql -f drizzle/migrations/0001_inicial.sql`, com o nome do arquivo fixo.
Com a `0002` no repositório, o job `test` teria subido sem a tabela `comments` e
os testes de leitura falhariam no CI depois de passarem localmente. Trocado por
um laço sobre `drizzle/migrations/*.sql`.

**No mesmo lugar, uma falha silenciosa do tipo que o Epic 0 catalogou:** `psql
-f` sai com **código 0 mesmo quando o SQL falha**. Medido com uma migration
quebrada de propósito: `exit code SEM ON_ERROR_STOP: 0` contra `COM
ON_ERROR_STOP: 1`. Sem a flag, uma migration errada passaria o `test` verde e
só apareceria como teste falhando, longe da causa.

**O commit `bc226a4` não passava no `typecheck`, apesar de a mensagem dizer que
sim.** `await promessa.catch((e) => e as Error)` não devolve `Error`: devolve a
**união** entre o erro e a saída de sucesso, e `.message` não existe nessa
união. O `as` mente sobre o valor, não sobre o tipo do `Promise`. Verificado com
`git stash` para separar o defeito herdado do meu trabalho. Substituído por um
helper `erroDe` que estreita com `ehDomainError` e **falha explicitamente
quando não há erro** — a versão anterior compararia dois `undefined` no dia em
que a leitura parasse de lançar.

**`criarHandlerVerChamado` estava sem um único teste.** A Task 6 constava
implementada, mas as linhas 79–99 de `server.ts` apareciam descobertas no
relatório de cobertura (adapter MCP em 72%). A média global escondia: 87,5% já
passava do gate de 80%. Com os cinco testes da tool a cobertura foi para
**95,45%** e o adapter MCP para 100%.

**Os quatro testes novos foram verificados por mutação**, seguindo o que a
Story 1.1 estabeleceu — teste que passa com o código quebrado não é prova:

| Mutação aplicada | Reprovou |
| --- | --- |
| Remover o `ORDER BY` da leitura da thread | `ordem cronologica` |
| Erro distinto para Chamado alheio (`'Sem permissao.'`) | `erro identico` (unidade **e** integração) |
| Devolver `comentarios` sem `filtrarComentarios` | `Comentarios internos` (unidade **e** integração) |
| Gravar `audit_entries` dentro de `buscarPorNumero` | `nao acrescenta linha em audit_entries` |

**`origin` não é observável numa leitura.** O teste que eu tinha escrito para o
adapter MCP afirmava carimbar `origin: 'mcp'`, mas numa leitura não há registro
de auditoria para inspecionar (é o próprio FR-13) — ele passaria com qualquer
valor. Reescrito para provar o que de fato dá para provar: a **identidade**
chega ao domínio, e a prova é comportamental (a mesma consulta muda de
resultado conforme quem pergunta).

### Completion Notes List

- **Task 1** — migration `0002` com `comments` e índice `(ticket_number, criado_em)`. Escrita segue sendo a Story 2.1; aqui a thread é semeada direto na tabela pelo teste.
- **Task 2** — `podeVerTicket` e `filtrarComentarios` puros; `ticketNaoEncontrado` é **um só** erro para inexistente e alheio.
- **Task 3** — contrato com datas como **string ISO**; port devolve dado **bruto**, inclusive Comentário interno — quem filtra é o domínio (AD-8).
- **Task 4** — query handler converte as datas e aplica visibilidade. Não recebe nada que permita escrever: a garantia do FR-13 é estrutural, não disciplina.
- **Task 5** — `ORDER BY criado_em, id` explícito. O `id` desempata comentários com o mesmo instante, que sem ele voltariam em ordem arbitrária.
- **Task 6** — `ver_chamado` derivando do contrato, com o mesmo shape de erro da 1.1 (`[code] mensagem` + `isError`).
- **Task 7** — **56 testes** (eram 40), cobertura **95,45%**. Seis de integração contra Postgres real e cinco da tool MCP.

**Sobre a AC #3 — comparar as mensagens.** As duas mensagens não podem ser
comparadas cruas na integração: elas ecoam o Número, e um Número existente e um
inexistente são diferentes por definição. Comparo `{name, code, message}` com o
Número normalizado para `#N`. O Número não é vazamento — quem perguntou já o
conhecia. Vazaria qualquer outra diferença, e é isso que a asserção trava.

**Ordem cronológica provada de verdade.** Os comentários são inseridos **fora de
ordem** (terceiro, primeiro, segundo). Inseridos em ordem, o teste passaria pela
ordem física do heap mesmo sem `ORDER BY` — foi o que a mutação confirmou.

**Não exercitado:** o adapter HTTP não existe, então "MCP e HTTP não divergem no
que escondem" segue como intenção do desenho, não como fato verificado. A
Story 1.3 troca o principal de configuração para autenticação real e é lá que a
identidade deixa de ser confiável por construção.

### File List

- `drizzle/migrations/0002_comentarios.sql` (novo)
- `drizzle/schema.ts` (modificado — tabela `comments`)
- `src/domain/visibilidade.ts` + teste (novos)
- `src/domain/errors.ts` (modificado — code `TicketNaoEncontrado`)
- `src/application/contracts/ver-chamado.ts` (novo)
- `src/application/ports/ticket-repository.ts` (modificado — `buscarPorNumero`)
- `src/application/queries/ver-chamado.ts` + teste (novos)
- `src/adapters/persistence/ticket-repository.ts` + teste (modificados)
- `src/adapters/mcp/server.ts` + teste (modificados)
- `package.json` (modificado — `db:migrate` aplica todas as migrations)
- `_bmad-output/implementation-artifacts/{1-2-...,sprint-status.yaml}` (modificados)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-10 | Tasks 1–6: domínio, contrato, query, adapter e tool MCP (commit `bc226a4`) |
| 2026-08-10 | `db:migrate` corrigido: aplicava só a `0001`, e sem `ON_ERROR_STOP` |
| 2026-08-10 | `typecheck` corrigido: `.catch((e) => e as Error)` devolvia união, não `Error` |
| 2026-08-10 | Task 7: 6 testes de integração + 5 da tool MCP; cobertura 87,5% → 95,45% |
| 2026-08-10 | Quatro mutações aplicadas e reprovadas — AC #1 a #5 verificadas |
