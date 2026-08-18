---
baseline_commit: bffd822
---

# Story 3.4: Busca simples

Status: review

## Story

As a Agente,
I want buscar Chamados por texto e Status via `buscar_chamados`,
so that eu não reabra um problema já resolvido.

## Acceptance Criteria

1. **Given** Chamados com o termo no Título, na Descrição ou num Comentário
   **When** a IA busca por esse texto
   **Then** todos aparecem, **inclusive os encerrados** (`resolvido`, `fechado`,
   `cancelado`) — a busca existe justamente para achar o que já foi tratado
   (FR-11).

2. **Given** um Comentário **Interno** que contém o termo
   **When** um **Solicitante** busca por ele
   **Then** o Chamado **não** aparece por causa desse Comentário — o conteúdo
   não foi exibido, mas a **existência do resultado** revelaria que a conversa
   do time fala daquele assunto.

3. **Given** um Comentário **excluído** que contém o termo
   **When** qualquer pessoa busca
   **Then** ele não faz o Chamado aparecer (FR-23).

4. **Given** um Chamado migrado com `numero_legado`
   **When** a IA busca pelo número antigo do sistema anterior
   **Then** o Chamado é encontrado.

5. **Given** o texto combinado com escopo, filtros e recortes
   **When** a busca roda
   **Then** todos **se somam** — buscar não amplia o que a pessoa alcança.

6. **Given** a base com volume
   **When** a busca por texto roda
   **Then** o plano usa índice, e não varredura com `ILIKE` linha a linha.

## Tasks / Subtasks

