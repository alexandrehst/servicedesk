---
baseline_commit: 5d44603
---

# Story 2.1: Comentar Chamado (público/interno)

Status: review

## Story

As a Agente operando via IA,
I want adicionar Comentário Público ou Interno via `comentar_chamado`,
so that o andamento fique registrado e comunicável.

## Acceptance Criteria

1. **Given** um Chamado existente
   **When** a IA chama `comentar_chamado(numero, texto, interno?)`
   **Then** o Comentário é anexado com **autor e timestamp** (FR-3, FR-14)
   **And** a escrita e seu registro de auditoria saem na **mesma transação**
   (AD-3).

2. **Given** um Comentário Interno
   **When** o Solicitante lê o Chamado
   **Then** ele **não** aparece — pelo mesmo `filtrarComentarios` que a Story
   1.2 já usa (AD-8), sem regra nova.

3. **Given** um Solicitante
   **When** ele comenta o **próprio** Chamado
   **Then** o Comentário é criado, mas **só público**: pedir `interno: true`
   é recusado com `SemPermissao`.

4. **Given** um Chamado que o autor não pode ver — alheio, excluído ou
   inexistente
   **When** ele tenta comentar
   **Then** recebe `TicketNaoEncontrado`, pelo **mesmo gargalo** das outras
   operações (`visivelPara`), sem checagem nova de posse ou de exclusão.

5. **Given** um corpo de Comentário vazio ou só com espaços
   **When** a criação é pedida
   **Then** o domínio rejeita com erro tipado e **nada** é persistido —
   nem Comentário, nem auditoria.

## Tasks / Subtasks

