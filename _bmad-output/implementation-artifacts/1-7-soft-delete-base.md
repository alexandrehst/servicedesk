---
baseline_commit: 3d52b35
---

# Story 1.7: Soft-delete base

Status: done

## Story

As a construtor,
I want que exclusões sejam lógicas,
so that nada auditável seja perdido.

## Acceptance Criteria

1. **Given** a coluna de soft-delete nas entidades já existentes
   **When** um Chamado ou Comentário é "excluído"
   **Then** ele é **marcado** como removido, nunca apagado fisicamente
   (FR-23 base, AD-3) — a linha continua no banco.

2. **Given** um Chamado excluído
   **When** qualquer leitura o alcança
   **Then** ele **não** aparece, e a garantia é estrutural: nenhuma leitura
   consegue devolvê-lo sem passar pelo filtro do domínio.

3. **Given** um Chamado excluído
   **When** alguém o consulta pelo Número
   **Then** recebe o **mesmo** `TicketNaoEncontrado` de um Número que nunca
   existiu — excluído e inexistente são indistinguíveis (padrão da 1.2).

4. **Given** um Comentário excluído
   **When** a thread é montada
   **Then** ele some da thread, sem deixar buraco numerado nem contagem
   inconsistente.

5. **Given** a exclusão de um Chamado
   **When** ela acontece
   **Then** grava a marcação **e** o registro de auditoria na **mesma
   transação** (AD-3), com a identidade de quem excluiu.

6. **Given** dois pedidos de exclusão do mesmo Chamado
   **When** disparados juntos
   **Then** só um deles marca — a exclusão é atômica, como o consumo do link da
   1.3.

7. **Given** o Log de auditoria
   **When** o soft-delete é aplicado
   **Then** `audit_entries` **não** ganha a coluna: ela é append-only, e
   permitir "excluir" um registro de auditoria destruiria o que o FR-23 existe
   para preservar.

## Tasks / Subtasks

