---
baseline_commit: ffd19af
---

# Story 4.1: Export CSV

Status: in-progress

## Story

As a Agente/Gestor,
I want exportar Chamados em CSV,
so that os dados sejam da empresa e sem lock-in.

## Acceptance Criteria

1. **Given** a Fila com filtros aplicados
   **When** o usuário exporta
   **Then** o CSV cobre **os Chamados dos filtros aplicados** (FR-24), com os
   campos do Chamado — Número, Título, Descrição, Categoria, Status,
   Prioridade, Solicitante, Dono, data e `numero_legado`.

2. **Given** um Solicitante
   **When** ele exporta
   **Then** o arquivo contém **apenas os Chamados dele** — um CSV é a forma mais
   fácil de vazar tudo, e depois de gerado não há gargalo que o corrija.

3. **Given** um campo com vírgula, aspas ou quebra de linha
   **When** o CSV é gerado
   **Then** ele é escapado (RFC 4180), e o arquivo abre com as colunas certas.

4. **Given** um campo que começa com `=`, `+`, `-` ou `@`
   **When** o CSV é aberto no Excel ou no Sheets
   **Then** ele **não é interpretado como fórmula** — o Título é entrada de
   usuário, e sem isso vira execução na máquina de quem abre o arquivo.

5. **Given** um volume maior que o limite
   **When** o export roda
   **Then** ele diz que **há mais** e permite continuar por deslocamento, sem
   truncar em silêncio.

6. **Given** Chamados excluídos
   **When** o export roda
   **Then** eles ficam de fora, como em toda leitura (FR-23).

## Tasks / Subtasks

