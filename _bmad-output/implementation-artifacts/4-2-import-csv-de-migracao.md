---
baseline_commit: a2438fb
---

# Story 4.2: Import CSV de migração

Status: review

## Story

As a construtor,
I want importar o histórico do software atual via CSV,
so that o sistema tenha paridade de dados antes do corte.

## Acceptance Criteria

1. **Given** um CSV no formato de entrada definido por esta story
   **When** o import roda
   **Then** cada Chamado recebe um **Número nativo novo** da sequence (AD-4
   intacto) e o número antigo fica em `numero_legado` — **referência, não
   identidade** (FR-25).

2. **Given** linhas inválidas no meio do arquivo
   **When** o import roda
   **Then** elas viram **relatório de erros** e **não abortam o lote** — a linha
   5.000 entra mesmo que a 4.999 tenha falhado.

3. **Given** uma linha do CSV
   **When** ela é importada
   **Then** passa pelo **domínio** (`abrirTicket`, `ehCategoria`, `STATUS`,
   `PRIORIDADES`) — o import não escreve nada que a abertura recusaria.

4. **Given** o mesmo arquivo importado duas vezes
   **When** o segundo import roda
   **Then** ele **não duplica**: linhas com `numero_legado` já existente são
   relatadas como repetidas, não inseridas.

5. **Given** um Chamado importado
   **When** o Log é consultado
   **Then** há registro de abertura com **autor e origem** (AD-3, AD-9) — quem
   executou o import é quem responde por ele.

6. **Given** o histórico disponível no arquivo
   **When** o Chamado é criado
   **Then** a **data de abertura original** é preservada, e o Status vem do
   arquivo — um Chamado que já estava fechado entra fechado.

## Tasks / Subtasks