- [x] **Task 1 — Migration `0006` + schema** (AC: #1, #7)
  - [x] `deleted_at` (nullable) em `tickets` e `comments`
  - [x] **Nada** em `audit_entries` — append-only, com o motivo no SQL
  - [x] Índice parcial só nos não-excluídos, que é o caso comum

- [x] **Task 2 — Domínio: excluído não é visível** (AC: #2, #3, #4)
  - [x] `Ticket.excluidoEm` e `Comentario.excluidoEm`
  - [x] `visivelPara` devolve `null` para Chamado excluído — o gargalo da
        Story 1.4 já é a única saída, então **toda** leitura herda o filtro
  - [x] `filtrarComentarios` remove Comentário excluído
  - [x] Capacidade `excluiChamado` na matriz de `papeis.ts`

- [x] **Task 3 — Port e adapter** (AC: #1, #5, #6)
  - [x] `excluirComAuditoria(numero, autor)` no `TicketRepository`
  - [x] `UPDATE ... SET deleted_at = now() WHERE number = ? AND deleted_at IS
        NULL RETURNING` — atômico, na mesma transação da auditoria
  - [x] Devolve `null` quando não havia o que excluir

- [x] **Task 4 — Caso de uso** (AC: #3, #5)
  - [x] `application/commands/excluir-chamado.ts`
  - [x] Autorização no domínio (AD-8): quem não pode **ver** recebe
        `TicketNaoEncontrado`; quem pode ver mas não pode **excluir** recebe
        `SemPermissao`
  - [x] Ação `excluir_chamado` no Log de auditoria

- [x] **Task 5 — Testes** (AC: #1..#7)
  - [x] Negativo antes do positivo: Solicitante tentando excluir, Chamado
        alheio, Chamado já excluído
  - [x] Integração: a linha **continua** na tabela depois de excluída
  - [x] Excluído e inexistente comparados **entre si**
  - [x] `Promise.all` de duas exclusões → uma só marca
  - [x] `audit_entries` **não** tem a coluna (asserção contra o catálogo)
  - [x] **Verificar por mutação** — tabela obrigatória no Dev Agent Record

- [x] **Task 6 — Registrar as decisões** (AC: #3, #4)
  - [x] PRD FR-23 e spine

## Dev Notes

### A armadilha desta story não é a coluna, é quem filtra

Acrescentar `deleted_at` é trivial. O que decide se a story presta é **onde o
filtro mora**:

- Espalhado em `WHERE deleted_at IS NULL` por query: cada leitura nova é uma
  chance de esquecer, e o Epic 3 traz quatro (fila, busca, resumo, parecidos).
- Duplicado em SQL **e** no domínio: os dois divergem no dia em que um mudar.

A Story 1.4 já resolveu o formato deste problema: o port devolve `ChamadoBruto`
e **`visivelPara` é a única saída**. Basta o filtro de excluídos entrar ali para
que toda leitura — inclusive as que ainda não existem — o herde sem saber que
ele existe. É a quinta vez que o projeto troca disciplina por garantia
estrutural, e a primeira em que a garantia anterior é reaproveitada de graça.

**Consequência aceita:** o adapter traz a linha excluída do banco e o domínio a
descarta. É coerente com o AD-8 (adapter entrega bruto, domínio filtra) e o
custo é irrelevante nesta escala. Quando o volume justificar, o filtro pode
descer para o SQL — mas aí como **otimização** de algo já garantido, não como a
garantia em si.

### As decisões desta story

Tomadas por recomendação, com a delegação do dono registrada em 2026-08-10:

| Ponto | Decisão | Motivo |
| --- | --- | --- |
| Quem exclui | **Agente**, nunca Solicitante | FR-20 só tem dois papéis; excluir é ação de quem atende |
| Erro para quem não pode ver | `TicketNaoEncontrado` | Padrão da 1.2 — Números são sequenciais |
| Erro para quem vê mas não pode excluir | **`SemPermissao`** | Ele já sabe que o Chamado existe (é dele); esconder não protege nada e confunde |
| `audit_entries` | **Sem** soft-delete | Append-only (FR-22); permitir excluir registro de auditoria destruiria o que o FR-23 preserva |

O terceiro ponto merece atenção porque contraria o reflexo do projeto. A regra
das 1.2 e 1.4 é esconder — mas ela existe para não vazar **existência**. Um
Solicitante tentando excluir o próprio Chamado já conhece a existência dele:
devolver "não encontrado" não protegeria informação nenhuma e só o faria pensar
que o Chamado sumiu.

### O que já existe e não deve ser reinventado

| O que | Onde | Desde |
| --- | --- | --- |
| Gargalo de leitura (`visivelPara`, `ChamadoBruto`) | `domain/visibilidade.ts` | 1.4 |
| Matriz de capacidades por papel | `domain/papeis.ts` | 1.4 |
| Escrita com auditoria na mesma transação | `criarComAuditoria` | 1.1 |
| Atomicidade via `UPDATE ... WHERE ... RETURNING` | `consumirLinkDeLogin` | 1.3 |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
| --- | --- |
| Tool MCP de exclusão | não prevista em FR-13/FR-14; a 4.3 decide |
| Restaurar excluído | 4.3 (soft-delete completo) |
| Excluir Comentário por caso de uso | 4.3 — aqui só a coluna e o filtro |
| Expurgo/retenção de excluídos | fora do MVP |

### Armadilhas conhecidas

- **`Promise.all` de verdade** no teste de concorrência; sequencial, o código
  não-atômico passa.
- **Asserção contra o catálogo do Postgres** para provar a AC #7 — verificar
  "não existe coluna" olhando o código seria verificar a si mesmo.
- **Cobertura por arquivo**, não a média.
- **Excluído e inexistente comparados entre si**, com o Número normalizado.
- **Verde do `claude-review` não é evidência de review** — silêncio
  intermitente; conferir `/pulls/NN/comments`.

### References

- [Source: epics.md#Story 1.7]
- [Source: prd.md#FR-23] — exclusões lógicas, nunca físicas
- [Source: prd.md#FR-22] — Log de auditoria append-only
- [Source: ARCHITECTURE-SPINE.md#AD-3] — mudança e auditoria na mesma transação
- [Source: ARCHITECTURE-SPINE.md#AD-8] — autorização e visibilidade no domínio
- [Source: 1-4-papeis-e-autorizacao.md] — o gargalo que esta story reaproveita

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A garantia da Story 1.4 pagou dividendo.** O filtro de excluídos entrou em
`visivelPara` e `filtrarComentarios` — três linhas — e **toda** leitura passou
a herdá-lo, inclusive as que ainda não existem. Não foi preciso tocar em
`ver-chamado.ts`, nem no adapter MCP, nem escrever um único
`WHERE deleted_at IS NULL` em query. É a primeira vez no projeto em que uma
garantia estrutural anterior absorveu um requisito novo sem trabalho.

**O compilador listou onde o campo precisava chegar.** Ao acrescentar
`excluidoEm` a `Ticket` e `Comentario`, o `tsc` apontou doze pontos de
construção — adapters, dubles de teste, literais. Nenhum ficou de fora por
esquecimento, porque não havia como esquecer.

**`excluidoEm` ficou em `Ticket`, não em `NovoTicket`**, pelo mesmo motivo que
o `number` (AD-4, Story 1.1): um Chamado que ainda não existe não pode ter sido
excluído, e deixar o campo fora do tipo torna isso impossível de escrever.

**O `biome` encontrou um erro de desenho que eu tinha acabado de introduzir.**
Ao acrescentar `excluiChamado`, troquei a lista de capacidades do Agente por um
`return true` — e o lint avisou que o parâmetro `capacidade` ficara sem uso. O
aviso era sobre estilo; o problema era outro: com `return true`, **qualquer
capacidade futura seria concedida ao Agente em silêncio**.

Reescrito como `Record<Capacidade, readonly Papel[]>`, que inverte a direção da
tabela de propósito: o TypeScript exige uma linha para **cada** capacidade,
então acrescentar uma sem decidir quem a tem virou erro de compilação. Uma
tabela `papel -> capacidades` deixaria capacidade nova cair silenciosamente em
"ninguém pode" — seguro, mas invisível, e alguém passaria uma tarde
descobrindo por que o Agente não consegue agir. A checagem de papel corrompido
continua lançando, como a 1.4 estabeleceu.

**Dois erros diferentes, contrariando o reflexo do projeto.** Desde a 1.2 a
regra é esconder existência. Mas ela existe para não entregar informação a quem
**não a tem**: uma Solicitante tentando excluir o próprio Chamado já sabe que
ele existe. Devolver "não encontrado" a ela não protegeria nada e a faria achar
que o Chamado sumiu. Ficou:

- não pode **ver** → `TicketNaoEncontrado` (indistinguível de inexistente)
- vê mas não pode **excluir** → `SemPermissao`

A mensagem de `SemPermissao` não diz qual papel seria necessário — isso seria
mapa da política de autorização para quem sonda. Tem teste.

**A AC #7 foi verificada contra o catálogo do Postgres, não contra o nosso
código.** Afirmar que `audit_entries` não tem `deleted_at` olhando o
`schema.ts` seria verificar a si mesmo. O teste consulta
`information_schema.columns` — e traz uma segunda asserção, de que `tickets` e
`comments` **têm** a coluna, sem a qual o primeiro passaria com a migration
inteira ausente.

**Sete mutações aplicadas, sete reprovações** (script em
`scratchpad/mutacoes-17.py`):

| Mutação aplicada | Reprovou |
| --- | --- |
| Chamado excluído volta a ser visível | 4 testes de leitura |
| Comentário excluído volta a aparecer | 2 testes da thread |
| Solicitante ganha permissão de excluir | 4 testes, unidade e integração |
| Command ignora a checagem de papel | 3 testes |
| **`DELETE` físico em vez de marcação** | `excluir marca, nao apaga` |
| Marcação sem o `WHERE` de não-excluído | `devolve false quando ja estava excluido` |
| Auditoria da exclusão com ação trocada | 4 testes de auditoria |

### Completion Notes List

- **Task 1** — migration `0006` conferida no catálogo. Índices **parciais**
  (`WHERE deleted_at IS NULL`): as consultas do dia a dia só olham os vivos.
- **Task 2** — o filtro de excluídos entrou no gargalo do domínio, não nas
  queries. Custo aceito: o adapter traz a linha excluída e o domínio a
  descarta — coerente com o AD-8, e irrelevante nesta escala. Quando o volume
  justificar, o filtro pode descer ao SQL como **otimização** de algo já
  garantido, não como a garantia em si.
- **Task 3** — `excluirComAuditoria` marca e audita na mesma transação (AD-3),
  com `WHERE deleted_at IS NULL` no próprio UPDATE. Devolve `false` sem gravar
  auditoria quando não havia o que excluir: registrar uma exclusão que não
  aconteceu poluiria o Log com evento falso.
- **Task 4** — o caso de uso não conhece SQL nem `deleted_at`; ele pergunta ao
  domínio se o Chamado é visível e se o papel pode excluir.
- **Task 5** — **235 testes** (eram 211). 14 de integração só para esta story.
- **Task 6** — decisões registradas no PRD (FR-23) e na spine.

**Não provado — registrado em vez de deixado implícito:**

1. **Não há tool MCP de exclusão.** FR-13/FR-14 não a preveem, e inventá-la
   aqui seria expor uma ação destrutiva pela superfície que a Story 1.5 acabou
   de proteger. A Story 4.3 (soft-delete completo) decide se e como ela
   aparece.
2. **Excluir Comentário não tem caso de uso** — a coluna e o filtro existem, a
   escrita é da 4.3. A thread já esconde o que estiver marcado.
3. **Não há restauração.** Um Chamado excluído por engano só volta por SQL
   manual. É consequência esperada de "base"; a 4.3 é dona disso.
4. **Nenhuma política de retenção**: excluídos ficam para sempre, junto com as
   tabelas de credencial que já acumulam desde a 1.3.
5. **AD-7 (confirmação para ação irreversível) não foi aplicado, e isso tem
   prazo de validade.** O `claude-review` levantou o ponto no PR #39 e o
   descartou com razão para **esta** story: o FR-15 escopa "Ação irreversível"
   a `fechar`/`cancelar`/`reabrir`, e aqui não há tool MCP nem rota de
   exclusão. Mas a exclusão **é** irreversível na prática enquanto não houver
   restauração (Story 4.3). No dia em que a 4.3 expuser a exclusão por alguma
   superfície, o AD-7 passa a valer — está anotado aqui para que essa decisão
   não seja tomada por omissão.

6. **O `claude-review` revisou de verdade neste PR.** 5m44s de execução, um
   comentário específico por pilar, com referência a arquivo e linha. É a
   segunda vez em nove rodadas (a outra foi o #35). O silêncio segue
   intermitente, mas quando ele fala, fala com conteúdo — e nas duas vezes
   levantou algo que virou registro.

### File List

- `drizzle/migrations/0006_soft_delete.sql` (novo)
- `drizzle/schema.ts` (modificado — `deleted_at` em `tickets` e `comments`)
- `src/domain/ticket.ts` (modificado — `Ticket.excluidoEm`)
- `src/domain/visibilidade.ts` + teste (modificados — filtro de excluídos)
- `src/domain/papeis.ts` + teste (modificados — matriz por capacidade)
- `src/domain/errors.ts` (modificado — code `SemPermissao`)
- `src/application/ports/ticket-repository.ts` (modificado — `excluirComAuditoria`)
- `src/application/commands/excluir-chamado.ts` + teste (novos)
- `src/adapters/persistence/ticket-repository.ts` (modificado — exclusão atômica)
- `src/adapters/persistence/soft-delete.test.ts` (novo — integração)
- `src/adapters/mcp/server.test.ts`, `src/application/{commands,queries}/*.test.ts` (modificados — dubles)
- `_bmad-output/planning-artifacts/prds/.../prd.md` e `.../ARCHITECTURE-SPINE.md` (modificados)
- `_bmad-output/implementation-artifacts/{1-7-...,sprint-status.yaml}` (modificados)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-10 | Story criada; decisões de FR-23 tomadas por recomendação delegada |
| 2026-08-10 | Task 1: migration `0006` com índices parciais, conferida no catálogo |
| 2026-08-10 | Task 2: filtro de excluídos no gargalo do domínio — toda leitura herdou |
| 2026-08-10 | Matriz de papéis reescrita como `Record<Capacidade, Papel[]>` depois de um aviso do lint |
| 2026-08-10 | Tasks 3–4: exclusão atômica com auditoria na mesma transação |
| 2026-08-10 | Task 5: 235 testes; cobertura 99,62% |
| 2026-08-10 | Sete mutações aplicadas e reprovadas |
| 2026-08-10 | Task 6: decisões registradas no PRD e na spine |
| 2026-08-10 | PR #39: nove checks verdes; `claude-review` revisou de verdade e levantou o AD-7 |
| 2026-08-10 | PR #39 mergeado. Story `done` |
