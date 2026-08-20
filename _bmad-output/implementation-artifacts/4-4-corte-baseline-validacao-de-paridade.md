---
baseline_commit: 8b4f81c
---

# Story 4.4: Corte — baseline & validação de paridade

Status: review

## Story

As a construtor,
I want medir o baseline atual e validar paridade rodando em paralelo antes de desligar,
so that o corte do contrato seja seguro e comprovado, não um salto no escuro.

## ⚠️ Esta story NÃO é completável por código, e isso é parte da entrega

As ACs do épico pedem **medir o sistema contratado** e **rodar em paralelo por
~1 mês**. Nenhuma das duas coisas é feita escrevendo código: a primeira exige
acesso ao software do fornecedor, a segunda exige um mês passar.

**O que esta story entrega é o instrumento**, e o que ela **não** entrega fica
declarado — com nome de quem faz. O critério de pronto está no fim deste
documento, e ele **não inclui** os números do sistema antigo.

## Acceptance Criteria

1. **Given** o Log de auditoria com o histórico do ServiceDesk
   **When** o relatório de baseline é consultado
   **Then** ele devolve o **tempo de resolução** dos Chamados do período, com
   mediana e média, calculado a partir dos eventos que já existem — sem coluna
   nova e sem cronômetro paralelo (SM-3).

2. **Given** o mesmo relatório
   **When** ele é consultado
   **Then** devolve também o **percentual de ações via MCP** (SM-4) e a
   **contagem de Agentes distintos que agiram** (SM-5, a parte medível) — as
   três métricas saem do mesmo Log, e separá-las em três consultas seria três
   chances de discordarem sobre o período.

3. **Given** um Chamado reaberto
   **When** o tempo de resolução é calculado
   **Then** a regra aplicada está **declarada e testada** — não implícita.

4. **Given** a checklist de paridade
   **When** o dono do projeto a percorre
   **Then** cada item é **verificável por observação**, com o que conta como
   aprovado, e diz **quem** responde por ele (SM-1, SM-5).

5. **Given** esta story concluída
   **When** o `sprint-status` for atualizado
   **Then** ela reflete o que foi **de fato** entregue — o instrumento —, e o
   que falta está registrado com dono e pré-condição, não escondido.

## Tasks / Subtasks