- [x] **Task 1 — Ler CSV** (AC: #2, #3)
  - [x] `deCsv(texto)` em `platform/csv/csv.ts`, ao lado do `paraCsv`
  - [x] Aspas, aspas escapadas, vírgula e quebra de linha **dentro** do campo
  - [x] Documentar o subconjunto aceito; testar os casos hostis
- [x] **Task 2 — Migration `0013`** (AC: #4)
  - [x] `UNIQUE` parcial em `numero_legado` — o que torna o reimport seguro
  - [x] Asserção contra o catálogo
- [x] **Task 3 — A linha, no domínio** (AC: #1, #3, #6)
  - [x] `linhaImportada` em `domain/importacao.ts`: valida e monta, ou devolve
        o motivo da recusa
  - [x] **Não lança** — o import precisa do motivo para relatar
- [x] **Task 4 — Port, adapter e command** (AC: #1, #2, #4, #5, #6)
  - [x] `importarComAuditoria` — grava com `criado_em` e Status do arquivo
  - [x] Transação **por linha**; violação de unicidade vira "repetida"
- [x] **Task 5 — Contrato e tool** (AC: #2)
  - [x] `importar_csv` com relatório: aceitas, repetidas e rejeitadas com motivo
- [x] **Task 6 — Testes** (AC: #1..#6)
  - [x] **Escreva as sondas ANTES** (lição repetida seis vezes)
  - [x] **Verificar por mutação** — `scratchpad/mutacoes-42.py`
- [x] **Task 7 — Registrar** (AC: —)
  - [x] PRD (FR-25); prompt do loop rearmado no PR `docs:` seguinte

## Dev Notes

### Sem dependência nova: o parser é nosso, e o escopo dele é declarado

Não há biblioteca de CSV no projeto, e **dependência nova exige aprovação** —
parar o loop para pedir custaria mais que o parser vale.

**Decisão (por delegação): `deCsv` próprio, em `platform/csv/csv.ts`**, ao lado
do `paraCsv` que a 4.1 escreveu. Ele aceita o subconjunto RFC 4180 que o
`paraCsv` **produz** — e é isso que fecha o ciclo: **exportar e reimportar tem
de dar o mesmo dado**. Escreva esse teste; ele vale por dez.

O subconjunto: separador vírgula, aspas duplas para campo com `,`/`"`/quebra de
linha, aspas internas dobradas, `\r\n` ou `\n`. **Documente o que ele NÃO
aceita** (separador configurável, encoding que não seja UTF-8) — quando o
arquivo real do fornecedor chegar, a lacuna é a lista.

### Cada linha passa pelo DOMÍNIO — e o domínio aqui NÃO lança

`abrirTicket` valida Título, Descrição e Categoria e **lança** `DomainError`. No
import isso não serve: a AC #2 exige relatório sem abortar o lote, e usar
exceção para controle de fluxo linha a linha transformaria o caso normal
(arquivo com sujeira) em caminho de erro.

**Decisão: `linhaImportada` devolve `{ ok: true, novo }` ou
`{ ok: false, motivo }`** — e usa as mesmas funções do domínio por dentro. O
motivo é texto para o relatório, não código de erro: quem lê é uma pessoa
conferindo a migração.

**Nunca escreva direto no SQL.** Um `INSERT` que pule `abrirTicket` cria Chamado
com Título vazio, Categoria inventada ou Prioridade que a lista fechada não
conhece — e o resto do sistema supõe que isso é impossível.

### O que fazer com cada campo, e o que é decisão

| Campo do CSV | Decisão |
| --- | --- |
| `numero_legado` | **Obrigatório**. É a chave da idempotência; sem ele o reimport duplica |
| `titulo`, `descricao` | Passam por `abrirTicket`; vazio **rejeita a linha** |
| `categoria` | Vazia → `nao_classificado` (o valor que a 1.9 criou para "ninguém avaliou"). **Presente e inválida → rejeita**: inventar categoria é pior que recusar |
| `status` | Validado contra `STATUS`; ausente → `aberto` |
| `prioridade` | Validada contra `PRIORIDADES`; ausente → `media` (`PRIORIDADE_PADRAO`) |
| `solicitante` | E-mail do CSV, **mesmo que não esteja em `users`** — ver abaixo |
| `dono` | Opcional, sem validar contra o cadastro, pelo mesmo motivo |
| `criado_em` | Preservado. Ausente → agora, e **isso vai no relatório** |

**O Solicitante do CSV pode não existir no cadastro, e isso é aceito de
propósito.** O histórico tem Chamado de gente que saiu da empresa; recusar essas
linhas perderia justamente o histórico que a migração existe para trazer. A
consequência é real e precisa estar registrada: esse Chamado **não terá dono
humano capaz de vê-lo** até que a pessoa exista em `users` — o `escopoDeLeitura`
compara `requester` com a identidade autenticada.

**O Status vem do arquivo, e isso pula a máquina de estados (AD-5).** Um Chamado
importado como `fechado` nunca transitou por `aberto → em_andamento →
resolvido`. É deliberado: ele **não aconteceu aqui**, e forçar as transições
inventaria Log de eventos que não ocorreram. O valor é validado contra `STATUS`;
o que não se aplica é a **transição**.

### Idempotência: `UNIQUE` em `numero_legado`, e o reimport é o caso normal

Uma migração real roda, falha no meio, e roda de novo. Hoje `numero_legado` não
tem restrição: o segundo import criaria a base inteira duplicada, com Números
nativos novos — e **não haveria como distinguir** o original da cópia.

**Decisão: índice `UNIQUE` parcial** (`WHERE numero_legado IS NOT NULL`, porque
a coluna é nula para todo Chamado nativo). A garantia é do **banco**, como no
`email_intake` da 1.9 — e pelo mesmo motivo: entre "consultar se já existe" e
"inserir" cabe outra execução.

O import **consulta antes** (para relatar "repetida" sem sujar o log de erro) e
**trata a violação** `23505` como repetida — os dois, porque a consulta resolve
o caso comum e o `UNIQUE` resolve a corrida. `ehViolacaoDeUnicidade` já existe
em `adapters/persistence/ticket-repository.ts` (1.9).

### O autor do Chamado importado é quem RODOU o import

O AD-3 exige autor e origem em toda escrita, e `audit_entries.autor` é
obrigatório. O Chamado veio de um sistema que não tem identidade aqui.

**Decisão: o autor da auditoria é o principal autenticado** — quem executou o
import responde por ele. O `requester` do Chamado é o do CSV (o Solicitante
original), e os dois campos guardam coisas diferentes: **quem trouxe** e **de
quem é**.

Não invente identidade de sistema (`import@servicedesk`): ela não existiria em
`users`, não teria papel, e o Log passaria a ter autor que ninguém pode
responsabilizar — o oposto do AD-9.

### Transação por linha, e o relatório é a saída

Cada linha é uma transação (`criarComAuditoria` já é transacional, AD-3): ou o
Chamado e sua auditoria entram, ou nenhum dos dois. **Não** há transação do lote
— seria "tudo ou nada", que a AC #2 proíbe.

O retorno é o relatório: **aceitas**, **repetidas** e **rejeitadas com motivo e
número da linha**. O número da linha é o que torna o relatório utilizável: sem
ele, quem migra recebe "37 erros" e não sabe onde olhar.

### As sondas — escreva ANTES desta vez

O prompt registra seis ocorrências de mutação sobrevivente por teste escrito
depois. As sondas desta story:

- **a contagem de aceitas** vem do que o command realmente inseriu; um duble que
  ignore a entrada esconde tudo (lição da 3.6);
- **o relatório de rejeitadas** é a única prova de que a validação rodou —
  contar aceitas não distingue "rejeitou" de "não processou";
- **o Número nativo** prova que o AD-4 não foi contornado: se a linha trouxesse
  `numero` e ele fosse usado, os Números do sistema colidiriam.

### Mutações obrigatórias

`scratchpad/mutacoes-42.py`. `biome check --write` antes, e releia o formatado.

| Mutação | Deve reprovar |
| --- | --- |
| Escrever direto, sem passar por `abrirTicket` | AC #3 |
| Aceitar categoria inválida (inventar `nao_classificado`) | AC #3 |
| Abortar o lote na primeira linha ruim | AC #2 |
| Usar o `numero` do CSV como Número nativo | AC #1 |
| Não gravar `numero_legado` | AC #1, #4 |
| Ignorar a checagem de repetida | AC #4 |
| Não preservar `criado_em` | AC #6 |
| Forçar `status: aberto` em tudo | AC #6 |
| Não auditar a criação | AC #5 |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Importar Comentários | o export (4.1) também não os leva; exigiria segundo formato |
| Mapear o CSV real do fornecedor | formato desconhecido (AC do épico); esta story define o **contrato de entrada** |
| Criar Usuário a partir do CSV | cadastro é da 1.3; ver a decisão sobre Solicitante ausente |
| Desfazer um import | não pedido — e `numero_legado` permite achar o que entrou |

### Regressões a não causar

- `abrir_chamado` e `criarComAuditoria` **não mudam**.
- `paraCsv` **não muda** — `deCsv` é função nova no mesmo módulo.
- O `UNIQUE` novo não pode quebrar Chamado nativo: a coluna é nula, e o índice é
  **parcial**.

### References

- [Source: epics.md#Story 4.2]
- [Source: prd.md#FR-25] — preserva Número/histórico quando disponíveis
- [Source: 4-1-export-csv.md] — `paraCsv`, e o ciclo exportar→reimportar
- [Source: 1-9-abrir-chamado-por-e-mail-intake-do-solicitante.md] — `UNIQUE` como garantia, `ehViolacaoDeUnicidade`, `nao_classificado`
- [Source: ARCHITECTURE-SPINE.md#AD-4] — o Número é da sequence, nunca do chamador
- [Source: ARCHITECTURE-SPINE.md#AD-3] — escrita e auditoria na mesma transação

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Code, loop Ralph)

### Debug Log References

- `scratchpad/mutacoes-42.py` — **33 mutações, 33 reprovadas** (saída em `scratchpad/mutacoes-42.out`). **Alvo evaporado nas duas últimas rodadas**, uma vez em cada: `resultado.novo.criadoEm` virou `novo.criadoEm` quando o `for` virou lote, e `criado === null` virou `resultado.value === null` quando `Promise.all` virou `allSettled`. Ambas corrigidas e reexecutadas isoladas. Terceira e quarta vez que isso acontece no projeto; das duas primeiras a causa foi o formatador, destas duas foi a minha própria refatoração — **toda mudança no código é mudança nos alvos**, e o script não avisa alto o bastante: ele imprime a linha e segue
- `pnpm test` — 899 testes verdes; `pnpm typecheck`, `pnpm lint`, `pnpm arch` limpos
- `src/adapters/persistence/import-csv.test.ts` — 16 testes contra o Postgres real
- `src/application/commands/importar-csv.test.ts` — 10 testes do lote paralelo e do caminho de falha, com duble

### Completion Notes List

**A corrida que a redundância escondia — e o teste que precisou ser reescrito.**

A story pedia as duas camadas de idempotência: consulta prévia (para o reimport
não sujar o log do Postgres com um `23505` por linha) **e** o `catch` da
violação (para a corrida). Implementei as duas, e a primeira versão do teste da
corrida disparava oito imports do mesmo `numero_legado` em paralelo. Ele
passava — e a mutação que apagava o `catch` **sobreviveu, 3 execuções de 3**.

O motivo: imports paralelos não produzem a corrida. Eles serializam no índice,
o segundo enxerga o primeiro já comitado e para na consulta prévia. O `catch`
ficava morto, e o teste "de concorrência" media outra coisa. É a sétima
ocorrência do padrão que o prompt do loop registra — **a redundância que
protege também esconde** — e desta vez ela apareceu entre duas camadas que eu
mesmo tinha acabado de escrever.

O teste que substitui abre a janela à mão: uma transação de fora insere o mesmo
`numero_legado` e **fica aberta** enquanto o import passa pela consulta prévia
(que não vê o que não foi comitado); espera-se o `INSERT` do import travar no
índice — conferindo `pg_stat_activity`, não com `sleep` — e só então a
transação de fora comita. Agora a mutação do `catch` reprova 3 de 3.

**Uma mutação está deliberadamente fora do script:** remover a consulta prévia.
Ela não muda nada observável (o `catch` produz o mesmo relatório); o que ela
evita é ruído no log do servidor. Uma mutação assim sobreviveria por **ausência
de efeito**, e sobrevivente desse tipo é sintoma de teste inventado, não de
teste faltando. Fica registrada no cabeçalho do script, com o porquê.

**O achado do `claude-review` (PR #79), e o que ele não viu.** O `for`
sequencial fazia 5 viagens ao Postgres por linha, uma esperando a outra — num
arquivo de 5.000 linhas (o tamanho que a própria AC #2 usa de referência), 25
mil viagens em fila dentro de uma chamada da tool. O achado é real; a correção
são lotes concorrentes de 8 (`LINHAS_POR_LOTE`), conservador porque quem monta
o servidor escolhe o pool, e lote maior que o pool só troca espera pelo banco
por espera por conexão.

O que o comentário **não** menciona é que paralelizar cria dois riscos que o
`for` não tinha, e os dois são invisíveis no teste de integração:

1. **Duas linhas com o mesmo `numero_legado` no mesmo lote** disputam o índice,
   e quem vence passa a depender de qual transação comita primeiro. Quem migra
   espera que a **primeira ocorrência no arquivo** seja a que entra. A
   deduplicação passou a acontecer antes do banco — e a sonda que prova isso é
   a **contagem de chamadas ao repositório**, porque contar aceitas não
   distingue "o banco recusou a segunda" de "a segunda nunca foi enviada".
2. **A ordem do relatório.** Aqui a primeira mutação que escrevi
   (`porLinha` removido) **sobreviveu**: `Promise.all` preserva a ordem do
   array e os lotes são sequenciais, então quase tudo já sai ordenado. Quase:
   `repetidas` é preenchida em **duas fases** — duplicata interna na leitura,
   repetida de banco depois do lote —, e sem ordenar uma repetida da linha 5
   aparece antes de uma da linha 2. O teste foi reescrito para esse caso, que é
   o único em que a ordem quebra de verdade. Sem ele, a ordenação seria código
   não exercitado, que este projeto já registrou (em `transicoes.ts`) como
   sintoma de guarda que não guarda nada.

**O segundo achado do `claude-review`, e o pior deles: eu tinha escrito no
código uma garantia que o código não dava.** O comentário do lote dizia "nenhuma
rejeição escapa". `Promise.all` rejeita na primeira falha — então um timeout na
linha 2.003 derrubava `importarCsv` inteiro: os lotes seguintes nunca rodavam, e
quem migra recebia um erro de protocolo **sem relatório nenhum**, sem saber
quantas linhas entraram nem onde retomar. Exatamente o "tudo ou nada" que a
AC #2 proíbe, pela porta dos fundos que eu mesmo tinha acabado de abrir ao
paralelizar. Pior: `all` não cancela as irmãs, então chamadas em voo podiam
**comitar depois do erro** — Chamado gravado e auditado que não aparece em
relatório algum.

É a segunda vez no projeto que uma afirmação minha em prosa passou por
verificação: na 3.6 foi o Dev Agent Record dizendo que o contrato recusava o que
ele não recusava. **Afirmação não é teste** — e desta vez a afirmação estava no
comentário, ao lado do código que a contradizia.

Corrigido com `Promise.allSettled` e uma categoria nova no relatório: `falhas`,
separada de `rejeitadas` **porque a ação que cada uma pede é diferente** —
rejeitada quer dizer "o dado está errado, corrija o CSV"; falha quer dizer "a
linha está boa, o banco é que não gravou, rode de novo". E retomar é literalmente
rodar o mesmo arquivo, porque o reimport não duplica.

**A autorização que a story não pedia.** Nenhuma AC mencionava quem pode
importar, e o command nasceu sem checagem. Importar é a **única escrita do
sistema em que o autor e o dono do registro são pessoas diferentes de
propósito** — o `requester` vem do arquivo. Sem uma capacidade própria, um
Solicitante montaria um CSV e abriria Chamados no nome de quem quisesse, com
uma tool só, e o Log registraria corretamente que foi ele quem trouxe — o que
não desfaz nada. Capacidade `importa` (só Agente) em `papeis.ts`, checada no
domínio (AD-8) para o adapter HTTP herdar a regra.

**O que ficou diferente da story, e por quê.** As Dev Notes diziam "cada linha
passa por `abrirTicket`". `linhaImportada` usa as mesmas funções do domínio
(`ehCategoria`, `STATUS`, `PRIORIDADES`, `PRIORIDADE_PADRAO`) mas **não** chama
`abrirTicket`: ele lança, monta um Chamado sempre `aberto` e sempre com
`criado_em` de agora — as três coisas que a AC #6 proíbe aqui. A regra que a
nota queria (o import não escreve nada que a abertura recusaria) está mantida;
o caminho é outro.

**O relatório tem um quarto número que a story não pediu:** `semDataOriginal`.
Linha sem `criado_em` entra com a data de hoje — não é erro, mas é a única
diferença entre "importei o histórico" e "importei o histórico com o começo
apagado", e quem migra precisa vê-la antes de desligar o sistema antigo.

**O ciclo fecha:** há um teste que exporta (4.1), trunca a base, reimporta e
compara. O que muda de propósito é o Número — porque o antigo é referência.

**O que esta story NÃO resolve, e não podia:** o formato real do fornecedor
continua desconhecido (é a suposição aberta do PRD desde o planejamento). O que
existe agora é o **contrato de entrada** — `COLUNAS_DO_IMPORT`, iguais às que o
export produz. Quando o arquivo real chegar, a lacuna é a diferença entre as
duas listas, e o trabalho é um mapeador, não um import novo.

### File List

**Novos**
- `src/application/contracts/importar-csv.ts`
- `src/application/commands/importar-csv.ts`
- `src/domain/importacao.ts`
- `src/domain/importacao.test.ts`
- `src/adapters/persistence/import-csv.test.ts`
- `src/application/commands/importar-csv.test.ts`
- `drizzle/migrations/0013_import.sql`
- `scratchpad/mutacoes-42.py`

**Alterados**
- `src/platform/csv/csv.ts` (+ `deCsv`) e `src/platform/csv/csv.test.ts`
- `src/domain/papeis.ts` (capacidade `importa`)
- `src/application/ports/ticket-repository.ts` (`importarComAuditoria`)
- `src/adapters/persistence/ticket-repository.ts`
- `src/adapters/mcp/server.ts` e `src/adapters/mcp/server.test.ts` (tool `importar_csv`)
- `_bmad-output/planning-artifacts/prds/prd-ServiceDesk-2026-08-08/prd.md` (FR-25)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-19 | Implementada: `deCsv`, `linhaImportada`, `importarComAuditoria`, tool `importar_csv`, capacidade `importa`, migration 0013; 25/25 mutações reprovadas; FR-25 registrado no PRD |
| 2026-08-19 | Story criada; decidido por delegação: parser próprio (sem dependência nova), `linhaImportada` que devolve motivo em vez de lançar, `UNIQUE` parcial em `numero_legado` para o reimport ser seguro, autor da auditoria é quem rodou o import, Solicitante ausente do cadastro é aceito, e o Status do arquivo pula a máquina de estados |
