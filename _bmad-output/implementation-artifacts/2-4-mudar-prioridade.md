---
baseline_commit: 024fd39
---

# Story 2.4: Mudar Prioridade

Status: review

## Story

As a Agente,
I want ajustar a Prioridade via `mudar_prioridade`,
so that a urgência do Chamado fique correta.

## Acceptance Criteria

1. **Given** o conjunto fechado Baixa..Crítica
   **When** a IA chama `mudar_prioridade(numero, prioridade, versao)`
   **Then** só valores válidos são aceitos (FR-6)
   **And** a mudança registra o par `de`/`para` no Log (AD-3).

2. **Given** um Chamado recém-aberto
   **When** ele é lido
   **Then** tem uma Prioridade — **nenhum Chamado existe sem ela** (ver a
   decisão sobre o default nas Dev Notes).

3. **Given** um Solicitante
   **When** ele tenta mudar a Prioridade do próprio Chamado
   **Then** recebe `SemPermissao`.

4. **Given** a mesma Prioridade que o Chamado já tem
   **When** a mudança é pedida
   **Then** é recusada — não é mudança (como a auto-transição da 2.2 e a
   reatribuição da 2.3).

5. **Given** versão desatualizada
   **When** dois Agentes mudam a Prioridade
   **Then** o segundo recebe `Conflict` (AD-10).

## Tasks / Subtasks

