---
baseline_commit: e8caf8f
---

# Story 1.2: Ver um Chamado via MCP

Status: in-progress

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

- [ ] **Task 1 — Tabela de Comentários** (AC: #1, #4)
  - [ ] Migration `0002`: tabela `comments` com `ticket_number`, `autor`, `corpo`, `internal` (bool), `criado_em`
  - [ ] Índice por `ticket_number`
  - [ ] **Escrita de comentário é a Story 2.1** — aqui só a estrutura, para a leitura ter o que ler

- [ ] **Task 2 — Domínio: regra de visibilidade** (AC: #3, #4)
  - [ ] `podeVerTicket(principal, ticket)` — Agente vê todos; Solicitante só os próprios
  - [ ] `filtrarComentarios(principal, comentarios)` — Solicitante não recebe internos
  - [ ] Erro `TicketNaoEncontrado` — **um só**, usado tanto para inexistente quanto para não autorizado
  - [ ] Funções puras, sem I/O

- [ ] **Task 3 — Contrato e port** (AC: #1)
  - [ ] `contracts/ver-chamado.ts`: input (`numero`) e output com datas como **string ISO**
  - [ ] Port `buscarPorNumero(numero)` retornando ticket + comentários, ou `null`

- [ ] **Task 4 — Query handler** (AC: #1..#5)
  - [ ] `application/queries/ver-chamado.ts`
  - [ ] Aplica visibilidade **no domínio**, não no adapter (AD-8)
  - [ ] Converte datas para ISO 8601 UTC
  - [ ] **Sem** escrita de auditoria — é leitura

- [ ] **Task 5 — Adapter de persistência** (AC: #1)
  - [ ] `buscarPorNumero` com join/duas queries, comentários ordenados por `criado_em`
  - [ ] **Sem** transação de escrita

- [ ] **Task 6 — Tool MCP** (AC: #1, #2)
  - [ ] `ver_chamado` derivando do contrato (AD-6)
  - [ ] Erro de domínio → erro de tool, mesmo shape da Story 1.1

- [ ] **Task 7 — Testes** (AC: #1..#5)
  - [ ] Unidade: visibilidade por papel, filtro de internos
  - [ ] Integração: chamado com comentários, ordem cronológica, datas ISO
  - [ ] **Inexistente e alheio devolvem erro idêntico** — comparar as duas mensagens
  - [ ] Verificar que **nenhuma linha nova** aparece em `audit_entries` após a leitura

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

### Debug Log References

### Completion Notes List

### File List