- [ ] **Task 1 — O CSV seguro, em `platform`** (AC: #3, #4)
  - [ ] `paraCsv(colunas, linhas)` em `platform/csv/csv.ts`
  - [ ] Escape RFC 4180 **e** neutralização de fórmula
  - [ ] Teste com os casos hostis, incluindo `=cmd|...`
- [ ] **Task 2 — A leitura para export** (AC: #1, #2, #6)
  - [ ] `buscarParaExportarBruto` no port — campos completos, não o resumo
  - [ ] `visiveisPara` genérico no domínio, e `filaVisivelPara` passa a usá-lo
- [ ] **Task 3 — Contrato, query e tool** (AC: #1, #5)
  - [ ] `contracts/exportar-csv.ts` com limite **próprio**
  - [ ] `exportar_csv` **usando** `criarHandler`
- [ ] **Task 4 — Testes** (AC: #1..#6)
  - [ ] Duas identidades; casos hostis de CSV; paginação
  - [ ] **Verificar por mutação** — `scratchpad/mutacoes-41.py`
- [ ] **Task 5 — Registrar** (AC: —)
  - [ ] PRD (FR-24) e prompt do loop (PR `docs:` separado)

## Dev Notes

### O teto de 100 da Fila não serve aqui — e o motivo é o consumidor

`LIMITE_MAXIMO = 100` (3.1) existe para não estourar o contexto da IA numa
leitura de trabalho. Um export de 100 linhas não migra nada e não prova
independência de fornecedor.

**Decisão (por delegação): tool própria, com limite próprio.** `exportar_csv`
tem `limite` padrão **1.000** e teto **5.000**, com `deslocamento` e `temMais` —
a mesma mecânica da 3.1, com outros números e a mesma recusa (teto no schema,
nunca truncamento silencioso).

**E há um `cabecalho: boolean` (padrão `true`)**, que existe por um motivo
prático: quem pagina precisa juntar os pedaços, e um cabeçalho repetido no meio
do arquivo o corrompe. Com o campo, a segunda página em diante vem sem ele.

**Registre o limite real, que não é técnico:** o retorno da tool vai para o
**contexto da IA**. Cinco mil linhas com Descrição são centenas de KB, e nenhuma
IA lê isso com proveito — ela repassa. Um export de base inteira pede um canal
que **não existe** (arquivo, download, storage), e ele depende da topologia de
deploy, que segue `Deferred`. **Diga isso no Dev Agent Record**; não invente o
canal aqui.

### CSV é formato hostil, e isto é segurança

**a) Escape (RFC 4180).** Campo com `,`, `"` ou quebra de linha vai entre aspas,
e aspas internas viram `""`. Sem isso, a Descrição de um Chamado desloca as
colunas e o arquivo inteiro mente.

**b) Fórmula (CSV injection).** Um campo que começa com `=`, `+`, `-`, `@`, tab
ou CR é interpretado como **fórmula** pelo Excel e pelo Sheets. Um Título como
`=cmd|' /C calc'!A0` vira execução na máquina de quem abre.

E repare de onde vem o Título: **do Solicitante**. É entrada de usuário indo
para um executor — a mesma classe de problema do XSS, com planilha no lugar do
navegador.

**Decisão (por delegação): prefixar o campo perigoso com apóstrofo (`'`)**, que
é a recomendação do OWASP. Isso **altera o dado** — e a alternativa (deixar
passar) troca fidelidade por execução de código na máquina de terceiros.
Registre a alteração; não a esconda.

**c) BOM: não.** O BOM UTF-8 ajuda o Excel a abrir acento corretamente **num
arquivo salvo**; aqui o CSV volta como **texto** na resposta da tool, e o BOM
apareceria como lixo no começo. Se um dia existir download, o BOM entra lá.

O módulo vive em `platform/csv/`, e não no domínio: CSV é **formato**, não
regra de negócio. Mas o **teste** é de segurança, não de formatação.

### O export lê CAMPOS do Chamado, não a thread

A linha da Fila (3.1) é resumo de propósito — sem Descrição. O export precisa da
Descrição: é ela que carrega o problema relatado, e um backup sem ela não é
backup.

**Comentários ficam FORA**, e é decisão registrada: uma thread não cabe numa
linha de CSV, e representá-la exigiria um segundo arquivo (uma linha por
Comentário) — onde o recorte de **Comentário Interno** voltaria a ser
obrigatório, como na busca (3.4). Isso é escopo de outra story, se alguém pedir.

Consequência: **este export não é migração completa**; é o dado do Chamado.
Diga isso no PRD.

### A autorização é a mesma do Epic 3 — e aqui ela não tem segunda chance

`escopoDeLeitura` decide, o adapter traduz, o domínio reaplica. **A diferença é
o que acontece se falhar:** na Fila, um vazamento aparece numa tela e some; num
CSV, ele vira arquivo — e arquivo é encaminhado.

Reuse o gargalo: **generalize** `filaVisivelPara` em vez de escrever um segundo.
`podeVerTicket` já aceita a forma mínima `{ requester, excluidoEm }` (alargada
na 3.1), então uma função `visiveisPara<T extends Identificavel>` serve para os
dois — e `filaVisivelPara` passa a usá-la. **Uma regra, um lugar.**

### Testes

| Garantia | Onde |
| --- | --- |
| Escape e fórmula (AC #3, #4) | `platform/csv` — função pura, casos hostis |
| Escopo (AC #2) | integração, **duas identidades** |
| Filtros cobertos (AC #1) | integração |
| Excluídos fora (AC #6) | integração |
| Paginação e `temMais` (AC #5) | integração |
| Teto do limite | contrato Zod |

**Escreva desde o início o teste que chama o repositório direto** (a 3.5 custou
uma rodada por não fazer isso): o gargalo do domínio mascara erro no `WHERE`.

### Mutações obrigatórias

`scratchpad/mutacoes-41.py`. `biome check --write` antes, e **releia o arquivo
formatado** ao escrever o alvo.

| Mutação | Deve reprovar |
| --- | --- |
| Não escapar aspas/vírgula | AC #3 |
| **Não neutralizar fórmula** | AC #4 |
| Ignorar o escopo na consulta de export | AC #2 |
| Incluir excluídos | AC #6 |
| Ignorar os filtros | AC #1 |
| `temMais` sempre `false` | AC #5 |
| Teto do limite maior | contrato |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Exportar Comentários | ver acima; exigiria segundo formato |
| Download de arquivo / storage | depende da topologia (`Deferred`) |
| Import | Story 4.2 |
| Export de Log de auditoria | não pedido |

### Regressões a não causar

- `buscar_chamados` **não muda** — nem contrato, nem limites.
- `filaVisivelPara` muda por dentro (passa a usar `visiveisPara`) mas **não** de
  comportamento: os testes da 3.1 têm de passar sem edição.

### References

- [Source: epics.md#Story 4.1]
- [Source: prd.md#FR-24] — export cobre filtros aplicados, evita lock-in
- [Source: 3-1-filtrar-a-fila.md] — escopo, gargalo, limite e `temMais`
- [Source: 1-7-soft-delete-base.md] — excluído fora de toda leitura
- [Source: ARCHITECTURE-SPINE.md#AD-8]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Data | Evento |
|---|---|
| 2026-08-19 | Story criada; decidido por delegação que o export tem tool e limites próprios, que o campo perigoso é prefixado com apóstrofo (alterando o dado, com o porquê registrado), que Comentários ficam fora e que o gargalo é generalizado em vez de duplicado |
