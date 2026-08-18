---
baseline_commit: 51c4f00
---

# Story 3.1: Filtrar a Fila

Status: review

## Story

As a Agente,
I want listar a Fila filtrando por Status, Dono e Categoria via `buscar_chamados`,
so that eu foque no que importa.

## Acceptance Criteria

1. **Given** vários Chamados de Solicitantes diferentes
   **When** a IA chama `buscar_chamados` com filtros combinados
   **Then** retorna a lista filtrada, ordenada por data de abertura (FR-8, FR-13)
   **And** cada item traz Número, Título, Status, Prioridade, Dono e data —
   **não** a Descrição nem a thread de Comentários.

2. **Given** um Solicitante e Chamados de outras pessoas no banco
   **When** ele lista a Fila
   **Then** o resultado contém **apenas** os Chamados dele (AD-8, FR-2)
   **And** isso vale mesmo que o repositório devolva linhas alheias — o domínio
   descarta o que não é dele.

3. **Given** um Chamado excluído (soft-delete, 1.7)
   **When** qualquer pessoa lista a Fila
   **Then** ele não aparece, para ninguém.

4. **Given** uma Fila maior que o limite
   **When** a lista é pedida sem `limite`
   **Then** volta o padrão de **20** itens, com sinal de que **há mais**
   **And** `limite` acima do teto de **100** é recusado pelo contrato — não
   truncado em silêncio.

5. **Given** dois Chamados abertos no mesmo instante
   **When** a Fila é ordenada
   **Then** a ordem é estável (desempate por Número), e não depende da ordem
   física das linhas.

6. **Given** a Fila com volume
   **When** o filtro por Status roda
   **Then** o plano de execução usa **índice**, não varredura sequencial —
   verificado por `EXPLAIN` contra o Postgres real.

## Tasks / Subtasks