- [x] **Task 1 — Decidir o que "tempo de resolução" significa** (AC: #1, #3)
  - [x] Escrever a regra nas Dev Notes **antes** do código
  - [x] Reabertura, cancelado, nunca resolvido: os três casos decididos
- [x] **Task 2 — O relatório, a partir do Log** (AC: #1, #2)
  - [x] Port + adapter; **uma** consulta para as três métricas
  - [x] Mediana **e** média — ver Dev Notes
- [x] **Task 3 — Tool `relatorio_de_operacao`** (AC: #1, #2)
  - [x] Contrato Zod (AD-6), autorização no domínio (AD-8)
- [x] **Task 4 — Testes** (AC: #1, #2, #3)
  - [x] Sondas **antes**; casos hostis: base vazia, Chamado sem resolução,
        reaberto, resolvido antes do período
  - [x] `scratchpad/mutacoes-44.py`, com a conferência prévia de alvos
  - [x] **Estender o teste de `outputSchema`** para a tool nova (lição da 4.3)
- [x] **Task 5 — A checklist de paridade** (AC: #4)
  - [x] `_bmad-output/planning-artifacts/checklist-de-paridade.md`
  - [x] Cada item com **critério observável** e **responsável**
- [x] **Task 6 — Registrar o que NÃO foi entregue** (AC: #5)
  - [x] PRD (SM-3) e Dev Agent Record; prompt do loop no PR `docs:` seguinte
  - [x] Status **honesto** no `sprint-status.yaml`

## Dev Notes

### O que é medível de dentro, e o que não é — a espinha desta story

| Métrica | Medível aqui? | Por quê |
| --- | --- | --- |
| **SM-3** tempo de resolução **do ServiceDesk** | ✅ | o Log tem `mudar_status` com `de`/`para` e `registrado_em` desde a 2.2 |
| **SM-3** baseline **do contratado** | ❌ | outro sistema, sem acesso — **é do dono do projeto** |
| **SM-4** % de ações via MCP | ✅ | `audit_entries.origin` existe desde a 1.1 e distingue `mcp`/`api`/`email` |
| **SM-5** Agentes distintos operando | ✅ (parcial) | `audit_entries.autor` — mede quem agiu, não se são "os 8" |
| **SM-5** "zero Chamados perdidos fora dele" | ❌ | é sobre o que **não** está aqui; nenhuma consulta interna enxerga isso |
| **SM-1** paridade funcional | ❌ | é julgamento sobre tipos de Chamado do mundo real — **checklist** |

**Escreva essa tabela no Dev Agent Record.** Ela é a entrega intelectual da
story: separa o que o sistema prova sozinho do que exige alguém olhando.

### O relatório sai do Log, e não de coluna nova

Tentador: uma coluna `resolvido_em` em `tickets`. **Não faça.** O Log é
append-only (FR-22) e **já tem** o evento — `mudar_status` com `para =
'resolvido'` e `registrado_em`. Uma coluna derivada seria um segundo lugar
guardando o mesmo fato, com a chance de divergir; e o AD-3 existe justamente
para que o Log seja a fonte.

O que o Log **não** tem: o instante de abertura como evento próprio? Tem —
`abrir_chamado`. Mas `tickets.criado_em` também. **Use o Log**, para que o
cálculo inteiro venha de uma fonte só. E lembre da 4.2: Chamado importado tem
`criado_em` do arquivo antigo e `abrir_chamado` do dia do import — **se você
misturar as fontes, o tempo de resolução do histórico migrado vira ficção.**

### As três decisões que a Task 1 precisa tomar antes de qualquer código

**a) Reabertura.** Um Chamado resolvido, reaberto e resolvido de novo tem dois
tempos. Opções: o **primeiro** (mede a primeira resposta), o **último** (mede
até parar de voltar), ou a **soma** dos intervalos ativos.

**Recomendação: o ÚLTIMO**, e a razão é a pergunta que a métrica responde —
"quanto tempo o Solicitante esperou até o problema acabar?". Uma reabertura diz
que não tinha acabado. Registre a alternativa recusada: o primeiro faria o
número melhorar quando o atendimento piora, que é o pior defeito possível numa
métrica de serviço.

**b) Chamado nunca resolvido.** Fica **fora** do cálculo, e o relatório diz
**quantos** ficaram. Um Chamado aberto há 3 meses não tem tempo de resolução —
e assumir "até agora" misturaria "demorou" com "não acabou".

**c) Cancelado.** Fora, pelo mesmo motivo: cancelar não é resolver.

### Mediana E média, e o porquê de não ser preciosismo

A AC do épico e o SM-3 falam em "tempo **médio**". **Entregue os dois.** Numa
fila pequena — 8 Agentes — um único Chamado esquecido por dois meses arrasta a
média e faz o sistema parecer pior do que é; e o inverso também acontece.
**A mediana é o número honesto para comparar com o baseline; a média é o que o
SM-3 pediu.** Devolver só a média sabendo disso seria entregar o número que
engana.

Devolva também **quantos Chamados entraram no cálculo**: uma média de 3 Chamados
não sustenta decisão de corte de contrato, e quem lê precisa ver isso.

### O período é entrada, e a autorização é a de sempre

O relatório recebe `de`/`ate`. Sem período, o padrão são os **últimos 30 dias**
— é a janela que a AC do épico usa ("~1 mês em paralelo").

**Autorização: `veHistorico`** (a capacidade que a 1.8 criou), e não uma nova.
A pergunta é a mesma — "pode ver o que aconteceu no sistema?" —, e o relatório é
uma agregação do que aquela capacidade já libera. Inventar `veRelatorio` seria
uma capacidade que nunca diverge da outra, exatamente o que a 4.3 registrou como
mutação não-matável.

### A checklist de paridade: o que a torna útil em vez de teatro

Documento versionado em `planning-artifacts/`, **não** código. Cada item precisa
de três coisas, e é a terceira que costuma faltar:

1. **o que verificar** — em forma observável ("abrir um Chamado de cada tipo da
   lista X e levá-lo até resolvido"), não em forma de intenção ("garantir que
   funciona");
2. **o que conta como aprovado** — o critério, explícito;
3. **quem responde** — nome do papel, não "o time".

Os itens saem do SM-1 e do SM-5. Inclua o que o **pré-mortem** já apontou: o
formato do CSV do fornecedor (a 4.2 definiu o contrato de entrada, o mapeamento
real continua aberto) e a lista de tipos de Chamado que hoje passam pelo
contratado — **que ninguém levantou ainda**.

### Sondas — escreva ANTES

- **base vazia** devolve zero e não `NaN`/`null`: um relatório que quebra sem
  dados é inútil justamente no primeiro dia;
- **Chamado sem resolução** não entra na média — e a contagem dele aparece;
- **reaberto** usa a regra declarada, com asserção sobre o número, não sobre
  "não deu erro";
- **o período corta de verdade**: Chamado resolvido antes do `de` fica fora.
  Sem esta, o filtro pode não existir e ninguém percebe.

### Escopo — o que esta story NÃO faz

| Fora | Por quê |
| --- | --- |
| Medir o sistema contratado | sem acesso; **é do dono do projeto** |
| Rodar 1 mês em paralelo | o loop não faz o tempo passar |
| Avaliar a checklist | julgamento humano sobre o mundo real |
| Decidir cortar o contrato | decisão de negócio |
| Dashboard/gráfico | não pedido; o relatório é dado, e a IA o lê |

### Regressões a não causar

- **Nenhuma coluna nova** e nenhuma escrita: esta story é 100% leitura.
- O relatório **não** contorna o AD-8: quem não pode ver o histórico não vê o
  agregado dele.
- Chamado **excluído** fica fora (FR-23) — o soft-delete da 4.3 vale aqui
  também, e é fácil esquecer num `SELECT` sobre `audit_entries`, que **não**
  tem `deleted_at`. **Junte com `tickets` e filtre.**

### References

- [Source: epics.md#Story 4.4]
- [Source: prd.md#12] — SM-1, SM-3, SM-4, SM-5
- [Source: 1-8-*.md] — o Log como fonte, e `veHistorico`
- [Source: 2-2-*.md] — `mudar_status` com o par de/para no Log
- [Source: 4-2-*.md] — Chamado importado: `criado_em` antigo, `abrir_chamado` de hoje
- [Source: 4-3-*.md] — estender o teste de `outputSchema`; garantia estrutural

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Code, loop Ralph)

### Debug Log References

- `scratchpad/mutacoes-44.py` — **14 mutações, 14 reprovadas** (saída em `scratchpad/mutacoes-44.out`)
- `pnpm test` — 973 testes verdes; `typecheck`, `lint` e `arch` limpos
- `src/adapters/persistence/relatorio-de-operacao.test.ts` — 12 testes contra o
  Postgres real

### Completion Notes List

## ⚠️ ENTREGA PARCIAL — e isso é a resposta correta, não uma falha

Esta story pede duas coisas que **não são feitas escrevendo código**: medir o
software contratado e rodar um mês em paralelo. Entreguei o que é entregável e
declarei o resto, com dono.

**O que ESTÁ pronto:**

| Entrega | Onde |
| --- | --- |
| Instrumento de medição (SM-3, SM-4, SM-5-parcial) | tool `relatorio_de_operacao` |
| Checklist de paridade, 13 itens verificáveis | `planning-artifacts/checklist-de-paridade.md` |

**O que NÃO está, e quem faz:**

| Falta | Por quê | Quem |
| --- | --- | --- |
| Baseline do sistema contratado | exige acesso ao software do fornecedor | dono do projeto |
| ~1 mês de operação em paralelo | o tempo precisa passar | dono do projeto |
| Avaliar a checklist | julgamento sobre o mundo real | dono do projeto + Agentes |
| Lista de tipos de Chamado do contratado | nunca foi levantada | dono do projeto |

**O `sprint-status` reflete isso.** Não marquei `done` o que não foi feito.

### O que é medível de dentro, e o que não é

Esta tabela é a entrega intelectual da story — ela separa o que o sistema prova
sozinho do que exige alguém olhando:

| Métrica | Medível aqui? | Por quê |
| --- | --- | --- |
| **SM-3** tempo de resolução **do ServiceDesk** | ✅ | o Log tem `mudar_status` com `de`/`para` e `registrado_em` desde a 2.2 |
| **SM-3** baseline **do contratado** | ❌ | outro sistema, sem acesso |
| **SM-4** % de ações via MCP | ✅ | `audit_entries.origin` distingue `mcp`/`api`/`email` desde a 1.1 |
| **SM-5** Agentes distintos operando | ✅ parcial | conta **quem agiu**; o sistema não sabe quantos Agentes a empresa tem |
| **SM-5** "zero Chamados perdidos fora dele" | ❌ | é sobre o que **não** está aqui — nenhuma consulta interna enxerga |
| **SM-1** paridade funcional | ❌ | julgamento sobre tipos de Chamado do mundo real |

**O item mais perigoso é o "zero Chamados fora dele".** É o mais fácil de marcar
verde sem verificar, e o mais caro se estiver errado — por isso a checklist diz
explicitamente *como* verificá-lo (perguntar a cada Agente **e** conferir se
entraram Chamados novos no contratado).

### As três decisões que moldaram o relatório

**1. Reabertura usa o ÚLTIMO `resolvido`.** A métrica responde "quanto tempo o
Solicitante esperou até o problema **acabar**", e uma reabertura diz que não
tinha acabado. A alternativa recusada — o primeiro — tem um defeito que vale
nomear: **faria o número melhorar quando o atendimento piora.** Numa métrica de
serviço, é o pior defeito possível, porque premia exatamente o que deveria
penalizar. Há mutação cobrindo.

**2. Mediana E média.** O SM-3 pede "tempo médio". Entreguei os dois, e o teste
mostra por quê: quatro Chamados, mediana 3,5h, média acima de 100h — um único
Chamado esquecido move a média sozinho numa fila de 8 Agentes. **A mediana é o
número honesto para comparar com o baseline; a média é o que o SM-3 pediu.**
Entregar só a média sabendo disso seria entregar o número que engana.

O relatório também devolve **quantos Chamados sustentam a média**: uma média de
3 não sustenta decisão de corte de contrato, e quem lê precisa ver isso.

**3. Tudo sai do Log, e não de coluna derivada.** Um `resolvido_em` em `tickets`
seria tentador e seria um segundo lugar guardando o mesmo fato — com chance de
divergir do evento que já existe. E há um cuidado específico da 4.2: Chamado
importado tem `criado_em` do arquivo antigo e `abrir_chamado` do dia do import.
**Misturar as duas fontes faria o tempo de resolução do histórico migrado virar
ficção.** O cálculo inteiro usa o Log.

### Duas armadilhas que o código teve de tratar

**`audit_entries` não tem `deleted_at`** — é append-only desde a 1.7. Um
`SELECT` sobre ele veria o Chamado que a FR-23 tirou da vista de todo mundo, por
isso toda subconsulta que olha Chamado junta com `tickets` e filtra. É o mesmo
vazamento que a 3.1 achou na leitura, agora numa agregação — e tem teste e
mutação próprios.

**Nulo, e não zero, quando não há dado.** Base vazia devolve `medianaHoras:
null`, e "sem ação nenhuma" devolve `percentualMcp: null`. `0` afirmaria coisas
falsas — "resolveu em 0 horas" e "houve atividade e nenhuma passou pelo MCP" —
e o que houve foi silêncio. Duas mutações cobrem.

### Uma decisão de autorização que economizou uma capacidade

O relatório usa **`veHistorico`**, a capacidade que a 1.8 criou, e não uma nova.
A pergunta é a mesma ("pode ver o que aconteceu no sistema?"), e o relatório é
uma agregação do que aquela capacidade já libera. Uma `veRelatorio` nunca
divergiria dela — e a 4.3 registrou exatamente o que isso significa: **separação
que não muda comportamento é mutação que não morre.**

Também não há versão reduzida para o Solicitante: um relatório de operação
filtrado por uma pessoa mediria a fila dela e responderia outra pergunta, com
cara de responder esta.

### As quatro sobreviventes de mutação, e quatro diagnósticos

A 4.3 registrou que sobrevivente não tem um diagnóstico só. Esta story levou a
lição a sério e encontrou **quatro tipos diferentes numa rodada**:

| Sobrevivente | Diagnóstico | Ação |
| --- | --- | --- |
| filtro de período nos autores | **falta teste** — todos os outros só criam ação DENTRO da janela | teste novo |
| `min`→`max` na abertura | **equivalente**: só há um `abrir_chamado` por Chamado, o grupo tem uma linha | remover, com o porquê |
| `JOIN`→`LEFT JOIN` | **equivalente por outra guarda**: o `WHERE r.resolucao >= ab.abertura` já elimina os nulos | remover, com o porquê |
| `veHistorico`→`veChamadoDeTerceiro` | **equivalente**: mesma política hoje; a escolha é semântica | remover, com o porquê |

A do filtro de autores merece nota: o efeito seria o **SM-5 inflado** — quem
agiu há seis meses contaria como "operando no sistema". A métrica erraria **para
o lado otimista**, que é o pior lado possível para um número que decide o corte
de um contrato.

### E uma quinta, que me pegou numa afirmação minha

Ao justificar a remoção da mutação do `LEFT JOIN`, escrevi **no próprio script**
que a mutação que remove o `WHERE r.resolucao >= ab.abertura` "morre". **Ela
sobreviveu na rodada seguinte** — nenhum teste criava dado corrompido.

É a quarta vez que *"afirmação não é teste"* aparece neste projeto, e desta vez
a afirmação estava **no arquivo que existe para verificar afirmações**. A nota
honesta ficou no script, junto com o teste que faltava.

O teste cria uma resolução anterior à abertura (relógio torto, migração mal
feita, `INSERT` manual) e prova que ela fica fora. Sem a guarda, a média viraria
`(4 + -6) / 2 = -1`: **plausível o bastante para alguém decidir com ele, e
negativo o bastante para ninguém olhar.**

### O achado do `claude-review` (PR #83), medido antes de aceitar

A CTE `resolucoes` era a única das seis subconsultas sem filtro de período: ela
agregava sobre `audit_entries` **inteira** a cada chamada. E `audit_entries` é
append-only (FR-22) — nunca encolhe. O custo do relatório crescia com o
**histórico total** em vez de com o período pedido, e pioraria a cada semana do
mês de validação, quando ele mais roda.

**Medido com dois anos de histórico (40 mil resoluções, 1.661 no período):**

| | Buffers | Tempo |
| --- | --- | --- |
| Antes (`Seq Scan`) | 534 | 16,2 ms |
| Depois (`Index Scan`) | 33 | 0,73 ms |

16× menos leitura — e a diferença **cresce** com o histórico, que é o ponto.

Entraram dois índices (migration `0016`): um por `registrado_em` e um **parcial**
por `para = 'resolvido'` composto com `ticket_number`. O parcial é pequeno
porque as resoluções são fração do Log, e responde o `GROUP BY` sem voltar à
tabela.

### A decisão que a correção expôs, e que o achado não mencionava

Se há limite **inferior**, deve haver **superior**? **Não** — e agora tem teste.

Um Chamado aberto dentro do período e resolvido **depois** dele levou um tempo
real, e esse tempo é a resposta de "quanto demorou para resolver o que entrou em
julho?". Cortar no fim do período transformaria esses Chamados em "sem
resolução" e faria a média parecer **melhor do que foi** — exatamente o defeito
da reabertura contada pelo primeiro `resolvido`: **melhorar o número descartando
o caso ruim.**

É a terceira vez nesta story que a mesma armadilha aparece com roupa diferente.
Vale a regra: **numa métrica de decisão, desconfie de toda mudança que melhora o
número.** Ela quase sempre está descartando o caso que mais importa.

### File List

**Novos**
- `src/application/contracts/relatorio-de-operacao.ts`
- `src/application/queries/relatorio-de-operacao.ts`
- `src/adapters/persistence/relatorio-de-operacao.test.ts`
- `_bmad-output/planning-artifacts/checklist-de-paridade.md`
- `drizzle/migrations/0016_indice_do_relatorio.sql`
- `scratchpad/mutacoes-44.py`

**Alterados**
- `src/domain/visibilidade.ts` (`MedidasDaOperacao`, `RelatorioBruto`, `relatorioVisivelPara`)
- `src/domain/errors.ts` (`PeriodoInvalido`)
- `src/application/ports/ticket-repository.ts` (`medirOperacao`)
- `src/adapters/persistence/ticket-repository.ts`
- `src/adapters/mcp/server.ts` (tool `relatorio_de_operacao`)
- `_bmad-output/planning-artifacts/prds/prd-ServiceDesk-2026-08-08/prd.md` (SM-3)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-20 | Story criada. Decidido por recomendação: o relatório sai do Log e não de coluna derivada; reabertura usa o ÚLTIMO tempo (o primeiro faria o número melhorar quando o atendimento piora); nunca-resolvido e cancelado ficam fora do cálculo mas entram na contagem; mediana **e** média; autorização reusa `veHistorico`. Registrado que a story **não é completável por código** — o baseline do contratado e o mês em paralelo são do dono do projeto |
