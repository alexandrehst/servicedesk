---
baseline_commit: a000e41
---

# Story 3.2: Recortes "meus" e "sem Dono"

Status: review

## Story

As a Agente,
I want recortes rápidos dos meus Chamados e dos sem Dono,
so that eu pegue trabalho sem garimpar.

## Acceptance Criteria

1. **Given** a Fila com Chamados atribuídos e não atribuídos
   **When** a IA pede o recorte `sem_dono`
   **Then** vêm **apenas** os que não têm Dono (FR-9)
   **And** o recorte é **de primeira classe**: tem nome próprio no contrato, e
   não é um valor especial escondido no filtro `dono`.

2. **Given** um Agente
   **When** a IA pede o recorte `meus`
   **Then** vêm apenas os Chamados em que **ele é o Dono** — a identidade sai
   de quem está autenticado, **nunca** de um parâmetro que a IA preenche.

3. **Given** um pedido com `recorte` **e** `dono` ao mesmo tempo
   **When** a Fila é consultada
   **Then** é recusado — os dois respondem à mesma pergunta, e escolher um em
   silêncio decidiria pelo chamador.

4. **Given** um Solicitante
   **When** ele pede o recorte `meus`
   **Then** recebe lista vazia, porque ele nunca é Dono de nada — e **não** os
   Chamados que ele abriu, que já são o escopo padrão dele.

5. **Given** qualquer recorte
   **When** ele é combinado com os filtros da 3.1 (status, categoria) e com o
   escopo do papel
   **Then** todos se somam: recorte **não** amplia o que a pessoa alcança.

6. **Given** a Fila com volume
   **When** o recorte `sem_dono` roda
   **Then** o plano usa o índice `tickets_fila_assignee_idx`, e não varredura.

## Tasks / Subtasks

