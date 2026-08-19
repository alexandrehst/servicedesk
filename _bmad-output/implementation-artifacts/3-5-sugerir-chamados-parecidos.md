---
baseline_commit: 5d60a1f
---

# Story 3.5: Sugerir Chamados parecidos

Status: review

## Story

As a Solicitante/Agente,
I want ver Chamados parecidos ao abrir via `chamados_parecidos`,
so that duplicados sejam evitados.

## Acceptance Criteria

1. **Given** um texto de abertura
   **When** a IA chama `chamados_parecidos(texto)`
   **Then** retorna Chamados semelhantes, **ordenados do mais parecido para o
   menos** (FR-12).

2. **Given** um Solicitante
   **When** ele pede sugestões
   **Then** só vêm Chamados **dele** — sugerir o de terceiro seria vazar
   Título alheio para quem está apenas abrindo um Chamado (AD-8).

3. **Given** um texto que não se parece com nada
   **When** a sugestão roda
   **Then** volta **lista vazia** — sugerir o Chamado menos diferente da base
   seria pior que não sugerir.

4. **Given** Chamados encerrados
   **When** a sugestão roda
   **Then** eles **entram**: "já resolvemos isso" é a resposta mais útil que a
   sugestão pode dar. Excluídos ficam fora.

5. **Given** a tool de sugestão
   **When** ela falha ou não encontra nada
   **Then** **nada impede a abertura** — a sugestão é conselho, não gate
   (FR-12).

6. **Given** a base com volume
   **When** a sugestão roda
   **Then** o plano usa o índice de trigramas.

## Tasks / Subtasks