- [x] **Task 1 — O alcance da busca, no domínio** (AC: #2)
  - [x] `alcanceDaBusca(quem, texto)` em `domain/busca.ts`: devolve o termo
        normalizado **e** se Comentário Interno entra no match
  - [x] Termo vazio/só espaços é recusado (`TermoObrigatorio`)
  - [x] Teste: o mesmo termo produz alcances diferentes por papel
- [x] **Task 2 — Migration `0012`** (AC: #4, #6)
  - [x] `pg_trgm` + índices GIN para `titulo`, `descricao` e `comments.corpo`
  - [x] `tickets.numero_legado text` (nulo) + índice
  - [x] Asserção contra o catálogo, provando extensão, coluna e índices
- [x] **Task 3 — Port e adapter** (AC: #1, #2, #3, #4, #5)
  - [x] O filtro de texto chega como **dado** do domínio
  - [x] O match em Comentário é `EXISTS` com `deleted_at IS NULL` **e** o
        recorte de Interno **dentro** do `WHERE`
  - [x] `numero_legado` casa por igualdade, não por `ILIKE`
- [x] **Task 4 — Contrato e tool** (AC: #1)
  - [x] `texto` em `buscar-chamados.ts`; a descrição da tool diz o que a busca
        cobre
- [x] **Task 5 — Testes** (AC: #1..#6)
  - [x] Duas identidades, e o caso do Comentário Interno em primeiro lugar
  - [x] `EXPLAIN` com volume (AC #6)
  - [x] **Verificar por mutação** — `scratchpad/mutacoes-34.py`
- [x] **Task 6 — Registrar** (AC: —)
  - [x] PRD (FR-11)
  - [ ] Prompt do loop (PR `docs:` separado, depois do merge)

## Dev Notes

### O vazamento desta story é por EXISTÊNCIA, e o gargalo não o pega

Um Comentário **Interno** diz *"cliente é encrenqueiro, escalar para o
jurídico"*. A Solicitante busca por "jurídico" e o Chamado dela aparece. O
conteúdo não foi exibido — mas o resultado **revelou que existe conversa interna
sobre aquilo**. É o mesmo raciocínio da resposta cega da 1.3 e do
`AtribuicaoInvalida` da 2.3, agora num `LIKE`: **o que casa a busca também é
informação.**

E aqui a rede não ajuda. `filaVisivelPara` reaplica `podeVerTicket`, que sabe de
**posse e exclusão** — não sabe nada sobre o conteúdo que fez a linha voltar. Se
o `JOIN` casar num Comentário Interno, o Chamado passa pelo gargalo sem
problema, porque ele **é** dela.

**Decisão (por delegação): o recorte de Comentário Interno vai para o `WHERE`,
como dado decidido pelo domínio.**

```ts
alcanceDaBusca(quem, texto)
  → { termo, comentarios: 'todos' | 'apenasPublicos' }
```

`'todos'` para quem tem `veComentarioInterno` (o Agente, 1.4); `'apenasPublicos'`
para os demais. O adapter traduz — e **não decide**, como em `escopoDeLeitura`
(3.1) e `filtroDeDono` (3.2).

**A mutação obrigatória da story:** remover o recorte de Interno do `WHERE` e
confirmar que um teste reprova. Ela é a razão de esta story existir do jeito que
existe.

### Comentário excluído também não casa

`filtrarComentarios` descarta excluído para **todo mundo**, inclusive Agente
(1.7). O mesmo vale no match: um Comentário apagado não pode continuar fazendo o
Chamado aparecer numa busca — seria o soft-delete vazando por outra porta.

`c.deleted_at IS NULL` entra no mesmo `EXISTS`, junto do recorte de Interno.

### Encerrados entram — e isso já é o comportamento de hoje

FR-11 é explícito: a busca cobre Chamados Fechados/Resolvidos, porque ela existe
para **evitar reabrir problema já resolvido**. Repare que a Fila (3.1) **já não
filtra por Status por padrão** — quem quer só os abertos passa `status`. Então
não há nada a fazer aqui além de **provar com teste** que o encerrado aparece.

Cuidado para não "consertar" isso: o resumo (3.3) exclui encerrados porque mede
**carga**; a busca não mede carga, e a diferença é deliberada.

### `pg_trgm` com `ILIKE`, e não `tsvector`

**Decisão (por delegação):** extensão `pg_trgm` + índices **GIN**, com o match
sendo `ILIKE '%termo%'`.

Por que não busca full-text (`tsvector`): ela exigiria escolher dicionário e
stemming em português, e passaria a **não achar substring** — quem procura "VPN"
num título "VPNs corporativas" ou o pedaço de um código de erro não encontraria.
O PRD pede "busca textual **simples**", e previsibilidade vale mais aqui que
relevância ordenada.

Sem `pg_trgm`, `ILIKE '%x%'` **não usa índice nenhum** e vira varredura com
comparação linha a linha — é o pilar Performático de novo, e desta vez sobre
texto.

**Risco a registrar:** `CREATE EXTENSION` exige privilégio elevado. No ambiente
local o usuário `servicedesk` é superuser e a extensão está disponível
(verificado em 2026-08-18); num Postgres gerenciado, pode ser preciso pedir ao
provedor. Use `CREATE EXTENSION IF NOT EXISTS` e **registre** a dependência no
Dev Agent Record — ela vira pré-requisito de deploy.

### `numero_legado` nasce aqui, vazio

**Decisão (por delegação): criar a coluna agora**, nula, com índice — em vez de
tirar a AC de escopo.

O Epic 4 (import CSV) é quem vai preenchê-la. Criá-la agora custa uma coluna
nula e faz a busca já cobri-la, evitando que a Story 4.2 tenha que voltar e
mexer na busca — que é justamente onde mora o vazamento delicado desta story.

**Casa por igualdade**, não por `ILIKE`: número legado é identificador, não
texto livre. Buscar "123" não deve trazer o Chamado legado "1234". E como o
termo pode ser qualquer coisa, a comparação é `numero_legado = termo` **ou** o
`ILIKE` nos campos de texto — um `OR`, não uma busca separada.

### O termo vazio é recusado

Busca com termo vazio devolveria a base inteira com cara de resultado de busca.
Recuse no **domínio** (`TermoObrigatorio`), não só no `.min(1)` do Zod — mesma
razão do motivo da reabertura (2.6) e do conflito de recorte (3.2): um adapter
HTTP futuro herda a regra.

Espaço em branco também não é termo (`.trim()`), como em `TituloObrigatorio`
(1.1) e `CorpoObrigatorio` (2.1).

### Use o que já existe

| Use | Onde | O que carrega |
| --- | --- | --- |
| `escopoDeLeitura` | `domain/visibilidade.ts` | a autorização de lista |
| `filtroDeDono` | `domain/recorte-da-fila.ts` | o recorte da 3.2 |
| `pode(papel, 'veComentarioInterno')` | `domain/papeis.ts` | **não** reescreva a comparação |
| `buscarFilaBruta` | port | o texto entra como mais um filtro |
| Índices parciais | `0011_indices_da_fila.sql` | os de escopo continuam valendo |

### Testes

| Garantia | Onde | Por quê ali |
| --- | --- | --- |
| Alcance por papel (AC #2) | domínio | função pura |
| Termo vazio recusado | domínio | idem |
| **Match em Interno não vaza (AC #2)** | **integração, duas identidades** | é o `WHERE`; o gargalo não pega |
| Comentário excluído (AC #3) | integração | idem |
| Encerrados aparecem (AC #1) | integração | prova que ninguém "consertou" |
| `numero_legado` (AC #4) | integração, escrevendo direto no banco | a coluna nasce vazia |
| Texto + escopo + recorte (AC #5) | integração, duas identidades | eles se somam |
| Índice GIN (AC #6) | integração com volume | `EXPLAIN` |

Gere os dados no `INSERT`, **não** com `UPDATE` depois: na 3.2 o bloat fez o
planejador preferir varredura e o teste reprovou por um motivo que não era o
índice.

### Mutações obrigatórias

`scratchpad/mutacoes-34.py`. `biome check --write` antes, e **releia o arquivo
formatado** ao escrever o alvo (a 3.2 perdeu uma mutação assim).

| Mutação | Deve reprovar |
| --- | --- |
| **Remover o recorte de Interno do `EXISTS`** | AC #2 |
| `alcanceDaBusca` devolve `'todos'` para qualquer papel | AC #2 |
| Remover `deleted_at IS NULL` do Comentário no match | AC #3 |
| Buscar só no Título (ignorar Descrição e Comentário) | AC #1 |
| `numero_legado` casa por `ILIKE` em vez de igualdade | AC #4 |
| O texto substitui o escopo em vez de somar | AC #5 |
| Aceitar termo vazio | domínio |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Sugerir parecidos na abertura | Story 3.5 (e o conflito com o AD-8 é lá) |
| Ordenar por relevância | não pedido; a ordem continua sendo por data |
| Busca por Dono/Status via texto livre | são filtros próprios (3.1, 3.2) |
| Preencher `numero_legado` | Epic 4 (import CSV) |
| Acento-insensibilidade (`unaccent`) | não pedido; **registre** se decidir por ela |

### Regressões a não causar

- **`buscar_chamados` sem `texto` continua idêntica** — mesma paginação, mesma
  ordem, mesmos filtros.
- O resumo (3.3) **não muda**: ele exclui encerrados de propósito.
- `filaVisivelPara` **não muda** — e é justamente por ele não saber de conteúdo
  que o recorte de Interno precisa estar no `WHERE`.

### References

- [Source: epics.md#Story 3.4]
- [Source: prd.md#FR-11] — Título, Descrição, Comentários; cobre encerrados
- [Source: 3-1-filtrar-a-fila.md] — a forma da Fila e o padrão de `EXPLAIN`
- [Source: 3-2-recortes-meus-e-sem-dono.md] — decisão no domínio, tradução no adapter
- [Source: 3-3-resumo-da-fila.md] — o que o gargalo sabe, e o que ele não sabe
- [Source: 1-4-papeis-e-autorizacao.md] — `veComentarioInterno`
- [Source: 1-7-soft-delete-base.md] — Comentário excluído sai para todos

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**O vazamento por existência é real, e o teste que o pega é curto.** Um
Comentário Interno dizendo *"escalar para o jurídico"* no Chamado da própria
Solicitante: `filaVisivelPara` deixa passar sem hesitar — o Chamado **é** dela —
e o resultado teria contado que a conversa do time fala daquilo. A mutação que
remove o recorte de Interno do `EXISTS` reprova exatamente **um** teste, e é o
teste que dá sentido à story inteira.

**O gargalo mascarou de novo, no mesmo lugar de sempre.** "O texto substitui o
escopo" passou pela suíte inteira: o Chamado alheio que entrava era descartado
por `filaVisivelPara` na saída. Terceira vez que isso acontece (3.1 com o
`WHERE` do escopo, 3.2 com o recorte, agora com o texto) e a correção é sempre a
mesma — **chamar o repositório direto e abrir com um Agente**. Isso já virou
reflexo: vale antecipar o teste em vez de esperar a mutação sobreviver.

**O `EXPLAIN` do GIN exigiu repensar o DADO, não a consulta.** Com as 5.000
linhas de `'Chamado ' || i` que os outros testes usam, o planejador varre — e
acerta: a tabela é pequena e o título é curto. Só com **20.000 linhas de título
realista** o `Bitmap Index Scan` aparece. O teste ganhou bloco próprio com seu
`beforeEach`, e o custo é ~0,5 s. **Índice de texto só se prova com texto de
verdade.**

**Uma decisão que evitou trabalho no Epic 4:** `numero_legado` nasceu aqui,
vazia. A alternativa — tirar a AC de escopo — faria a Story 4.2 (import CSV)
voltar e mexer na busca, que é justamente onde mora o vazamento delicado. Custou
uma coluna nula e um índice parcial.

| Mutação aplicada | Reprovou |
| --- | --- |
| **Remover o recorte de Interno do `EXISTS`** | 1 teste |
| `alcanceDaBusca` devolve `'todos'` para qualquer papel | 3 testes |
| `alcanceDaBusca` usa a capacidade errada | **inócua — ver abaixo** |
| Comentário excluído volta a casar | 1 teste |
| Buscar só no Título (ignorar Descrição) | 4 testes |
| Buscar só nos campos do Chamado (ignorar Comentário) | 1 teste |
| `numero_legado` casa por `ILIKE` | 1 teste |
| **O texto substitui o escopo** | 1 teste (depois do teste que isola o `WHERE`) |
| Aceitar termo vazio | 4 testes |
| A query ignora o texto informado | 9 testes |

### Completion Notes List

- **Task 1** — `alcanceDaBusca` em `domain/busca.ts`, com `TermoObrigatorio`.
- **Task 2** — migration `0012`: `pg_trgm`, três índices GIN, `numero_legado` e
  seu índice parcial.
- **Task 3** — `condicaoDeBusca` no adapter, com o `EXISTS` carregando
  `deleted_at IS NULL` e o recorte de Interno.
- **Task 4** — `texto` no contrato e a descrição da tool dizendo o que a busca
  cobre.
- **Task 5** — **758 testes** (eram 738), cobertura **98,03%**; 10 mutações, 9
  reprovações e 1 inócua.
- **Task 6** — FR-11 registrado no PRD.

**Não provado — registrado em vez de deixado implícito:**

1. **`CREATE EXTENSION pg_trgm` exige privilégio elevado.** Localmente o usuário
   é superuser e a extensão está disponível; num Postgres gerenciado pode ser
   preciso pedir ao provedor. **Isso é pré-requisito de deploy**, e some junto
   com a topologia `Deferred` — ninguém validou num ambiente que não seja este.
2. **A mutação "usa a capacidade errada" é inócua** — `veComentarioInterno` e
   `veChamadoDeTerceiro` são a mesma lista hoje. É a terceira story em que esse
   par aparece.
3. **O `EXPLAIN` prova o índice de `titulo`, não os de `descricao` e
   `comments.corpo`.** Eles existem e seguem o mesmo padrão, mas só um está
   coberto por teste de plano.
4. **A busca é acento-sensível.** "manutencao" não acha "manutenção". A extensão
   `unaccent` está disponível e **não** foi usada: normalizar acento muda o que
   os índices guardam e não foi pedido. Registrado como decisão, não como
   esquecimento.
5. **Não há relevância nem ordenação por pertinência** — os resultados saem por
   data de abertura, como o resto da Fila. Quem busca um termo genérico pagina.
6. **O `ILIKE` não escapa `%` e `_` do termo.** Buscar `100%` casa como curinga.
   Não é vazamento (o escopo continua valendo), mas é resultado surpreendente —
   e é dívida conhecida, não descuido.

### File List

- `src/domain/busca.ts` + teste (novos)
- `src/domain/errors.ts` (modificado — `TermoObrigatorio`)
- `src/application/ports/ticket-repository.ts` (modificado — `busca` no filtro)
- `src/application/contracts/buscar-chamados.ts` (modificado — `texto`)
- `src/application/queries/buscar-chamados.ts` (modificado)
- `src/adapters/persistence/ticket-repository.ts` (modificado — `condicaoDeBusca`)
- `src/adapters/persistence/fila.test.ts` (modificado — busca, escopo isolado, GIN)
- `src/adapters/mcp/server.ts` (modificado — descrição da tool)
- `drizzle/migrations/0012_busca.sql` (novo) e `drizzle/schema.ts`
- `scratchpad/mutacoes-34.py` (novo)
- `prd.md` (FR-11)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-18 | Story criada; decidido por delegação que o recorte de Comentário Interno vai para o `WHERE`, que a busca usa `pg_trgm` + `ILIKE`, e que `numero_legado` nasce aqui vazio |
| 2026-08-18 | Tasks 1–4: domínio, migration `0012`, `condicaoDeBusca`, contrato e tool |
| 2026-08-18 | Task 5: 758 testes; 10 mutações, 9 reprovações e 1 inócua. "O texto substitui o escopo" só reprovou depois do teste que chama o repositório direto |
| 2026-08-18 | Task 6: FR-11 registrado no PRD |