- [x] **Task 1 — Domínio** (AC: #1, #2, #3)
  - [x] `PRIORIDADES` e `Prioridade` em `domain/ticket.ts`, no padrão de
        `STATUS` e `CATEGORIAS`
  - [x] `prioridade` em `NovoTicket` **e** em `Ticket` (ver Dev Notes: aqui é
        diferente de `version` e `number`)
  - [x] Capacidade `mudaPrioridade` — só Agente
  - [x] Ação `mudar_prioridade` em `ACOES`
- [x] **Task 2 — Migration** (AC: #2)
  - [x] `0009_prioridade.sql`: `tickets.priority text NOT NULL DEFAULT 'media'`
  - [x] Asserção contra o catálogo do banco, provando os dois lados
- [x] **Task 3 — Command e contrato** (AC: #1, #3, #4, #5)
  - [x] `contracts/mudar-prioridade.ts`, com `versao` obrigatória
  - [x] `commands/mudar-prioridade.ts` — **usando** `conflitoOuSumico`
- [x] **Task 4 — Adapter** (AC: #1)
  - [x] `mudarPrioridadeComAuditoria` — **usando** `mutarCampoComAuditoria`
  - [x] A leitura devolve a Prioridade do banco (lição do `assignee` na 2.3)
- [x] **Task 5 — Tool MCP** (AC: #1)
  - [x] `mudar_prioridade` — **usando** `criarHandler`
  - [x] `ver_chamado` passa a expor a Prioridade
- [x] **Task 6 — Testes** (AC: #1..#5)
  - [x] Recusa antes do caminho feliz; conflito real contra o Postgres
  - [x] **Verificar por mutação** — `scratchpad/mutacoes-24.py`
- [x] **Task 7 — Registrar** (AC: —)
  - [x] PRD (FR-6)

## Dev Notes

### Use os helpers, não copie o padrão

A Story 2.3 extraiu os três blocos que 2.2 e 2.3 duplicavam, depois de o
SonarCloud reprovar o PR #50 com 9% de duplicação:

| Use | Onde |
| --- | --- |
| `mutarCampoComAuditoria` | `adapters/persistence/ticket-repository.ts` |
| `conflitoOuSumico` | `application/commands/mutacao-versionada.ts` |
| `criarHandler` | `adapters/mcp/server.ts` |

Esta story deve custar **poucas linhas**: um `set` no adapter, uma ação em
`ACOES`, uma capacidade na matriz, o contrato e o command. Se você estiver
escrevendo `db.transaction` ou um `try/catch` de handler, parou no lugar errado
— e o Sonar vai reprovar.

O que continua sendo seu: **a versão esperada vem da entrada**, nunca do
Chamado que o command acabou de ler.

### A decisão desta story: todo Chamado nasce com Prioridade

`priority` não existe — nem coluna, nem tipo. E a pergunta que a story precisa
responder não é "como mudar", é **"com o que ele nasce"**.

**Decisão (por delegação): `NOT NULL DEFAULT 'media'`, e `prioridade` entra
também em `NovoTicket`.**

Prioridade nula seria um terceiro estado — "sem prioridade" — que a fila do
Epic 3 teria que tratar em toda ordenação, e que não significa nada para quem
atende. Um Chamado sem urgência declarada **tem** urgência: a normal.

Repare que isso é o **oposto** de `number`, `version` e `excluidoEm`, que ficam
fora de `NovoTicket` porque só existem depois de persistir. Prioridade existe
antes: é uma escolha de quem abre, não um efeito da gravação. O `DEFAULT` no
banco cobre as linhas que já existem; o domínio cobre as novas.

**Consequência a verificar:** o intake por e-mail (1.9) e a tool `abrir_chamado`
não informam prioridade. Decida se `abrirTicket` aceita o campo opcional
(caindo em `media`) ou se ele é sempre `media` na abertura — e **registre**.
Não deixe a tool MCP passar a exigir um campo novo sem querer.

### Quem muda a Prioridade

**Decisão (por delegação): só o Agente** (`mudaPrioridade: ['agente']`).

O Solicitante conhece o próprio problema, mas prioridade é **comparativa** —
ela ordena um Chamado contra os outros, e quem enxerga a fila inteira é quem
atende. Um campo de urgência preenchido por quem abre vira, na prática, uma
coluna onde todo mundo escreve "crítica"; o Solicitante já tem a Descrição e o
Comentário (2.1) para explicar a urgência dele.

### Nomes: minúsculas sem acento, como todos os enums do projeto

`STATUS`, `CATEGORIAS`, `ORIGENS`, `PAPEIS` e `ACOES` usam minúsculas sem
acento (`em_andamento`, `nao_classificado`). Siga: `baixa`, `media`, `alta`,
`critica`. A apresentação com acento é problema de quem exibe — e a UI é
Fase 1.5.

### A lição do `assignee` (2.3) vale aqui

Coluna nova só serve se for **lida**. Confirme que os três pontos de leitura do
adapter devolvem `linha.priority`, e prove com um teste que **escreve direto no
banco** — um teste que só olha o retorno do command passaria com um literal no
lugar.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Ordenar a fila por Prioridade | Epic 3 |
| SLA por Prioridade | Fase 1.5+ |
| Prioridade sugerida pela IA na abertura | não está no MVP |
| Notificar mudança de Prioridade | FR-18 cobre abertura e resolução |

### References

- [Source: epics.md#Story 2.4]
- [Source: prd.md#FR-6] — conjunto fechado Baixa..Crítica
- [Source: 2-3-atribuir-dono-self-assign.md] — os helpers e a dívida do campo não lido
- [Source: ARCHITECTURE-SPINE.md#AD-10] — concorrência otimista

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A story custou poucas linhas de produção, e isso é o resultado da 2.3.** Usar
`mutarCampoComAuditoria`, `conflitoOuSumico` e `criarHandler` deixou o trabalho
em: um `set`, uma ação em `ACOES`, uma capacidade na matriz, o contrato, o
command e a tool. Nenhum `db.transaction`, nenhum `try/catch` de handler,
nenhuma releitura de conflito reescrita — e o Sonar não teve o que reprovar.

**Duas mutações sobreviveram, e as duas eram erro do script, não do código.**
É um modo de falha novo — os anteriores foram mutação inócua (1.9, 2.1, 2.3) e
redundância (2.2):

1. A mutação da leitura mirava `prioridade: linha.priority` **sem âncora**, e o
   `replace(..., 1)` pegou a **primeira** das três ocorrências — a de
   `criarComAuditoria`, que nos testes sempre devolve `'media'`. Trocar por
   `'media'` ali não mudava nada. Ancorei no comentário da linha de
   `buscarPorNumero`, que é a leitura que o teste exercita.
2. A mutação do `UPDATE` procurava `mutarCampoComAuditoria(db, { priority: ...`
   numa linha só — mas o **Biome reformatou** a chamada em várias linhas depois
   que escrevi o script. O alvo virou texto que não existia.

**A lição: o alvo de uma mutação precisa ser inequívoco e resistente ao
formatador.** Um alvo que casa em três lugares testa o que o `replace` escolher,
não o que você quis; e um alvo escrito antes do `biome check --write` pode
simplesmente evaporar. Rodar o formatador **antes** de escrever o script evita o
segundo caso.

**A lição do `assignee` (2.3) foi aplicada preventivamente.** O teste da leitura
escreve `priority` **direto no banco** e lê pelo command — e é justamente ele
que pega a mutação corrigida. Sem isso, a coluna nova poderia nascer com o mesmo
defeito que `assignee` carregou por oito stories.

**Onze mutações próprias, onze reprovações** (`scratchpad/mutacoes-24.py`). As
garantias compartilhadas — versão no `WHERE`, filtro de excluído, auditoria só
quando houve escrita, rate limit — já são cobertas pelas 21 mutações da 2.3, que
agora atacam os helpers e valem para esta story sem uma linha nova:

| Mutação aplicada | Reprovou |
| --- | --- |
| Solicitante ganha permissão de mudar Prioridade | 2 testes |
| Ignorar a capacidade | 2 testes |
| Validar o valor antes de autorizar | 2 testes |
| Aceitar a prioridade que o Chamado já tem | 2 testes |
| Pular o gargalo de visibilidade | 1 teste |
| Usar a versão do Chamado lido | 3 testes |
| Conflito vira sucesso silencioso | 3 testes |
| **Chamado nasce sem a prioridade padrão** | 4 testes |
| Não gravar a prioridade na abertura | 3 testes |
| **Voltar a hardcodar a prioridade na leitura** | 3 testes |
| Gravar a prioridade errada no `UPDATE` | 2 testes |

### Completion Notes List

- **Task 1** — `PRIORIDADES`, `PRIORIDADE_PADRAO`, `prioridade` em
  `NovoTicket` **e** `Ticket`, capacidade e ação.
- **Task 2** — migration `0009`, com asserção contra o catálogo.
- **Task 3/4/5** — contrato, command e tool, **usando** os três helpers.
- **Task 6** — **551 testes** (eram 518); cobertura **98,7%**.
- **Task 7** — FR-6 registrado no PRD.

**Não provado — registrado em vez de deixado implícito:**

1. **Nada ordena por Prioridade ainda.** A coluna existe e é mantida, mas quem
   a usa é a fila do Epic 3. Hoje ela é um campo que se lê e se escreve, sem
   consequência no comportamento do sistema.
2. **Nenhuma regra liga Prioridade a Status ou a prazo.** Não há SLA (Fase
   1.5+), então `critica` e `baixa` diferem só no que está escrito.
3. **A ordem de `PRIORIDADES` é semântica, mas nada depende dela.** O teste
   trava a sequência baixa→crítica para o dia em que a fila ordenar; hoje
   nenhum código compara duas prioridades.
4. **Duas guardas defensivas seguem sem teste** em `ticket-repository.ts`, e a
   conexão IMAP real (1.9).
5. **O `claude-review` ainda não se manifestou** nesta story no momento em que
   este registro foi escrito.

### File List

- `src/domain/ticket.ts` (modificado — `PRIORIDADES`, `PRIORIDADE_PADRAO`)
- `src/domain/prioridade.test.ts` (novo)
- `src/domain/papeis.ts` (modificado — `mudaPrioridade`)
- `src/domain/auditoria.ts` (modificado — `mudar_prioridade`)
- `src/domain/errors.ts` (modificado — `PrioridadeInalterada`)
- `src/application/contracts/mudar-prioridade.ts` (novo)
- `src/application/contracts/ver-chamado.ts` (modificado — expõe a prioridade)
- `src/application/ports/ticket-repository.ts` (modificado)
- `src/application/commands/mudar-prioridade.ts` + teste (novos)
- `src/application/queries/ver-chamado.ts` (modificado)
- `src/adapters/persistence/ticket-repository.ts` (modificado)
- `src/adapters/persistence/prioridade.test.ts` (novo — integração)
- `src/adapters/mcp/server.ts` + teste (modificados — tool)
- `drizzle/migrations/0009_prioridade.sql` e `drizzle/schema.ts`
- Dubles de teste (modificados)
- `scratchpad/mutacoes-24.py` (novo)
- `prd.md` (FR-6)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-11 | Story criada; decidido por delegação que todo Chamado nasce com Prioridade (`media`) e que só o Agente a muda |
| 2026-08-11 | Tasks 1–5: domínio, migration, contrato, command e tool — usando os helpers da 2.3 |
| 2026-08-11 | Task 6: 551 testes, cobertura 98,7% |
| 2026-08-11 | Duas mutações sobreviveram por erro do script (alvo ambíguo e alvo evaporado pelo formatador); 11 de 11 reprovaram |
| 2026-08-11 | Task 7: FR-6 registrado no PRD |