- [x] **Task 1 — O limiar, no domínio** (AC: #1, #3)
  - [x] `LIMIAR_DE_SEMELHANCA` e `textoParaSugestao` em `domain/semelhanca.ts`
  - [x] Teste do limiar como **decisão**, não número mágico
- [x] **Task 2 — Port e adapter** (AC: #1, #2, #3, #4, #6)
  - [x] `buscarParecidosBruto(escopo, texto, limite)` usando `similarity()`
  - [x] `%` para o índice **e** `similarity() >= limiar` explícito
  - [x] `ORDER BY similarity DESC`, com desempate por Número
- [x] **Task 3 — Contrato, query e tool** (AC: #1, #5)
  - [x] `contracts/chamados-parecidos.ts` — sem paginação, limite pequeno
  - [x] `chamados_parecidos` **usando** `criarHandler`
  - [x] A descrição diz que é **conselho**, e que a abertura não depende dela
- [x] **Task 4 — Testes** (AC: #1..#6)
  - [x] Duas identidades, e o teste de que `abrir_chamado` não mudou
  - [x] `EXPLAIN` com volume e texto realista (lição da 3.4)
  - [x] **Verificar por mutação** — `scratchpad/mutacoes-35.py`
- [x] **Task 5 — Registrar** (AC: —)
  - [x] PRD (FR-12)
  - [ ] Prompt do loop (PR `docs:` separado, depois do merge)

## Dev Notes

### A decisão desta story: a sugestão respeita o AD-8, e isso a torna modesta

FR-12 quer sugerir parecidos **na abertura** — e quem abre costuma ser o
**Solicitante**, que só enxerga os próprios Chamados (FR-2, 1.4). Isso cria um
conflito de frente:

| Caminho | O que acontece |
| --- | --- |
| Sugerir de toda a base | **Vaza Título alheio** para quem só queria abrir um Chamado |
| Sugerir dentro do escopo | Honesto, e **pouco útil** para o Solicitante: ele só vê os dele |

**Decisão (por delegação): a sugestão usa o MESMO `escopoDeLeitura` das demais
leituras.** Para o Agente — que enxerga a Fila inteira — ela funciona como o
FR-12 imagina. Para o Solicitante, ela responde "você já abriu isso" em vez de
"a empresa já resolveu isso", que é menos, mas é **verdadeiro**.

**A alternativa recusada, e o porquê:** devolver ao Solicitante uma forma "sem
conteúdo" — só Número e Título de Chamados de terceiros. **Título é conteúdo**:
"Acesso negado ao sistema da folha para o financeiro" já entrega o que a pessoa
não podia ver. Não existe versão anônima útil de um Título.

Registre no PRD que o valor pleno da FR-12 depende de o Agente ser quem consulta
— e que uma sugestão cruzada para o Solicitante exigiria decidir **o que** dela
pode ser mostrado, que é decisão de produto nova.

### `similarity()`, e não `ILIKE`

A busca da 3.4 é `ILIKE '%termo%'`: acha **substring**, e o usuário informa uma
palavra. Aqui a entrada é **o texto de abertura inteiro** — uma frase. Nenhum
Chamado contém a frase inteira como substring, então `ILIKE` devolveria vazio
sempre.

`pg_trgm` (já instalado na 3.4) oferece `similarity(a, b)`, que compara
**conjuntos de trigramas**: "VPN nao conecta" contra "VPN nao esta conectando"
dá 0,67. É a "busca textual simples" que a FR-12 pede.

**Duas condições no `WHERE`, e as duas são necessárias:**

- `titulo % $texto` — o operador de similaridade, que é o que **usa o índice
  GIN**;
- `similarity(titulo, $texto) >= LIMIAR` — o limiar **explícito**, porque o `%`
  usa `pg_trgm.similarity_threshold`, que é **configuração de sessão** e não
  está sob controle deste código.

Sem a segunda, o resultado dependeria do estado da conexão que o pool entregar.
**Registre** que, se a sessão elevar o threshold, o `%` filtra antes e o limiar
explícito não tem como recuperar o que ficou de fora — é limitação conhecida, e
o padrão do Postgres (0,3) coincide com o limiar escolhido.

### O limiar é decisão, não número mágico

`LIMIAR_DE_SEMELHANCA = 0.3` vive no **domínio**, com o porquê escrito: abaixo
disso a "semelhança" passa a ser coincidência de trigramas comuns (artigos,
terminações), e a sugestão vira ruído que ensina a IA a ignorá-la.

**Lista vazia é resposta melhor que palpite** (AC #3). Uma sugestão errada na
abertura custa mais que nenhuma: ela empurra quem abre a "achar" que já existe
Chamado, ou faz a IA propor fechar como duplicado algo que não é.

### Só Título e Descrição — Comentário fica fora

A 3.4 teve de resolver o vazamento por existência justamente porque a busca
alcança Comentário. **Aqui isso não se aplica**, e é decisão deliberada: a
sugestão compara o **texto de abertura** com o **texto de abertura** dos outros
Chamados. Conversa posterior não descreve o problema original.

Efeito colateral bem-vindo: sem Comentário no match, não há como um Comentário
Interno influenciar a existência de um resultado.

### Encerrados entram; excluídos não

"Já resolvemos isso em outubro" é a resposta **mais útil** que a sugestão pode
dar — é literalmente o que evita o duplicado. Segue a busca (3.4), não o resumo
(3.3), que exclui encerrados por medir carga.

### A sugestão é conselho, não gate (AC #5)

FR-12 é explícito: *não bloqueia a abertura*. Hoje isso sai de graça, porque
`chamados_parecidos` é uma **tool separada** e `abrir_chamado` não a chama.

**Prove com teste** que abrir continua funcionando sem passar por aqui — e
**registre** que, se um dia a abertura passar a consultar sugestões, a falha
delas não pode propagar: é o mesmo padrão do e-mail na 1.6/2.5
(`notificarComLink` absorve a falha e a transforma em log).

### Tool própria, e não um parâmetro de `buscar_chamados`

FR-13 lista `chamados_parecidos` entre as tools de leitura, e a diferença não é
cosmética: **o nome é o que a IA lê para decidir**. "Buscar" é o que ela faz
quando o humano pede; "parecidos" é o que ela consulta antes de abrir.

A saída também difere — poucos itens, sem paginação, ordenados por semelhança e
não por data. Enfiar isso em `buscar_chamados` significaria um modo que muda
ordenação e ignora `limite`/`deslocamento`.

**Mas reuse o que existe por baixo:** `escopoDeLeitura` (3.1) e a mesma forma de
item da Fila (`itemDaFilaSchema`, 3.1). Se você estiver escrevendo um `WHERE` de
escopo novo, parou no lugar errado.

### Use o que já existe

| Use | Onde |
| --- | --- |
| `escopoDeLeitura` | `domain/visibilidade.ts` |
| `itemDaFilaSchema` | `contracts/buscar-chamados.ts` — a linha de resumo já definida |
| `criarHandler` | `adapters/mcp/server.ts` |
| Índices GIN | `0012_busca.sql` — servem para `%`, **não** crie outro |

### Testes

| Garantia | Onde |
| --- | --- |
| Limiar e texto vazio | domínio |
| Ordem por semelhança (AC #1) | integração |
| Escopo (AC #2) | integração, **duas identidades** |
| Nada parecido → vazio (AC #3) | integração |
| Encerrados entram, excluídos não (AC #4) | integração |
| Abrir não depende da sugestão (AC #5) | integração |
| Índice (AC #6) | integração com volume e **texto realista** (lição da 3.4) |

### Mutações obrigatórias

`scratchpad/mutacoes-35.py`. `biome check --write` antes; **releia o arquivo
formatado** ao escrever o alvo.

| Mutação | Deve reprovar |
| --- | --- |
| Ignorar o escopo (sugerir de toda a base) | AC #2 |
| Baixar o limiar para 0 (sugerir qualquer coisa) | AC #3 |
| Remover o `similarity() >= limiar` explícito | AC #3 |
| Ordenar por data em vez de semelhança | AC #1 |
| Incluir excluídos | AC #4 |
| Excluir os encerrados | AC #4 |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Marcar Chamado como duplicado | não existe no MVP |
| Sugerir na hora do `abrir_chamado` | a tool é separada, e a AC pede que não bloqueie |
| Sugestão cruzada para o Solicitante | decisão de produto nova (ver acima) |
| Resource/Prompt do MCP | Story 3.6 |

### Regressões a não causar

- `abrir_chamado` **não muda** — nem contrato, nem comportamento.
- `buscar_chamados` **não muda**.
- Nenhum índice novo: os da `0012` servem.

### References

- [Source: epics.md#Story 3.5]
- [Source: prd.md#FR-12] — busca textual simples, não bloqueia a abertura
- [Source: 3-4-busca-simples.md] — `pg_trgm`, e por que Comentário fica fora aqui
- [Source: 3-1-filtrar-a-fila.md] — `escopoDeLeitura` e a linha de resumo
- [Source: ARCHITECTURE-SPINE.md#AD-8]

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**Cinco de oito mutações sobreviveram na primeira rodada — e quatro delas eram o
mesmo mascaramento que o prompt do loop manda antecipar.** Eu tinha acabado de
escrever, ao fechar a 3.4, que "o gargalo mascarou pela terceira vez — escreva
desde o início o teste que chama o repositório direto". Não segui aqui, e paguei
com uma rodada inteira de mutação.

O detalhe que torna esta story pior que as anteriores: **as duas camadas se
mascaram mutuamente**. Com o `WHERE` correto, remover o gargalo dá o mesmo
resultado; com o gargalo no lugar, remover o `WHERE` dá o mesmo resultado. Cada
uma precisou de um teste que desligasse a outra:

| Mutação sobrevivente | O que a pegou |
| --- | --- |
| Ignorar o escopo na query | asserção sobre **o que a query pediu** (`recebido.escopo`), como na 3.1 |
| A query pula o gargalo | duble devolvendo Chamado alheio |
| Incluir excluído no SQL | **o `limite` como sonda** — ele corta antes do gargalo |
| Ordenar por data | dados em que a ordem por semelhança **diverge** da ordem por Número |
| Remover o limiar explícito | `SET pg_trgm.similarity_threshold = 0.05` na sessão |

**A sonda do `limite` é nova e vale registrar.** Na 3.3 foi o `temMais` (vem do
SQL e o domínio não recalcula); aqui `temMais` é fixo, mas o **limite** tem a
mesma propriedade: ele corta no banco, **antes** do gargalo. Com `limite: 1` e o
excluído sendo o mais parecido, o filtro ausente faz o excluído ocupar a única
vaga e o resultado chega vazio ao domínio. **Procure sempre o efeito que
atravessa a camada de baixo sem ser refeito em cima.**

**O teste de ordenação passava por acaso** (quarta vez que isso aparece no
projeto, depois da 1.2, 2.2 e 3.1): o mais parecido também era o de menor
Número, então ordenar por data dava o mesmo. Os dados novos fazem as duas ordens
divergirem de propósito.

**O limiar explícito parecia redundante e não é.** O `%` filtra pelo
`pg_trgm.similarity_threshold`, que é **configuração de sessão** — e o teste que
o prova baixa o threshold para 0,05 e confirma que nada pouco parecido passa.
Sem esse teste, a mutação que remove o limiar sobrevive, porque na sessão padrão
os dois valores coincidem (0,3).

| Mutação aplicada | Reprovou |
| --- | --- |
| Sugerir de toda a base (ignorar o escopo) | 1 teste |
| A query pula o gargalo do domínio | 2 testes |
| Limiar zero | 4 testes |
| Remover o limiar explícito do `WHERE` | 1 teste |
| Ordenar por data em vez de semelhança | 2 testes |
| Incluir Chamado excluído | 1 teste |
| Excluir os encerrados | 1 teste |
| Aceitar texto curto demais | 5 testes |

### Completion Notes List

- **Task 1** — `LIMIAR_DE_SEMELHANCA` (0,3) e `textoParaSugestao` em
  `domain/semelhanca.ts`, reusando `TermoObrigatorio` da 3.4.
- **Task 2** — `buscarParecidosBruto` com `%` (para o índice) **e**
  `similarity() >= limiar` (para não depender da sessão).
- **Task 3** — contrato com a linha de resumo da 3.1, query e tool
  `chamados_parecidos`.
- **Task 4** — **785 testes** (eram 758), cobertura **97,82%**; 8 mutações, 8
  reprovações depois de corrigir os testes.
- **Task 5** — FR-12 registrado no PRD.

**Não provado — registrado em vez de deixado implícito:**

1. **A sugestão é pouco útil para o Solicitante, e isso é decisão, não
   limitação técnica.** Ele recebe apenas os próprios Chamados parecidos. O
   valor pleno da FR-12 depende de o Agente ser quem consulta.
2. **O limiar 0,3 não foi calibrado com dados reais.** É o padrão do `pg_trgm` e
   funciona nos exemplos testados ("VPN nao conecta" × "VPN nao conecta no
   notebook" = 0,67), mas ninguém mediu falso-positivo e falso-negativo numa
   base de verdade — e a base real ainda não existe.
3. **Se a sessão elevar `pg_trgm.similarity_threshold` acima de 0,3**, o `%`
   filtra antes e o limiar explícito não recupera o que ficou de fora. O teste
   cobre o caso oposto (threshold menor).
4. **Só o Título entra na comparação**, não a Descrição. Dois Chamados com
   títulos genéricos ("Erro no sistema") e descrições muito diferentes seriam
   sugeridos um para o outro. Incluir Descrição exigiria decidir peso entre os
   campos — e a FR-12 pede busca **simples**.
5. **Nada mede o custo da sugestão dentro do rate limit** (FR-21), que conta
   chamadas e não peso — mesma dívida registrada desde a 3.1.

### File List

- `src/domain/semelhanca.ts` + teste (novos)
- `src/application/ports/ticket-repository.ts` (modificado — `buscarParecidosBruto`)
- `src/application/contracts/chamados-parecidos.ts` (novo)
- `src/application/queries/chamados-parecidos.ts` + teste (novos)
- `src/adapters/persistence/ticket-repository.ts` (modificado — a consulta por semelhança)
- `src/adapters/persistence/parecidos.test.ts` (novo — integração)
- `src/adapters/mcp/server.ts` + teste (modificados — tool `chamados_parecidos`)
- Dubles de teste (modificados)
- `scratchpad/mutacoes-35.py` (novo)
- `prd.md` (FR-12)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-19 | Story criada; decidido por delegação que a sugestão respeita `escopoDeLeitura`, que usa `similarity()` com limiar no domínio, e que Comentário fica fora do match |
| 2026-08-19 | Tasks 1–3: domínio, port/adapter, contrato, query e tool |
| 2026-08-19 | Task 4: 785 testes; 5 de 8 mutações sobreviveram na primeira rodada — quatro por mascaramento mútuo das duas camadas, uma por teste de ordenação que passava por acaso |
| 2026-08-19 | Task 5: FR-12 registrado no PRD |