- [x] **Task 1 — O recorte, no domínio** (AC: #1, #2, #3, #4)
  - [x] `RECORTES` e `filtroDeDono(quem, entrada)` em `domain/recorte-da-fila.ts`
  - [x] `FiltroDeDono` = `'qualquer' | 'ninguem' | 'identidade'` — dado, como
        `EscopoDeLeitura` (3.1)
  - [x] `RecorteConflitante` em `DomainErrorCode`
  - [x] Teste de tabela: cada combinação de `recorte` × `dono` × papel
- [x] **Task 2 — Port e adapter** (AC: #1, #2, #5)
  - [x] O port passa a receber `dono: FiltroDeDono` em vez de `dono?: string`
  - [x] `isNull(tickets.assignee)` para `'ninguem'`; `eq` para `'identidade'`
  - [x] O escopo continua entrando junto — recorte e escopo **se somam**
- [x] **Task 3 — Contrato e query** (AC: #1, #3)
  - [x] `recorte: z.enum(RECORTES).optional()` em `buscar-chamados.ts`
  - [x] A query chama `filtroDeDono` e repassa o resultado
- [x] **Task 4 — Tool MCP** (AC: #1)
  - [x] A descrição diz o que cada recorte significa — é o que a IA lê para
        escolher, e "meus" é ambíguo sem isso
- [x] **Task 5 — Testes** (AC: #1..#6)
  - [x] Duas identidades com dados de ambas, como todo teste de lista do épico
  - [x] `EXPLAIN` para `IS NULL` (AC #6)
  - [x] **Verificar por mutação** — `scratchpad/mutacoes-32.py`
- [x] **Task 6 — Registrar** (AC: —)
  - [x] PRD (FR-9) com a decisão sobre o significado de "meus"
  - [ ] Rearmar o prompt do loop (PR `docs:` separado, depois do merge)

## Dev Notes

### O problema que a 3.1 deixou para esta story

O contrato de hoje tem `dono: z.string().min(1).optional()`, e **ausente
significa "não filtre por Dono"**. Não há como expressar `assignee IS NULL` sem
dar dois significados ao mesmo campo — `dono: null`, `dono: ''` ou uma string
mágica seriam exatamente o "filtro escondido" que a AC proíbe.

**Decisão (por delegação): um campo `recorte`, com enum próprio.**

```ts
recorte: z.enum(['meus', 'sem_dono']).optional()
```

É isso que torna o recorte **de primeira classe**: ele tem nome no protocolo, a
IA o descobre lendo o schema da tool, e não precisa saber que "sem Dono" se
escreve como um valor especial de outro campo. A alternativa — tools separadas
`meus_chamados` e `chamados_sem_dono` — duplicaria escopo, paginação e ordenação
em três lugares, que é a duplicação que o Sonar reprovou no PR #50.

### `meus` = sou o DONO, e isso vale para todo papel

**Decisão (por delegação):** `meus` significa **"sou o Dono"** (`assignee`), com
a identidade vindo do **principal autenticado**, nunca de um parâmetro.

Isso importa por dois motivos:

- **Segurança:** `dono: 'outra@pessoa.com'` é um filtro legítimo (ver a fila de
  alguém); `meus` é uma afirmação sobre quem está chamando. Se `meus` fosse
  açúcar para "preencha `dono` com a sua identidade", a IA teria que saber e
  escrever a identidade — e escreveria errado em algum momento.
- **Auditabilidade:** um recorte que significasse **coisas diferentes conforme
  o papel** ("que eu atendo" para o Agente, "que eu abri" para o Solicitante)
  seria impossível de auditar: duas pessoas leriam o mesmo nome e receberiam
  regras distintas, e a Story 3.3 teria que replicar a bifurcação no resumo.

Consequência aceita e registrada (AC #4): para o **Solicitante**, `meus` devolve
**vazio**, porque ele nunca recebe atribuição (`recebeAtribuicao` é só de
Agente, decisão da 2.3). Isso é verdadeiro, não confuso — os Chamados que ele
abriu já são o escopo padrão dele, sem recorte nenhum. **Diga isso na descrição
da tool**, que é o texto que a IA lê antes de escolher.

### `recorte` + `dono` juntos é recusa, não precedência

Os dois respondem à mesma pergunta ("de quem é este Chamado?"). Aceitar a
combinação exigiria escolher um vencedor em silêncio — e quem chamou não saberia
qual filtro foi aplicado.

**A recusa vive no DOMÍNIO**, não só no `.refine()` do Zod: é o mesmo raciocínio
do `motivoValido` na 2.6 (AD-7). Um adapter HTTP futuro que montasse o próprio
schema herdaria a regra de graça.

Erro novo: `RecorteConflitante`. **Não** reuse `TransicaoInvalida` nem invente
`ArgumentoInvalido` genérico — o projeto nomeia erro pela pergunta que ele
responde.

### A forma: `FiltroDeDono` como dado, no molde da 3.1

A 3.1 estabeleceu o padrão — o domínio decide e entrega **dado**, o adapter
traduz para `WHERE` sem decidir nada. Siga:

```ts
export type FiltroDeDono =
  | { readonly tipo: 'qualquer' }                          // sem recorte, sem filtro
  | { readonly tipo: 'ninguem' }                           // sem_dono
  | { readonly tipo: 'identidade'; readonly identity: string }  // meus, ou dono: X
```

Repare que `meus` e `dono: 'fulano'` **convergem para o mesmo caso** —
`'identidade'`. A diferença entre eles é de **onde vem a identidade**, e essa
decisão é do domínio, não do SQL. O adapter só vê o resultado.

O port deixa de receber `dono?: string` e passa a receber `dono: FiltroDeDono`.
É mudança de assinatura interna, sem efeito no contrato público.

### Recorte NÃO amplia escopo (AC #5)

`escopoDeLeitura` (autorização) e `filtroDeDono` (consulta) entram no mesmo
`WHERE` e **se somam**. Um Solicitante pedindo `sem_dono` recebe *os dele que
não têm Dono* — nunca os de terceiros.

**Mutação obrigatória:** fazer o recorte substituir o escopo em vez de somar, e
confirmar que um teste reprova. É a forma mais provável de esta story vazar.

### Índice: já existe, e é preciso provar que serve para `IS NULL`

`tickets_fila_assignee_idx (assignee, criado_em, number) WHERE deleted_at IS
NULL` foi criado na 3.1 **antecipando esta story**. B-tree do Postgres indexa
`NULL`, então `WHERE assignee IS NULL` pode usá-lo — mas "pode" não é "usa".

Repita o padrão da 3.1: volume (`INSERT ... SELECT generate_series`), `EXPLAIN`,
e a afirmação de que o plano cita o índice e **não** tem `Seq Scan`. Se o
planejador escolher varredura porque a maioria das linhas casa (uma fila em que
quase nada tem Dono), **registre o que foi observado** em vez de afirmar o que
não se sustenta — e considere um dado de teste em que "sem Dono" seja minoria.

### Testes: a armadilha que a 3.1 mediu

**A segunda camada esconde erros da primeira.** `filaVisivelPara` reaplica
`podeVerTicket` sobre o que voltou — mas ele **não sabe nada sobre Dono**, então
para esta story o gargalo **não** é rede de segurança: um erro no `WHERE` do
recorte chega inteiro à saída.

Isso na verdade facilita: os testes de saída bastam para provar o recorte. O que
continua exigindo cuidado é a interação **recorte × escopo** (AC #5), porque aí
o gargalo volta a mascarar — teste com **duas identidades e dados de ambas**.

| Garantia | Onde |
| --- | --- |
| `sem_dono` e `meus` (AC #1, #2) | integração |
| Conflito recusado (AC #3) | domínio (função pura) |
| Solicitante com `meus` (AC #4) | integração |
| Recorte não amplia escopo (AC #5) | integração, duas identidades |
| Índice em `IS NULL` (AC #6) | integração com volume |

### Mutações obrigatórias

`scratchpad/mutacoes-32.py`, versionado e commitado. `biome check --write`
**antes** de escrever os alvos.

| Mutação | Deve reprovar |
| --- | --- |
| `meus` vira `'qualquer'` (recorte ignorado) | AC #2 |
| `sem_dono` vira `'qualquer'` | AC #1 |
| `meus` usa `entrada.dono` em vez da identidade autenticada | AC #2 |
| Aceitar `recorte` + `dono` juntos | AC #3 |
| O recorte **substitui** o escopo em vez de somar | AC #5 |
| `isNull` vira `isNotNull` | AC #1 |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Contadores por Dono | Story 3.3 |
| Filtro por texto | Story 3.4 |
| Recorte "do meu Time" | não pedido; Categoria já filtra |
| Atribuir a partir da Fila | é a 2.3, e é escrita |

### Regressões a não causar

- **`buscar_chamados` sem `recorte` continua idêntica** — mesmos defaults,
  mesma ordenação, mesma paginação da 3.1.
- **O filtro `dono: 'fulano'` continua funcionando** (ver a fila de outro
  Agente): ele não é substituído pelo recorte, apenas convive.
- `escopoDeLeitura` e `filaVisivelPara` **não mudam**.

### References

- [Source: epics.md#Story 3.2]
- [Source: prd.md#FR-9] — "sem Dono" é recorte de primeira classe
- [Source: 3-1-filtrar-a-fila.md] — a forma da Fila e a armadilha das duas camadas
- [Source: 2-3-atribuir-dono-self-assign.md] — `recebeAtribuicao` é só de Agente
- [Source: 2-6-acoes-irreversiveis-com-confirmacao.md] — exigência que vive no domínio, não no schema
- [Source: ARCHITECTURE-SPINE.md#AD-8] — a extensão para leitura em conjunto

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A story custou pouco porque a 3.1 pagou a conta.** `escopoDeLeitura` ja tinha
estabelecido a forma — dominio decide, entrega dado, adapter traduz — e
`filtroDeDono` e a mesma forma aplicada a outra pergunta. Producao: **~60
linhas**, sem migration (o indice `tickets_fila_assignee_idx` foi criado na 3.1
antecipando esta story) e sem tocar em `escopoDeLeitura` nem em
`filaVisivelPara`.

**A armadilha da 3.1 apareceu de novo, e no lugar previsto.** A story dizia:
"para o recorte, o gargalo NAO e rede de seguranca — `podeVerTicket` nao sabe
nada sobre Dono". Isso e verdade para `meus` e `sem_dono` isolados, e por isso
os testes de saida bastaram para eles. Mas a interacao **recorte x escopo**
volta a ser mascarada: a mutacao que faz o recorte **substituir** o escopo — a
forma mais provavel de esta story vazar — passou pela suite inteira, porque
`filaVisivelPara` descartava o Chamado alheio que entrava. A saida foi a mesma
da 3.1: **chamar o repositorio direto e abrir com um Agente**.

**E o alvo de mutacao evaporou pelo formatador — de novo (licao da 2.4).**
Escrevi `...(filtros.dono.tipo === 'identidade' ? ... : [])` em tres linhas; o
Biome juntou tudo numa so, e o script reportou a mutacao como sobrevivente
quando na verdade nunca a aplicou. **Rodar `biome check --write` antes nao
basta: e preciso reler o arquivo formatado ao escrever o alvo.**

**O `EXPLAIN` reprovou por um motivo que nao era o indice.** A primeira versao
do teste de `sem_dono` atribuia Dono com `UPDATE` depois do `INSERT`, e o bloat
resultante dobrou as paginas da tabela — o planejador passou a preferir
varredura, e o teste media o bloat. Gerando os dados ja com a distribuicao certa
no `INSERT`, o plano usa `Bitmap Index Scan on tickets_fila_assignee_idx`.
**Dado de teste tambem e configuracao de teste.**

| Mutacao aplicada | Reprovou |
| --- | --- |
| O recorte 'meus' e ignorado | 8 testes |
| O recorte 'sem_dono' e ignorado | 4 testes |
| 'meus' usa o parametro `dono` em vez da identidade autenticada | **inocua — ver abaixo** |
| Aceitar `recorte` e `dono` juntos | 6 testes |
| 'sem_dono' vira 'tem dono' (`isNull` -> `isNotNull`) | 4 testes |
| O filtro de Dono por identidade e ignorado | 6 testes |
| **O recorte SUBSTITUI o escopo** (vaza Chamado alheio) | 1 teste |
| A query ignora o recorte e passa o dono cru | 9 testes |

### Completion Notes List

- **Task 1** — `RECORTES`, `FiltroDeDono` e `filtroDeDono` em
  `domain/recorte-da-fila.ts`; `RecorteConflitante` em `DomainErrorCode`.
- **Task 2** — o port passou a receber `dono: FiltroDeDono` (mudanca interna,
  sem efeito no contrato publico); o adapter traduz os tres casos.
- **Task 3/4** — `recorte` no schema, query chamando o dominio, e a descricao da
  tool dizendo o que cada recorte significa.
- **Task 5** — **713 testes** (eram 700 antes desta story); 8 mutacoes, 7
  reprovacoes e 1 inocua.
- **Task 6** — FR-9 registrado no PRD.

**Nao provado — registrado em vez de deixado implicito:**

1. **A mutacao "'meus' usa o parametro `dono`" e inocua, e por um bom motivo:**
   quando `recorte === 'meus'`, a guarda de conflito ja garantiu que
   `entrada.dono` e `undefined`, entao `entrada.dono ?? quem.identity` sempre
   cai no fallback. O codigo mutado e equivalente **porque a recusa do conflito
   existe** — e a mutacao que remove essa recusa reprova 6 testes.
2. **O `EXPLAIN` do `sem_dono` depende da distribuicao dos dados.** Com "sem
   Dono" sendo minoria (1 em 10) o plano usa indice; numa fila em que quase nada
   tem Dono, varredura seria a escolha certa do planejador — e o teste
   reprovaria sem que houvesse defeito.
3. **`meus` para o Solicitante devolve vazio**, e isso e deliberado. Se um dia
   se decidir que "meus" significa "os que abri" para ele, sera decisao de
   produto nova — e vai exigir revisitar o resumo da 3.3.
4. **Nada impede pedir a fila de outro Agente** (`dono: 'ana@empresa.com'`): e
   filtro legitimo dentro do escopo de quem ja ve Chamado de terceiro. Se um dia
   isso precisar de restricao, e capacidade nova, nao ajuste no filtro.

### File List

- `src/domain/recorte-da-fila.ts` + teste (novos)
- `src/domain/errors.ts` (modificado — `RecorteConflitante`)
- `src/application/ports/ticket-repository.ts` (modificado — `dono: FiltroDeDono`)
- `src/application/contracts/buscar-chamados.ts` (modificado — `recorte`)
- `src/application/queries/buscar-chamados.ts` + teste (modificados)
- `src/adapters/persistence/ticket-repository.ts` (modificado — os tres casos do filtro)
- `src/adapters/persistence/fila.test.ts` (modificado — recortes, escopo isolado, `EXPLAIN`)
- `src/adapters/mcp/server.ts` (modificado — descricao da tool)
- `scratchpad/mutacoes-32.py` (novo)
- `prd.md` (FR-9)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-18 | Story criada; decidido por delegação que o recorte é um enum próprio, que `meus` significa "sou o Dono" com identidade do principal, e que `recorte` + `dono` são recusados no domínio |
| 2026-08-18 | Tasks 1–4: domínio, port/adapter, contrato, query e descrição da tool |
| 2026-08-18 | Task 5: 713 testes; 8 mutações, 7 reprovações e 1 inócua. A mutação "recorte substitui escopo" só reprovou depois de um teste que chama o repositório direto |
| 2026-08-18 | Task 6: FR-9 registrado no PRD |