- [x] **Task 1 — O escopo de leitura, no domínio** (AC: #2, #3)
  - [x] `escopoDeLeitura(quem)` em `domain/visibilidade.ts`: `'todos'` ou
        `'apenasDe'` — **decisão de autorização, expressa como dado**
  - [x] `filaVisivelPara(quem, bruta)` — o gargalo que abre o embrulho da lista
  - [x] Teste: o Solicitante não alcança Chamado alheio nem excluído
- [x] **Task 2 — Port e adapter da consulta** (AC: #1..#5)
  - [x] `FilaBruta` e `buscarFilaBruta(escopo, filtros, pagina)` no port
  - [x] Adapter traduz o escopo para `WHERE`, **sempre** com
        `deleted_at IS NULL` na mesma função
  - [x] `ORDER BY criado_em, number` — desempate explícito (lição da 1.2)
  - [x] `limite + 1` para saber que há mais, sem um `COUNT` a mais
- [x] **Task 3 — Migration `0011`** (AC: #6)
  - [x] Índices parciais para as consultas que esta story cria; cada um
        justificado pela consulta que serve
  - [x] Asserção contra o catálogo, provando que existem
- [x] **Task 4 — Contrato e query** (AC: #1, #4)
  - [x] `contracts/buscar-chamados.ts` — filtros derivados do domínio (AD-6),
        `limite` com teto no schema
  - [x] `queries/buscar-chamados.ts` — usa `escopoDeLeitura` e `filaVisivelPara`
- [x] **Task 5 — Tool MCP** (AC: #1)
  - [x] `buscar_chamados` — **usando** `criarHandler`
  - [x] O texto da resposta diz quantos vieram e se há mais
- [x] **Task 6 — Testes** (AC: #1..#6)
  - [x] **Duas identidades com dados de ambas no banco**, em todo teste de lista
  - [x] `EXPLAIN` com volume real (AC #6)
  - [x] **Verificar por mutação** — `scratchpad/mutacoes-31.py`
- [x] **Task 7 — Registrar** (AC: —)
  - [x] PRD (FR-8) e spine (AD-8 estendido para leitura em conjunto)
  - [ ] Rearmar o prompt do loop (PR `docs:` separado, depois do merge)

## Dev Notes

### A decisão desta story: onde a autorização de LISTA acontece

`visivelPara` recebe **um** `ChamadoBruto` e devolve um. Para lista existem dois
caminhos, e nenhum serve puro:

| Caminho | Ganha | Perde |
| --- | --- | --- |
| Trazer tudo e filtrar no domínio | AD-8 intacto | lê a base para devolver 20 linhas (pilar Performático) |
| Filtrar no SQL | rápido, paginável | a autorização desce para o adapter — MCP e HTTP passam a poder divergir |

**Decisão (por delegação): as duas camadas, com papéis diferentes.**

1. **O domínio decide e devolve DADO.** `escopoDeLeitura(quem)` responde "o que
   esta pessoa pode alcançar" — `{ tipo: 'todos' }` para quem tem
   `veChamadoDeTerceiro`, `{ tipo: 'apenasDe', requester }` para os demais. É a
   mesma decisão de `podeVerTicket`, só que **antes** de ler, em vez de depois.
2. **O adapter traduz para `WHERE`, sem decidir nada.** É o precedente já
   registrado na 1.8: *"`origem` é recorte de consulta, não autorização — por
   isso pode ir ao SQL"*. Aqui o escopo **é** autorização, mas ela já foi
   tomada: o adapter recebe a conclusão, não a regra.
3. **O domínio reafirma ao abrir.** O port devolve `FilaBruta` (embrulhada no
   mesmo símbolo privado), e `filaVisivelPara(quem, bruta)` filtra outra vez, em
   memória, sobre 20 linhas. Se o `WHERE` errar, nada vaza.

O passo 3 parece redundante e não é: ele mantém a garantia **estrutural** do
AD-8 (não existe caminho para entregar Chamado sem passar pelo domínio) e faz o
custo do erro cair de "vazamento" para "consulta ineficiente". Prove as duas
camadas **separadamente**:

- o `WHERE` — teste de integração com duas identidades e dados de ambas;
- o gargalo — teste com repositório **duble devolvendo Chamado alheio de
  propósito**, confirmando que a query o descarta.

### Chamado excluído: a condição que agora precisa ser lembrada

Hoje o filtro de excluídos vem de graça dentro de `podeVerTicket` (1.4 + 1.7).
Num `WHERE` montado à parte, ele passa a ser uma linha que alguém precisa
escrever — e esquecer é silencioso.

**Escreva `deleted_at IS NULL` dentro da MESMA função que traduz o escopo**, não
em cada consulta que a chamar. E **mutação obrigatória:** remover essa condição
e confirmar que um teste reprova.

### As quatro decisões de formato — as outras cinco stories herdam

**1. Limite 20, teto 100, e `temMais` em vez de `total`.**

A IA é o consumidor primário (FR-13): uma lista sem teto **estoura o contexto**
dela. O padrão é 20; `limite` acima de 100 é **recusado pelo schema Zod**, e não
truncado — truncar em silêncio faria a IA concluir que viu tudo.

Para saber que há mais, peça `limite + 1` linhas e devolva `temMais: boolean`.
Um `COUNT(*)` daria o total exato e custaria uma segunda varredura para uma
informação que ninguém usa — quem quer números tem o `resumo_fila` (3.3).

**2. A linha da Fila é um RESUMO, não um Chamado.**

`ver_chamado` devolve Descrição e a thread inteira. Cinquenta desses é lixo para
a IA ler e vaza mais do que a lista precisa mostrar. O item carrega: `numero`,
`titulo`, `status`, `prioridade`, `dono`, `criadoEm`. Quem quer o conteúdo chama
`ver_chamado` — e é assim que a autorização de Comentário Interno continua
valendo sem esta story precisar tratar dela.

**3. Ordenação por data de abertura, com desempate por Número.**

FR-8 pede ordenável por data de abertura; o padrão é **crescente** (o mais
antigo primeiro), que é como se atende uma fila. `ORDER BY criado_em, number` —
sem o desempate, dois Chamados abertos no mesmo instante saem na ordem física e
o teste passa por acaso até parar de passar (lição da 1.2). E com paginação por
deslocamento, ordem instável **duplica e omite linhas entre páginas**.

**Ordenar por Prioridade fica FORA** desta story, e é decisão registrada: a AC
pede data de abertura, e ordenar por Prioridade exige mapear a ordem semântica
de `PRIORIDADES` no SQL (`CASE WHEN` ou coluna de peso). A 2.4 deixou o teste
que trava a sequência `baixa→crítica` justamente para esse dia; ele continua
guardando a invariante até alguém pedir.

**4. Filtro por TEXTO fica para a 3.4.**

FR-8 cita "texto livre" e a Story 3.4 é inteira sobre busca textual — com
índice, com Comentários e com o vazamento do match em Comentário Interno para
resolver. Fazer meia busca aqui criaria duas implementações. **Esta story faz
filtros estruturados**: `status`, `dono`, `categoria`. Registre a fronteira no
PRD para a 3.4 não nascer sem escopo.

### Índices: a story onde o pilar Performático deixa de ser teórico

`tickets` tem hoje **um** índice útil: `tickets_vivos_idx (number) WHERE
deleted_at IS NULL`. Nada cobre `status`, `assignee`, `categoria` ou
`requester`. Todo filtro desta story seria varredura sequencial.

A migration `0011` deve criar índices **parciais** (`WHERE deleted_at IS NULL`,
como o da 1.7 — o índice não precisa carregar o que nenhuma consulta alcança),
e cada um justificado pela consulta que serve:

- `requester` — usado em **toda** consulta de Solicitante (é o escopo);
- `status, criado_em` — a fila por Status, já na ordem de leitura;
- `assignee` — "meus" e "sem Dono" (3.2), que vêm logo em seguida.

**Prove que o índice é usado** (AC #6): insira volume (`INSERT ... SELECT
generate_series`, alguns milhares de linhas) e rode `EXPLAIN`, afirmando que o
plano tem `Index Scan` e **não** `Seq Scan`. Com 20 linhas o planejador escolhe
varredura de qualquer jeito e o teste não provaria nada — é o mesmo princípio de
"verifique o artefato, não o exit code".

**Não** use `SET enable_seqscan = off` para forçar: isso testa o `SET`, não o
índice. Se o plano variar entre execuções, registre o que foi observado em vez
de afirmar o que não se sustenta.

### Use o que já existe

| Use | Onde | O que carrega |
| --- | --- | --- |
| `criarHandler` | `adapters/mcp/server.ts` | autenticar → limitar → executar → traduzir erro |
| `embrulharBruto` / `Bruto<T>` | `domain/visibilidade.ts` | o símbolo privado que torna impossível entregar dado sem autorizar |
| `pode(papel, 'veChamadoDeTerceiro')` | `domain/papeis.ts` | a política que `escopoDeLeitura` consulta — **não** reescreva a comparação |
| `STATUS`, `PRIORIDADES`, `CATEGORIAS` | `domain/ticket.ts` | o contrato Zod deriva daqui (AD-6) |
| `queries/ver-historico.ts` | — | o precedente de recorte que vai ao SQL |

**Não crie capacidade nova.** Quem vê a Fila inteira é quem já vê Chamado de
terceiro (`veChamadoDeTerceiro`, 1.4); o Solicitante vê a dele. Uma capacidade
`veFila` daria duas fontes para a mesma pergunta.

### Testes: onde cada garantia se prova

| Garantia | Onde | Por quê ali |
| --- | --- | --- |
| O `WHERE` do escopo (AC #2) | **integração**, duas identidades | é o SQL que filtra; duble concordaria com o que você programou |
| O gargalo do domínio (AC #2) | query, com duble devolvendo alheio | prova a segunda camada isoladamente |
| Excluído fora (AC #3) | **integração** | a condição vive no `WHERE` |
| Paginação e `temMais` (AC #4) | **integração** | depende de contar linhas de verdade |
| Teto do `limite` (AC #4) | contrato Zod | recusa é do schema |
| Ordem estável (AC #5) | **integração**, inserindo fora de ordem | ordem física só aparece no banco |
| Índice em uso (AC #6) | **integração** com volume | `EXPLAIN` sem volume não prova nada |

### Mutações obrigatórias

Em `scratchpad/mutacoes-31.py`, **versionado e commitado**. Rode
`biome check --write` **antes** de escrever os alvos e ancore cada um em texto
único (as sobreviventes da 2.4 foram alvo ambíguo e alvo evaporado pelo
formatador; a da 2.6 foi teste que não alcançava a linha).

| Mutação | Deve reprovar |
| --- | --- |
| `escopoDeLeitura` devolve `'todos'` para qualquer papel | AC #2 |
| Remover o `WHERE` do escopo no adapter | AC #2 |
| Remover `deleted_at IS NULL` do escopo | AC #3 |
| `filaVisivelPara` devolve tudo sem filtrar | AC #2 (segunda camada) |
| Ignorar o `limite` e devolver tudo | AC #4 |
| `temMais` sempre `false` | AC #4 |
| Remover o desempate do `ORDER BY` | AC #5 |
| Ignorar um dos filtros (status/dono/categoria) | AC #1 |
| A linha da Fila passa a carregar a Descrição | AC #1 |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Busca por texto | Story 3.4 (com índice textual e o match em Comentário Interno) |
| Recortes "meus" / "sem Dono" de primeira classe | Story 3.2 |
| Contadores e agregação | Story 3.3 |
| Ordenar por Prioridade | não pedido pela AC; decisão registrada acima |
| Resource "fila" do MCP | Story 3.6 |
| Custo do rate limit por peso de consulta | dívida registrada no prompt do loop |

### Regressões a não causar

- **`ver_chamado` não muda.** Ele continua sendo o único jeito de ver Descrição
  e Comentários, com `visivelPara` intacto.
- **`visivelPara` e `podeVerTicket` não mudam de assinatura.** `escopoDeLeitura`
  é função **nova**, ao lado delas, consultando a mesma tabela de papéis.
- O símbolo privado de `visibilidade.ts` **continua não exportado** — a lista
  usa o mesmo mecanismo, não um paralelo.

### References

- [Source: epics.md#Story 3.1]
- [Source: prd.md#FR-8] — filtros combináveis, ordenável por data de abertura
- [Source: prd.md#FR-13] — tools de leitura não alteram estado e respeitam o papel
- [Source: ARCHITECTURE-SPINE.md#AD-8] — autorização no domínio
- [Source: ARCHITECTURE-SPINE.md#AD-6] — contrato Zod como fonte única
- [Source: 1-4-papeis-e-autorizacao.md] — `podeVerTicket`, o gargalo
- [Source: 1-7-soft-delete-base.md] — índice parcial e o filtro de excluídos
- [Source: 1-8-revisao-do-log-de-auditoria-acoes-mcp.md] — recorte de consulta que vai ao SQL
- [Source: 2-4-mudar-prioridade.md] — a ordem de `PRIORIDADES` guardada para "o dia em que a fila ordenar"

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A decisao de duas camadas funcionou — e quase escondeu o proprio teste.**
`escopoDeLeitura` decide no dominio, o adapter traduz para `WHERE`, e
`filaVisivelPara` reaplica sobre o que voltou. A consequencia esperada era "se
o `WHERE` errar, o custo cai de vazamento para consulta ineficiente". A
consequencia NAO esperada: **remover o `WHERE` nao reprovava teste nenhum**,
porque o gargalo corrigia tudo. O guardrail existia e nao tinha prova.

A saida e a mesma da Story 2.2, quando o `deleted_at IS NULL` do `UPDATE` nao
podia ser testado pelo command porque `visivelPara` barrava antes: **chamar o
repositorio direto**. Aqui, abrir o embrulho com um AGENTE — que ve tudo —
mostra o que o SQL realmente devolveu.

**Mas isso nao bastou para o filtro de excluidos**, e o motivo e sutil:
`podeVerTicket` tambem descarta excluido, entao nem com Agente o gargalo sai da
frente. Quem denuncia e o **`temMais`** — ele vem do SQL (`limite + 1` linhas) e
o dominio **nao o recalcula**. Com limite 1 e um unico Chamado vivo: com o
filtro, o banco acha 1 linha e `temMais` e falso; sem ele, acha 2 e anuncia uma
pagina que nao existe. **Quando o gargalo esconde o SQL, procure o campo que
atravessa sem ser recalculado.**

**O pilar Performatico foi exercitado pela primeira vez no projeto.** Ele nunca
teve gate deterministico (QUALITY-GATE §3.1) e nunca havia sido testado por
violacao plantada. Dois testes de `EXPLAIN` com 5.000 linhas afirmam que o plano
usa `tickets_fila_status_idx` e `tickets_fila_requester_idx`, e nao `Seq Scan`.
Verificado a mao: com `DROP INDEX tickets_fila_status_idx`, o teste reprova
com `Seq Scan on tickets`. **Sem volume o teste nao provaria nada** — com 20
linhas o planejador prefere varrer a tabela, e `enable_seqscan = off` testaria
o `SET`, nao o indice.

**Dezoito mutacoes, dezesseis reprovacoes e duas sobreviventes analisadas.**
Tres das cinco sobreviventes da primeira rodada eram **teste fraco** (o quarto
modo, registrado na 2.6):

| Sobrevivente na 1a rodada | O que era | Correcao |
| --- | --- | --- |
| Remover o `WHERE` do escopo | o gargalo corrigia | teste chamando o repositorio direto |
| Remover `deleted_at IS NULL` | o gargalo corrigia, e o Agente nao isolava | teste pelo `temMais` |
| Linha da Fila carrega a Descricao | integracao so olhava Numeros | assercao campo a campo contra o banco |

| Mutacao aplicada | Reprovou |
| --- | --- |
| `escopoDeLeitura` devolve 'todos' para qualquer papel | 22 testes |
| `escopoDeLeitura` usa a capacidade errada | **inocua — ver abaixo** |
| `filaVisivelPara` devolve tudo sem filtrar | 4 testes |
| Remover o `WHERE` do escopo | 1 teste |
| Remover `deleted_at IS NULL` da Fila | 1 teste |
| Ignorar o filtro de status | 1 teste |
| Ignorar o filtro de dono | 2 testes |
| Ignorar o filtro de categoria | 1 teste |
| Remover o desempate do `ORDER BY` | 2 testes |
| Ignorar a ordem pedida | 1 teste |
| Ignorar o limite e devolver tudo | **inocua — ver abaixo** |
| Ignorar o deslocamento | 2 testes |
| `temMais` sempre `false` | 1 teste |
| Devolver a linha extra do `limite+1` | 1 teste |
| A query pula o gargalo do dominio | 4 testes |
| Teto do limite sobe para 1000 | 1 teste |
| Limite sem teto no schema | 1 teste |
| A linha da Fila carrega a Descricao | 2 testes |

### Completion Notes List

- **Task 1** — `escopoDeLeitura` e `filaVisivelPara` em `domain/visibilidade.ts`.
  `podeVerTicket` teve o parametro **alargado** de `Ticket` para
  `{ requester, excluidoEm }`: a Fila devolve resumo, e trazer `descricao` do
  banco so para descartar seria I/O desnecessario. `Ticket` continua satisfazendo
  o tipo, entao nenhuma chamada existente mudou — e a alternativa (segunda funcao
  para o item da Fila) seria a mesma regra em dois lugares. **Desvio deliberado
  do "nao mudar assinatura" escrito nas Dev Notes**, na direcao que aceita mais,
  nao menos.
- **Task 2** — `buscarFilaBruta` no port e no adapter, com `deleted_at IS NULL`
  dentro da mesma funcao que traduz o escopo.
- **Task 3** — migration `0011`: tres indices parciais, cada um justificado pela
  consulta que serve; `categoria` deliberadamente sem indice.
- **Task 4/5** — contrato com teto no schema, query e tool `buscar_chamados`.
- **Task 6** — **688 testes** (eram 647), cobertura **98,32%**.
- **Task 7** — FR-8 no PRD e AD-8 estendido na spine.

**Nao provado — registrado em vez de deixado implicito:**

1. **A mutacao "`escopoDeLeitura` usa a capacidade errada" e inocua hoje.**
   `veHistorico` e `veChamadoDeTerceiro` sao a mesma lista (`['agente']`), entao
   o codigo mutado se comporta igual. So sera detectavel quando existir um papel
   com uma capacidade e nao a outra — um Gestor que le a fila sem ler o Log.
2. **`limit(limite + 1)` e garantia de CUSTO, nao de correcao.** Quem recorta a
   saida e o `slice`, e nenhum teste de comportamento distingue "trouxe 21
   linhas" de "trouxe 5.000 e jogou fora". A mutacao que ataca a correcao
   ("devolver a linha extra") reprova.
3. **O `EXPLAIN` testa a consulta escrita a mao, nao a que o Drizzle monta.**
   As duas tem o mesmo `WHERE` e o mesmo `ORDER BY`, mas nao ha garantia
   automatica de que continuem iguais se o adapter mudar.
4. **Os indices foram medidos com 5.000 linhas.** A paridade e com um sistema
   com anos de historico; o plano pode mudar em outra ordem de grandeza.
5. **Filtro por texto nao existe** — e da Story 3.4, com indice textual proprio.
   `buscar_chamados` vai **ganhar** o parametro la, e nao virar outra tool.
6. **Nada mede o custo de uma chamada de Fila contra o rate limit** (FR-21), que
   conta chamadas e nao peso. Divida ja registrada no prompt do loop.
7. **O `claude-review` ficou MUDO nas duas rodadas** — 41s ao abrir o PR #63 e
   36s no re-run, zero comentarios. Pelo sinal medido desde o PR #46, menos de
   um minuto e silencio; e a segunda story a levar silencio duplo, depois da
   2.4 (PR #52). Nao e bloqueio — a regra de bloqueio e sobre check **vermelho**
   —, mas significa que **nenhuma revisao semantica cobriu esta story**: a
   decisao de arquitetura (autorizacao em duas camadas) passou sem segunda
   opiniao. O que a sustenta sao os 688 testes, as 18 mutacoes e o `EXPLAIN`
   verificado a mao.

### File List

- `src/domain/visibilidade.ts` (modificado — `escopoDeLeitura`, `filaVisivelPara`, `Identificavel`)
- `src/domain/fila.test.ts` (novo)
- `src/application/ports/ticket-repository.ts` (modificado — `buscarFilaBruta`)
- `src/application/contracts/buscar-chamados.ts` (novo)
- `src/application/queries/buscar-chamados.ts` + teste (novos)
- `src/adapters/persistence/ticket-repository.ts` (modificado — a consulta da Fila)
- `src/adapters/persistence/fila.test.ts` (novo — integracao, com `EXPLAIN`)
- `src/adapters/mcp/server.ts` + teste (modificados — tool `buscar_chamados`)
- `drizzle/migrations/0011_indices_da_fila.sql` (novo)
- Dubles de teste (modificados)
- `scratchpad/mutacoes-31.py` (novo)
- `prd.md` (FR-8) e `ARCHITECTURE-SPINE.md` (AD-8)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-18 | Story criada; decidido por delegação que a autorização de lista acontece em duas camadas, com limite 20/teto 100, item de Fila como resumo, ordenação por data com desempate por Número, e o filtro por texto reservado à 3.4 |
| 2026-08-18 | Tasks 1–5: escopo no domínio, port/adapter, migration com três índices parciais, contrato, query e tool |
| 2026-08-18 | Task 6: 688 testes, cobertura 98,32%; 18 mutações — 3 sobreviventes viraram teste melhor, 2 registradas como inócuas |
| 2026-08-18 | Task 7: FR-8 no PRD, AD-8 estendido na spine |
