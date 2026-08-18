---
baseline_commit: 39d157f
---

# Story 3.3: Resumo da Fila

Status: review

## Story

As a Gestor,
I want um resumo com contadores via `resumo_fila`,
so that eu enxergue carga e gargalos sob demanda.

## Acceptance Criteria

1. **Given** a Fila
   **When** a IA chama `resumo_fila()`
   **Then** retorna contadores **por Status**, **por Categoria** e **por Dono**,
   sem navegar Chamado a Chamado (FR-10, FR-13).

2. **Given** Chamados de vários Solicitantes
   **When** um Solicitante pede o resumo
   **Then** os números cobrem **apenas os Chamados dele** — contar Chamado que
   a pessoa não pode ver **é** vazar: um contador é um oráculo.

3. **Given** Chamados encerrados (`fechado`, `cancelado`) e excluídos
   **When** o resumo é montado
   **Then** eles ficam **fora** — o resumo mede **carga**, e o que já foi
   encerrado não é carga.

4. **Given** Chamados sem Dono
   **When** o resumo é montado
   **Then** eles aparecem num campo **próprio** (`semDono`), e não como uma
   chave nula na lista por Dono — é o gargalo que o Gestor procura.

5. **Given** um eixo sem nenhum Chamado
   **When** o resumo é montado
   **Then** ele aparece com **zero**, e não some da resposta — ausência e zero
   são coisas diferentes para quem lê um painel.

6. **Given** a Fila com volume
   **When** o resumo é montado
   **Then** as agregações usam índice, e não varredura.

## Tasks / Subtasks