- [x] **Task 1 — Domínio: a capacidade e a validação** (AC: #3, #5)
  - [x] Capacidade `comentaInterno` na matriz de `papeis.ts` — só Agente
  - [x] `criarComentario` em `domain/comentario.ts`: função pura que valida o
        corpo e monta o `NovoComentario` (espelha `abrirTicket` da 1.1)
  - [x] `CorpoObrigatorio` em `DomainErrorCode`
- [x] **Task 2 — Contrato Zod** (AC: #1, #3)
  - [x] `contracts/comentar-chamado.ts`: input (`numero`, `texto`, `interno?`)
        e output; datas em ISO 8601 UTC
  - [x] `interno` é opcional com default `false` — quem não pede, não cria
        Comentário Interno por acidente
- [x] **Task 3 — Port e adapter** (AC: #1)
  - [x] `criarComentarioComAuditoria(numero, novo, autor)` no
        `TicketRepository` — insert + auditoria na **mesma transação** (AD-3)
  - [x] Ação auditada distingue público de interno (justificativa em Dev Notes)
  - [x] **Nenhuma** migration: `comments` existe desde a 1.2
- [x] **Task 4 — Command handler** (AC: #1..#5)
  - [x] `commands/comentar-chamado.ts`, copiando a ordem de `excluirChamado`:
        `buscarPorNumero` → `visivelPara` → `pode` → repositório
  - [x] Solicitante que pede `interno: true` recebe `SemPermissao`
- [x] **Task 5 — Tool MCP** (AC: #1)
  - [x] `comentar_chamado` em `adapters/mcp/server.ts`
  - [x] `autenticar()` **e** `limitarChamadas()` — nesta ordem, antes de agir
- [x] **Task 6 — Testes** (AC: #1..#5)
  - [x] Recusa antes do caminho feliz: alheio, excluído, inexistente
        comparados **entre si**; Solicitante pedindo interno
  - [x] Integração: o Comentário aparece na leitura da 1.2 para o Agente e
        **não** aparece para o Solicitante
  - [x] Atomicidade: corpo inválido não deixa Comentário **nem** auditoria
  - [x] **Verificar por mutação** — tabela no Dev Agent Record, script
        versionado em `scratchpad/mutacoes-21.py`
- [x] **Task 7 — Registrar a decisão sobre o AD-10** (AC: —)
  - [x] Refinamento do AD-10 na spine e no PRD (ver Dev Notes)

## Dev Notes

### A decisão que esta story precisa tomar: o AD-10

O AD-10 diz que *"todo command de mutação recebe a versão esperada do Chamado;
divergência faz o domínio rejeitar com `Conflict`"*. **Nada disso existe**
(verificado em 2026-08-11): não há coluna `version`, não há `updated_at`, não
há `Conflict` em `DomainErrorCode`. O Epic 1 não precisou — só criava e lia.

Esta é a primeira mutação do Epic 2, então a pergunta cai aqui.

**Decisão (por delegação): comentar NÃO usa concorrência otimista, e a coluna
`version` nasce na Story 2.2.**

O motivo não é economia de trabalho — é que aplicar o AD-10 aqui produziria
**conflitos falsos**. Concorrência otimista existe para impedir *lost update*:
dois Agentes leem o mesmo Chamado, os dois editam o Status, e o segundo
sobrescreve o primeiro **em silêncio**. Comentar não é isso. É uma escrita
**aditiva**: dois Agentes comentando ao mesmo tempo produzem dois Comentários,
e os dois estão corretos. Rejeitar o segundo com `Conflict` seria inventar um
problema — e treinaria quem usa a IA a repetir a chamada até passar, que é o
comportamento oposto do que o AD-10 quer.

Então o refinamento a registrar na spine é:

> **AD-10 aplica-se a mutação de campo do Chamado** (status, dono, prioridade,
> título). Escrita **aditiva** — Comentário, entrada de Log — não versiona o
> Chamado, porque não há update a perder.

Escreva isso na spine, no PRD e aqui. **Não deixe implícito**: sem o registro,
a próxima story vai ler "todo command de mutação" e concluir que a 2.1 esqueceu.

### O padrão a copiar é `excluirChamado`, e a ordem não é estilo

`src/application/commands/excluir-chamado.ts` (Story 1.7) é o modelo:

```
buscarPorNumero → visivelPara(autor, bruto) → pode(autor.role, capacidade)
                → repositorio.<acao>ComAuditoria(...)
```

**`visivelPara` antes de `pode`**, sempre. Quem não pode ver recebe
`TicketNaoEncontrado` (indistinguível de inexistente); quem vê mas não pode
agir recebe `SemPermissao`. Esconder existência de quem já a conhece não
protege nada — e a distinção invertida entregaria um oráculo de existência,
porque os Números são sequenciais (AD-4).

**`visivelPara` já descarta excluído (1.7) e alheio (1.4).** Se você escrever
`if (ticket.excluidoEm)` ou `if (ticket.requester === ...)` aqui, parou no
lugar errado. A AC #4 existe para provar que a herança funciona.

### O caso torto desta story: o Solicitante comenta, mas não interno

Não é "Solicitante não comenta". Ele **pode** comentar o próprio Chamado — e
essa é a única operação de escrita que ele tem no sistema inteiro. O que ele
não pode é criar Comentário **Interno**.

Isso decompõe em duas checagens que já existem separadas:

| Checagem | De onde vem |
| --- | --- |
| É o Chamado dele? | `visivelPara` (1.4) — sem ela, comentaria em Chamado alheio |
| Pode criar interno? | `pode(role, 'comentaInterno')` — capacidade nova |

Um Solicitante pedindo `interno: true` recebe **`SemPermissao`**, não silêncio
e não um comentário público criado à revelia. Rebaixar o pedido em silêncio
seria pior que recusar: quem escreveu achando que era interno veria o texto
aparecer para o Solicitante — que é ele mesmo aqui, mas o mesmo código serviria
a um Agente confuso amanhã.

### O que o Log grava, e por que a ação distingue público de interno

A ação auditada é `comentar_chamado` ou `comentar_chamado_interno`. Distinguir
importa para a revisão da Story 1.8 — quem audita o que a IA fez precisa saber
se ela criou conversa interna do time, que tem público diferente do público.

Não há risco de vazamento nisso: o histórico exige a capacidade `veHistorico`,
que só o Agente tem (decisão da 1.8). O Solicitante nunca lê o Log.

**O corpo do Comentário NÃO vai para a auditoria.** O Log registra que a ação
aconteceu, não o conteúdo — duplicar o texto ali criaria uma segunda cópia fora
do soft-delete (`audit_entries` é append-only, FR-22), e um Comentário excluído
continuaria legível no histórico.

### A dívida do Log que esta story NÃO resolve

A Story 2.3 vai precisar registrar "Dono anterior → novo", e `audit_entries` só
tem `acao`, `autor`, `origin`, `registrado_em`. Não há onde guardar "de X para
Y". A 2.2, 2.4 e 2.5 têm a mesma necessidade.

**Esta story não resolve, e a decisão é consciente:** codificar na própria ação
(`comentar_chamado_interno`) basta aqui, e inventar uma coluna `detalhe` agora
seria especular sobre o formato que a 2.2 vai precisar. **A 2.2 é o lugar** —
ela é a primeira que muda o valor de um campo, e lá a necessidade é real, não
antecipada. Registre isso no Dev Agent Record para a 2.2 encontrar.

Lembre, quando chegar a hora: mudar o shape de `audit_entries` mexe no contrato
de saída do histórico da 1.8.

### A tool MCP, e o esquecimento provável

Seis handlers novos entram no `server.ts` ao longo do Epic 2. Cada um precisa,
**nesta ordem**:

```ts
const autor: Principal = { ...(await autenticar()), origin: 'mcp' }
await limitarChamadas(autor.identity)   // ← o que se esquece copiando e colando
const saida = await executar(input, autor)
```

Autenticar primeiro porque uma escrita gravada antes de saber quem a fez fica
com autoria indefinida (AD-3). Limitar antes de executar porque contar depois
deixa a escrita acontecer — e o limite não serviria para nada numa IA em loop.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
| --- | --- |
| Coluna `version` e erro `Conflict` | 2.2 (decisão acima) |
| Coluna de detalhe em `audit_entries` | 2.2 |
| Bloquear Comentário por Status (Chamado fechado) | 2.2 abre a máquina; hoje todo Chamado está `aberto` |
| Editar ou excluir Comentário | soft-delete de Comentário já existe na leitura (1.7); a **ação** não está no MVP |
| E-mail ao Solicitante quando o Agente comenta | FR-18 cobre abertura e resolução; a 2.5 traz a segunda |

### Armadilhas conhecidas

- **Cobertura lida por arquivo** (1.2), não o total: 92% global escondia um
  arquivo em 0% na 1.9.
- **Escrita que não aconteceu não vira auditoria** (1.7) — se a validação
  rejeitar, nada é gravado.
- **`await promessa.catch((e) => e as Error)` não devolve `Error`**: use um
  helper que estreite com `ehDomainError` e **falhe quando não houver erro**.
- **Teste de ordenação insere fora de ordem**; a leitura da 1.2 já ordena
  `criadoEm, id` — o desempate importa porque vários Comentários podem nascer
  no mesmo instante num teste.
- **Verde do `claude-review` não é evidência** — confira `/pulls/NN/comments`.

### References

- [Source: epics.md#Story 2.1]
- [Source: prd.md#FR-3] — Comentário Público e Interno, autor e timestamp
- [Source: ARCHITECTURE-SPINE.md#AD-2] — domínio é o único ponto de mutação
- [Source: ARCHITECTURE-SPINE.md#AD-3] — auditoria na mesma transação
- [Source: ARCHITECTURE-SPINE.md#AD-8] — Comentário Interno nunca vai ao Solicitante
- [Source: ARCHITECTURE-SPINE.md#AD-10] — o refinamento decidido acima
- [Source: 1-7-soft-delete-base.md] — `excluirChamado`, o padrão de mutação
- [Source: 1-2-ver-um-chamado-via-mcp.md] — `filtrarComentarios`, a leitura que já existe

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**Duas mutações sobreviveram na primeira rodada, e as duas eram inócuas — não
falhas de teste.** É exatamente a armadilha que a Story 1.9 registrou, e ela
apareceu de novo:

1. A mutação "autor vem da entrada" escrevia
   `(entrada as {autorInformado?: string}).autorInformado ?? autor.identity`.
   Como nenhum teste passa `autorInformado`, o `??` **sempre** caía no
   fallback: o código mutado era idêntico ao original.
2. A mutação "auditoria fora da transação" trocava o `throw` da guarda
   `linha === undefined` — que **nunca dispara** num insert bem-sucedido.

Corrigidas para mutações reais (`autor: 'sistema@empresa.com'` e remover o
insert de auditoria), as duas passaram a reprovar 4 e 2 testes. **A lição é que
uma mutação sobrevivente não significa "teste fraco" até você verificar que ela
muda comportamento observável.**

**A capacidade é sobre `interno`, não sobre "comentar" — e essa escolha decidiu
o desenho.** Uma capacidade `comentaChamado` teria tirado do Solicitante a
única escrita que ele tem no sistema, transformando o Chamado dele numa via de
mão única. A posse já é resolvida por `visivelPara` (1.4); o que a matriz
precisa decidir é só o "interno". A mutação que dá `comentaInterno` ao
Solicitante reprova 4 testes.

**Recusa explícita em vez de rebaixamento silencioso.** A alternativa —
rebaixar um pedido de Comentário Interno para público quando o autor não pode —
parece amigável e é pior: quem escreveu achando que era interno veria o texto
aparecer para quem quis esconder. A mutação que faz isso reprova 3 testes,
incluindo um que existe só para travar essa decisão.

**O corpo do Comentário não entra na auditoria, e o motivo é o soft-delete.**
`audit_entries` é append-only (FR-22) e, por decisão da 1.7, não tem
`deleted_at`. Se o texto fosse copiado para lá, um Comentário excluído
continuaria legível no histórico da 1.8 — a exclusão seria cosmética.

**A ação distingue público de interno** porque quem audita o que a IA fez
precisa saber se ela criou conversa do time. Não há vazamento nisso: o
histórico exige `veHistorico`, que só o Agente tem (1.8), então o Solicitante
nunca lê o Log.

**O `?? false` no handler MCP não é defensivo — é necessário.** O tipo de
entrada é `z.input`, então `interno` é opcional ali; sem o fallback, o valor
chegaria `undefined` ao domínio. A mutação que troca o default para `true`
reprova 2 testes.

**O `claude-review` achou uma violação real na segunda rodada.** O adapter
Postgres decidia sozinho o rótulo de auditoria, ramificando sobre
`novo.internal` dentro do INSERT. O argumento que convence é a comparação com
os métodos irmãos: `criarComAuditoria` grava `'abrir_chamado'` e
`excluirComAuditoria` grava `'excluir_chamado'` — **sempre string estática,
decidida por qual operação foi chamada**, nunca por um campo de negócio lido
dentro do adapter. Este era o primeiro a introduzir esse branch.

A consequência não é teórica: o adapter virava o único lugar do sistema que
sabia o que aquele booleano significa para a auditoria. Um segundo caminho de
escrita — outro adapter, um script de migração do Epic 4 — teria que
redescobrir o mapeamento, e duas implementações poderiam divergir na string
gravada sem nada reprovar. O filtro do histórico (1.8) passaria ao largo.

A correção criou `ACOES` e `acaoDeComentario` em `domain/auditoria.ts`: o
vocabulário do Log virou **lista fechada no domínio**, como `STATUS`,
`CATEGORIAS` e `ORIGENS`. O command resolve o rótulo e o entrega pronto; o
adapter grava, não interpreta. Isso rende juros no Epic 2 — as cinco stories
seguintes acrescentam ações, e agora cada uma exige uma linha na lista que o
compilador cobra.

**Treze mutações aplicadas, treze reprovações** (script versionado em
`scratchpad/mutacoes-21.py`):

| Mutação aplicada | Reprovou |
| --- | --- |
| Solicitante ganha permissão de Comentário Interno | 4 testes |
| Ignorar a capacidade `comentaInterno` | 3 testes |
| Rebaixar Comentário Interno para público em silêncio | 3 testes |
| **Pular o gargalo de visibilidade** | 4 testes |
| Aceitar corpo vazio | 8 testes |
| Autor gravado é o dono do Chamado, e não quem escreveu (AD-9) | 4 testes |
| Não distinguir interno na ação auditada | 5 testes |
| **Adapter volta a deduzir a ação em vez de receber a do domínio** | 2 testes |
| Gravar o corpo do Comentário na auditoria | 3 testes |
| Não gravar auditoria do Comentário | 2 testes |
| **Esquecer o `limitarChamadas` no handler MCP** | 2 testes |
| Default de `interno` vira `true` | 2 testes |
| Engolir erro não-tipado no handler | 3 testes |

A quarta e a décima são as que mais valem: a primeira prova que a autorização
sai do gargalo da 1.4 (e não de checagem nova), e a segunda protege contra o
esquecimento mais provável do Epic 2 — seis handlers novos, seis chances de
omitir o rate limit copiando e colando.

### Completion Notes List

- **Task 1** — `comentaInterno` na matriz; `criarComentario` puro em
  `domain/comentario.ts`, espelhando `abrirTicket`; `CorpoObrigatorio`.
- **Task 2** — contrato com `interno` default `false` (a decisão de segurança
  está no default) e `criadoEm` em ISO 8601 UTC.
- **Task 3** — `criarComentarioComAuditoria`: insert + auditoria na mesma
  transação. **Nenhuma migration**: `comments` existe desde a 1.2.
- **Task 4** — command copiando a ordem de `excluirChamado`.
- **Task 5** — tool `comentar_chamado`, com `autenticar` e `limitarChamadas`.
- **Task 6** — **400 testes** (eram 350); cobertura **98,43%**.
- **Task 7** — AD-10 refinado na spine; FR-3 atualizado no PRD.

**Não provado — registrado em vez de deixado implícito:**

1. **A atomicidade do Comentário não tem teste dedicado.** Ela é estrutural —
   o mesmo `db.transaction` já exercitado na 1.1 e na 1.7 — mas forçar uma
   falha *entre* o insert do Comentário e o da auditoria exigiria injetar erro
   no meio da transação, e o Drizzle não expõe esse ponto. Não há FK entre
   `comments.ticket_number` e `tickets.number` que permitisse provocá-la por
   dado inválido. O que existe é o teste de que a auditoria **acontece**, e a
   mutação que a remove reprova.
2. **Nada impede comentar em Chamado `resolvido` ou `fechado`.** A máquina de
   estados é da 2.2, e hoje todo Chamado está `aberto` — não há como escrever
   o teste. Quando a 2.2 abrir as transições, decidir se Comentário em Chamado
   fechado é recusado.
3. **A coluna de detalhe do Log continua ausente.** A 2.3 precisará registrar
   "Dono anterior → novo" e `audit_entries` não tem onde. Esta story resolveu
   o caso dela codificando na própria ação, sem inventar coluna — **a 2.2 é o
   lugar de decidir**, porque é a primeira que muda valor de campo. Lembrar
   que mexer no shape afeta o contrato de saída do histórico da 1.8.
4. **Sem limite de tamanho do corpo.** Um Comentário de 10 MB é aceito. Na
   escala do MVP não é problema; vira um se houver import de migração (Epic 4).
5. **O `claude-review` foi mudo numa rodada e revisou na seguinte, no mesmo
   PR.** Na primeira passou verde em **44s** sem comentar nada
   (`/pulls/46/comments` → 0); no commit seguinte levou **4m50s** e apontou a
   violação de AD-1/AD-2 acima. A duração é o sinal mais confiável: revisão de
   verdade leva 4–5 minutos (#41: 4m06s, #43: 4m38s), silêncio leva menos de
   um. **Verde curto não é evidência de revisão.**

### File List

- `src/domain/comentario.ts` + teste (novos)
- `src/domain/auditoria.ts` + teste (modificado/novo — `ACOES` e `acaoDeComentario`, movidos do adapter após o review do PR #46)
- `src/domain/papeis.ts` + teste (modificados — `comentaInterno`)
- `src/domain/errors.ts` (modificado — `CorpoObrigatorio`)
- `src/application/contracts/comentar-chamado.ts` (novo)
- `src/application/ports/ticket-repository.ts` (modificado — `criarComentarioComAuditoria`)
- `src/application/commands/comentar-chamado.ts` + teste (novos)
- `src/adapters/persistence/ticket-repository.ts` (modificado)
- `src/adapters/persistence/comentario.test.ts` (novo — integração)
- `src/adapters/mcp/server.ts` + teste (modificados — tool `comentar_chamado`)
- Dubles de teste em `application/{commands,queries}` (modificados)
- `scratchpad/mutacoes-21.py` (novo — verificação por mutação)
- `prd.md` (FR-3) e `ARCHITECTURE-SPINE.md` (AD-10) — modificados
- `_bmad-output/implementation-artifacts/{2-1-...,sprint-status.yaml}` (mod.)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-11 | Story criada; AD-10 refinado por delegação (escrita aditiva não versiona); coluna de detalhe do Log adiada para a 2.2 com motivo |
| 2026-08-11 | Tasks 1–5: domínio, contrato, port, command e tool MCP |
| 2026-08-11 | Task 6: 392 testes, cobertura 98,41% |
| 2026-08-11 | Duas mutações sobreviveram por serem inócuas; corrigidas, 12 de 12 reprovaram |
| 2026-08-11 | Task 7: AD-10 refinado na spine (escrita aditiva não versiona); FR-3 no PRD |
| 2026-08-11 | PR #46: nove checks verdes; `claude-review` mudo em 44s (silêncio verde, sem comentário) |
| 2026-08-11 | PR #46: `claude-review` apontou o adapter deduzindo o rótulo de auditoria; vocabulário do Log virou lista fechada no domínio |
| 2026-08-11 | Treze mutações (uma nova, contra o adapter voltar a deduzir) aplicadas e reprovadas; 400 testes |