- [x] **Task 1 — O que é "carga", no domínio** (AC: #3)
  - [x] `STATUS_ENCERRADOS` e `ehStatusEmAberto` em `domain/ticket.ts`
  - [x] Teste que amarra a lista às transições: encerrado é exatamente quem
        **não tem transição comum** de saída
- [x] **Task 2 — A garantia que substitui a segunda camada** (AC: #2)
  - [x] `ResumoBruto` carrega o **escopo usado**, e `resumoVisivelPara(quem,
        bruto)` **recusa** se ele não for o escopo de quem pergunta
  - [x] Teste: resumo pedido com escopo alheio é rejeitado pelo domínio
- [x] **Task 3 — Port e adapter** (AC: #1, #3, #4, #5)
  - [x] `buscarResumoBruto(escopo)` com três `GROUP BY`
  - [x] `semDono` sai como contador próprio
  - [x] Zeros preenchidos a partir das listas fechadas do domínio
- [x] **Task 4 — Contrato, query e tool** (AC: #1, #5)
  - [x] `contracts/resumo-fila.ts` — `Record<Status, number>` derivado de
        `STATUS`, idem Categoria
  - [x] `resumo_fila` **usando** `criarHandler`
- [x] **Task 5 — Testes** (AC: #1..#6)
  - [x] Duas identidades com dados de ambas
  - [x] `EXPLAIN` com volume (AC #6)
  - [x] **Verificar por mutação** — `scratchpad/mutacoes-33.py`
- [x] **Task 6 — Registrar** (AC: —)
  - [x] PRD (FR-10)
  - [ ] Prompt do loop (PR `docs:` separado, depois do merge)

## Dev Notes

### A segunda camada do AD-8 NÃO existe aqui — e isso muda o desenho

Nas Stories 3.1 e 3.2 a autorização tinha duas camadas: o `WHERE` do escopo e,
depois, `filaVisivelPara` reaplicando `podeVerTicket` sobre os itens. **Um
resumo não tem itens.** Não há o que reaplicar: se o `WHERE` estiver errado, os
números saem errados e **nada** os corrige.

E o erro é silencioso de um jeito ainda pior que o da lista: um contador não
mostra de quem são os Chamados. `{ aberto: 47 }` parece certo tanto para quem
tem 47 quanto para quem deveria ver 3.

**Decisão (por delegação): o embrulho carrega o ESCOPO que foi usado, e o
domínio o confere.**

```ts
export type ResumoBruto = Bruto<{
  readonly escopo: EscopoDeLeitura   // o que o adapter REALMENTE aplicou
  readonly contadores: ...
}>

resumoVisivelPara(quem, bruto)  // recusa se bruto.escopo ≠ escopoDeLeitura(quem)
```

Isso recupera a garantia **estrutural**: continua sendo impossível entregar
resumo sem passar pelo domínio, e agora o domínio tem **o que verificar** — não
os dados, mas a pergunta que os produziu. Um caso de uso que passe
`{ tipo: 'todos' }` para um Solicitante é recusado, em vez de devolver números
da base inteira.

**Não** compare identidades "na mão" no caso de uso: a comparação é do domínio,
com `escopoDeLeitura` como fonte única. E a **mutação obrigatória** é passar
`'todos'` sempre ao adapter — ela precisa reprovar.

### O resumo mede CARGA: encerrado fica fora

**Decisão (por delegação): `fechado` e `cancelado` não entram em nenhum
contador.** O resumo existe para "enxergar carga e gargalos"; Chamado encerrado
não é carga, e incluí-lo faria o contador por Dono virar o histórico de quem
mais fechou Chamado no ano — ruído no lugar de sinal.

`resolvido` **entra**: ele ainda não foi fechado, pode ser reaberto (2.6) e
representa trabalho aguardando confirmação. Quem quiser histórico usa
`buscar_chamados` com filtro de Status.

Onde isso vive: `STATUS_ENCERRADOS` em `domain/ticket.ts`, ao lado de `STATUS`.
**E amarre à máquina de estados com um teste**: encerrado é exatamente o Status
que **não tem transição comum de saída** (`TRANSICOES[s].length === 0`, hoje
`fechado` e `cancelado`). Derivar não — declarar e **testar a equivalência**: se
alguém acrescentar um Status terminal na 3.x sem lembrar do resumo, o teste
reprova.

### Zero é resposta; ausência não é (AC #5)

Um painel que omite o Status sem Chamados obriga quem lê a saber a lista
completa de cabeça — e some justamente com a informação "não há nada aqui".

Preencha os eixos **fechados** (Status, Categoria) a partir das listas do
domínio (`STATUS`, `CATEGORIAS`), com zero onde o `GROUP BY` não trouxe linha.
O eixo por **Dono é aberto** (identidades), então ali só aparecem os que têm
Chamado — mais `semDono`, que é campo próprio (AC #4) e sempre presente.

### `semDono` é campo, não chave nula

`{ 'bruno@empresa.com': 3, null: 12 }` obriga quem consome a tratar `null` como
chave — e em JSON isso vira a string `"null"`, colidindo com uma identidade
literalmente chamada "null". Além disso, "sem Dono" é o **gargalo** que motiva o
resumo: merece nome próprio, pelo mesmo raciocínio do recorte de primeira classe
da 3.2.

### Três `GROUP BY`, não um `GROUPING SETS`

**Decisão registrada:** três consultas simples, uma por eixo, dentro do mesmo
método do port. `GROUPING SETS` faria uma varredura só e devolveria linhas
heterogêneas que o adapter teria que desempilhar — mais rápido e bem menos
legível. Com índice parcial e uma fila de dezenas de milhares de linhas, três
agregações são baratas.

Se um dia o custo importar, a troca é local (o método do port não muda de
assinatura) — **registre isso no Dev Agent Record** em vez de otimizar agora.

### Autorização: sem capacidade nova

Quem vê a Fila inteira já vê tudo (`veChamadoDeTerceiro`); o Solicitante vê o
resumo **dos dele**, que é verdadeiro e útil. Uma capacidade `veResumo` daria
duas fontes para a mesma pergunta — o mesmo erro que a 3.1 evitou.

Não há papel `gestor` em `PAPEIS` (só `solicitante` e `agente`): a story fala de
Gestor como **pessoa**, e ele opera como Agente hoje. **Não invente o papel**
nesta story.

### Use o que já existe

| Use | Onde |
| --- | --- |
| `escopoDeLeitura` | `domain/visibilidade.ts` (3.1) — a decisão, como dado |
| `embrulharBruto` / `Bruto<T>` | `domain/visibilidade.ts` — o símbolo privado |
| `criarHandler` | `adapters/mcp/server.ts` |
| `STATUS`, `CATEGORIAS` | `domain/ticket.ts` — o contrato deriva (AD-6) |
| Índices parciais | `0011_indices_da_fila.sql` — veja se servem antes de criar |

### Testes

| Garantia | Onde | Por quê ali |
| --- | --- | --- |
| Escopo divergente é recusado (AC #2) | domínio | é função pura |
| Contadores por eixo (AC #1) | integração | é `GROUP BY` |
| Solicitante conta só os dele (AC #2) | integração, **duas identidades** | é o `WHERE` |
| Encerrado e excluído fora (AC #3) | integração | idem |
| `semDono` (AC #4) | integração | idem |
| Zeros presentes (AC #5) | integração | é o preenchimento |
| Índice em uso (AC #6) | integração com volume | `EXPLAIN` |

Sobre o `EXPLAIN`: repita o padrão da 3.1 — volume, `Index Scan`, sem
`enable_seqscan`. E **gere os dados no `INSERT`**, não com `UPDATE` depois: na
3.2 o bloat de um `UPDATE` dobrou as páginas e o planejador passou a preferir
varredura, reprovando o teste por um motivo que não era o índice.

Uma agregação que varre todos os Chamados vivos **pode** legitimamente escolher
`Seq Scan` — agregar a tabela inteira é diferente de buscar 21 linhas. Se for o
caso, **registre o que foi observado** e teste o eixo mais seletivo (o escopo de
um Solicitante) em vez de forçar o resultado.

### Mutações obrigatórias

`scratchpad/mutacoes-33.py`, versionado. `biome check --write` antes, e **releia
o arquivo formatado** ao escrever o alvo (a 3.2 perdeu uma mutação assim).

| Mutação | Deve reprovar |
| --- | --- |
| Passar `{ tipo: 'todos' }` ao adapter sempre | AC #2 |
| `resumoVisivelPara` não confere o escopo | AC #2 |
| Remover o `WHERE` do escopo na agregação | AC #2 |
| Contar encerrados | AC #3 |
| Contar excluídos | AC #3 |
| `semDono` vira chave nula na lista por Dono | AC #4 |
| Omitir eixos com zero | AC #5 |
| Trocar `COUNT` por `COUNT(DISTINCT status)` ou similar | AC #1 |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Filtrar o resumo (por período, por Categoria) | não pedido; `resumo_fila()` é sem parâmetros |
| Tempo médio de resolução / SLA | Fase 1.5+ |
| Papel `gestor` | não existe em `PAPEIS`, e criá-lo é decisão de produto |
| Resource "fila" do MCP | Story 3.6 |

### Regressões a não causar

- `buscar_chamados` **não muda** — nem contrato, nem comportamento.
- `escopoDeLeitura` e `filaVisivelPara` **não mudam**.
- O `STATUS_ENCERRADOS` novo **não** altera `TRANSICOES` nem a máquina de
  estados: ele descreve, não decide.

### References

- [Source: epics.md#Story 3.3]
- [Source: prd.md#FR-10] — contadores por Status, Time/Categoria e Agente
- [Source: 3-1-filtrar-a-fila.md] — `escopoDeLeitura`, o embrulho, o padrão de `EXPLAIN`
- [Source: 3-2-recortes-meus-e-sem-dono.md] — "sem Dono" como coisa de primeira classe; o bloat que reprovou o `EXPLAIN`
- [Source: ARCHITECTURE-SPINE.md#AD-8] — a extensão para leitura em conjunto

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A story que perdeu a rede de segurança, e o que a substituiu.** Nas 3.1 e 3.2
o domínio reaplicava `podeVerTicket` sobre os itens que voltavam do banco; um
resumo não tem itens. O erro que isso deixa passar é mudo de um jeito pior que o
da lista: `{ aberto: 47 }` parece igualmente correto para quem tem 47 e para
quem deveria ver 3 — nenhum contador diz de quem são os Chamados que contou.

A saída foi conferir **a pergunta, não os dados**: `buscarResumoBruto` devolve,
junto dos números, o **escopo que realmente aplicou**, e `resumoVisivelPara`
recusa se ele não for `escopoDeLeitura(quem)`. A garantia estrutural volta —
continua impossível entregar resumo sem passar pelo domínio — e agora o domínio
tem o que verificar. As duas mutações mais importantes da story atacam
exatamente isso, e reprovam 2 e 4 testes.

**`resumoVisivelPara` lança em vez de devolver `null`, e isso é deliberado.**
Escopo divergente não é "você não pode ver": é defeito de programação. Um `null`
viraria "resumo vazio" na cara de quem perguntou e esconderia o bug — mesmo
raciocínio do `pode()` com papel desconhecido (1.4).

**A função nasceu no arquivo errado.** Escrevi `resumo-da-fila.ts` como módulo
próprio e ele não compilava: a chave que abre o embrulho é um símbolo **não
exportado** de `visibilidade.ts`. O precedente já estava escrito lá, no
comentário de `historicoVisivelPara` — *"mora aqui porque a chave é o símbolo
privado deste módulo, e ele continua privado justamente para que nenhuma leitura
consiga pular esta função"*. **O tipo cobrou o desenho antes do teste.**

**Doze mutações, doze reprovações na primeira rodada** — a primeira story do
épico sem sobrevivente. O que mudou em relação à 3.1 e à 3.2: aqui o gargalo
**não** mascara nada (não há o que filtrar), então as mutações do `WHERE` chegam
à saída e os testes de saída bastam. A ausência da rede facilitou o teste
tanto quanto dificultou o desenho.

| Mutação aplicada | Reprovou |
| --- | --- |
| A query pede sempre `'todos'` ao adapter | 2 testes |
| `resumoVisivelPara` não confere o escopo | 4 testes |
| `mesmoEscopo` ignora a identidade | 1 teste |
| Remover o `WHERE` do escopo na agregação | 3 testes |
| Contar encerrados | 1 teste |
| Contar excluídos | 1 teste |
| `semDono` vira chave nula em `porDono` | 2 testes |
| `semDono` sempre zero | 1 teste |
| Omitir os Status com zero | 4 testes |
| Omitir as Categorias com zero | 2 testes |
| `resolvido` passa a ser encerrado | 7 testes |
| `ehStatusEmAberto` responde sempre `true` | 2 testes |

### Completion Notes List

- **Task 1** — `STATUS_ENCERRADOS` e `ehStatusEmAberto` em `domain/ticket.ts`,
  com o teste que os amarra à máquina de estados: encerrado é exatamente quem
  não tem transição comum de saída.
- **Task 2** — `ResumoBruto` carrega o escopo; `resumoVisivelPara` confere.
- **Task 3** — `buscarResumoBruto` com três `GROUP BY` em `Promise.all`.
- **Task 4** — contrato com eixos fechados completos, query e tool
  `resumo_fila`.
- **Task 5** — **738 testes** (eram 713), cobertura **98%**; 12 mutações, 12
  reprovações.
- **Task 6** — FR-10 registrado no PRD.

**Não provado — registrado em vez de deixado implícito:**

1. **Três `GROUP BY` em vez de um `GROUPING SETS`.** São três varreduras onde
   uma bastaria; a troca é local (a assinatura do port não muda) e foi adiada
   por legibilidade. **Nenhum teste mede esse custo** — o `EXPLAIN` desta story
   olha o plano de uma agregação, não o total de três.
2. **O `EXPLAIN` cobre o eixo do escopo, não a agregação completa.** Agregar a
   Fila inteira de um Agente varre a tabela, e varrer ali é a escolha **certa**
   do planejador. Forçar índice nesse caso mediria o `SET`, não o desenho.
3. **Não há papel `gestor`.** A story fala de Gestor como pessoa; ele opera como
   Agente. Criar o papel é decisão de produto, e mudaria `PAPEIS`, a matriz de
   capacidades e o escopo de leitura de uma vez.
4. **O resumo não tem paginação nem limite** — e não precisa, exceto no eixo por
   Dono, que cresce com o número de Agentes (oito hoje). Numa base com centenas
   de Agentes, esse `Record` ficaria grande; ninguém mede isso hoje.
5. **`porDono` não distingue Agente inativo de Agente sem Chamado**: quem não
   tem Chamado em aberto simplesmente não aparece. Para um painel de carga isso
   é o certo; para "quem está ocioso", faltaria cruzar com o cadastro.

### File List

- `src/domain/ticket.ts` (modificado — `STATUS_ENCERRADOS`, `ehStatusEmAberto`)
- `src/domain/visibilidade.ts` (modificado — `ResumoBruto`, `resumoVisivelPara`)
- `src/domain/errors.ts` (modificado — `EscopoDivergente`)
- `src/domain/resumo-da-fila.test.ts` (novo)
- `src/application/ports/ticket-repository.ts` (modificado — `buscarResumoBruto`)
- `src/application/contracts/resumo-fila.ts` (novo)
- `src/application/queries/resumo-fila.ts` (novo)
- `src/adapters/persistence/ticket-repository.ts` (modificado — as três agregações)
- `src/adapters/persistence/resumo-fila.test.ts` (novo — integração)
- `src/adapters/mcp/server.ts` + teste (modificados — tool `resumo_fila`)
- Dubles de teste (modificados)
- `scratchpad/mutacoes-33.py` (novo)
- `prd.md` (FR-10)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-18 | Story criada; decidido por delegação que o embrulho carrega o escopo usado, que encerrados ficam fora, que `semDono` é campo próprio e que zeros são preenchidos |
| 2026-08-18 | Tasks 1–4: domínio, port/adapter com três `GROUP BY`, contrato, query e tool |
| 2026-08-18 | Task 5: 738 testes; 12 mutações, 12 reprovações na primeira rodada |
| 2026-08-18 | Task 6: FR-10 registrado no PRD |
