---
baseline_commit: c71dd69
---

# Story 3.6: MCP Resources e Prompt de triagem

Status: review

## Story

As a Agente operando via IA,
I want Resources "chamado"/"fila" e um Prompt "triagem de chamado",
so that a IA tenha contexto barato e um fluxo de triagem pronto.

## Acceptance Criteria

1. **Given** o servidor MCP
   **When** a IA lê o Resource `chamado`
   **Then** retorna **o mesmo conteúdo** de `ver_chamado`, respeitando a
   autorização (FR-16, AD-8).

2. **Given** o Resource `fila`
   **When** a IA o lê
   **Then** retorna a Fila como `buscar_chamados` a devolveria, com o mesmo
   escopo e os mesmos limites.

3. **Given** um Solicitante e um Chamado alheio
   **When** ele lê o Resource daquele Chamado
   **Then** recebe o **mesmo** erro de "não encontrado" que `ver_chamado` daria
   — o Resource não é uma segunda porta com regras próprias.

4. **Given** qualquer leitura de Resource
   **When** ela acontece
   **Then** passa por **autenticação e rate limit**, como as tools (FR-21).

5. **Given** o Prompt "triagem de chamado"
   **When** a IA o invoca
   **Then** recebe um template utilizável, que **usa as tools existentes** e
   não inventa capacidade que o servidor não tem.

## Tasks / Subtasks

- [x] **Task 1 — O esqueleto de Resource** (AC: #3, #4)
  - [x] `criarLeitor` em `adapters/mcp/server.ts`: autenticar → limitar →
        executar, no molde de `criarHandler`
  - [x] Erro de domínio propaga (o protocolo o traduz), sem `isError`
- [x] **Task 2 — Resource `chamado`** (AC: #1, #3)
  - [x] `ResourceTemplate` com `chamado://{numero}`
  - [x] **Reusa `verChamado`** — nenhuma leitura nova
- [x] **Task 3 — Resource `fila`** (AC: #2)
  - [x] URI fixa `fila://atual`, reusando `buscarChamados` com os defaults
- [x] **Task 4 — Prompt de triagem** (AC: #5)
  - [x] `registerPrompt` com argumento `numero`
  - [x] O texto cita as tools que existem, com os nomes exatos
- [x] **Task 5 — Testes** (AC: #1..#5)
  - [x] Duas identidades; o mesmo Chamado por tool e por Resource
  - [x] **Verificar por mutação** — `scratchpad/mutacoes-36.py`
- [x] **Task 6 — Registrar e FECHAR O ÉPICO** (AC: —)
  - [x] PRD (FR-16)
  - [ ] `epic-3: done`, `RESUME.md` e prompt do loop (PR `docs:` separado)

## Dev Notes

### A regra que organiza a story inteira: Resource não é porta nova

O risco desta story é escrever uma **segunda leitura** — um `SELECT` próprio, um
filtro próprio, um erro próprio — e com ela uma segunda chance de vazar. O AD-8
inteiro do épico foi construído para que a autorização não pudesse divergir
entre pontos de entrada.

**Decisão (por delegação): os Resources são casca.** `chamado` chama
`verChamado`; `fila` chama `buscarChamados`. Nenhuma query nova, nenhum
`escopoDeLeitura` novo, nenhuma tradução nova de erro.

**O teste que fixa isso:** ler o Resource e chamar a tool, para a mesma pessoa e
o mesmo Chamado, e comparar — **o conteúdo tem de ser igual**. Se um dia
alguém "otimizar" o Resource com uma consulta própria, esse teste reprova.

### Autenticação e rate limit valem para Resource (AC #4)

`criarHandler` (2.3) faz `autenticar → limitar → executar → traduzir erro`, e
**a mesma ordem vale aqui** pelas mesmas razões: sem autenticar não há
identidade para o `escopoDeLeitura`, e sem limitar antes de executar o limite
não serve para nada numa IA em loop.

A diferença é o **erro**: tool devolve `isError: true` com texto; Resource não
tem esse envelope, e o protocolo espera que a leitura **lance**. Então
`criarLeitor` é `criarHandler` **sem** o `catch` que traduz — o `DomainError`
sobe e o SDK o transforma em erro de protocolo.

Registre isso: é a única divergência deliberada entre os dois esqueletos, e ela
existe porque o **protocolo** difere, não porque a regra difere.

### O que cada Resource devolve

- **`chamado://{numero}`** — `ResourceTemplate`, porque o Número é variável.
  Conteúdo: o JSON de `ver_chamado`.
- **`fila://atual`** — URI fixa. Conteúdo: o JSON de `buscar_chamados` com os
  **defaults** (limite 20, ordem por data). Sem parâmetros: Resource é contexto
  barato, e quem quer recortar tem a tool.

`mimeType: 'application/json'` nos dois: o consumidor é uma IA, e JSON é o que
ela já sabe ler — texto formatado exigiria dela um parser que o contrato Zod já
resolve.

### O Prompt precisa citar tools que EXISTEM

Um Prompt de triagem que mande "classifique a urgência e defina o SLA" ensina a
IA a tentar algo que o servidor não faz — e a Story 2.4 registrou que **não há
SLA**. O template deve usar os nomes exatos das tools de hoje:
`ver_chamado`, `mudar_prioridade`, `atribuir_chamado`, `comentar_chamado`,
`mudar_status`.

E deve lembrar duas regras que a IA erra sozinha:

- **a `versao` vem de `ver_chamado`** e é obrigatória em toda mutação (AD-10);
- **fechar/cancelar/reabrir exigem confirmação** em duas fases (AD-7, 2.6) — o
  Prompt de triagem **não** deve encaminhar para elas.

### Use o que já existe

| Use | Onde |
| --- | --- |
| `verChamado` | `application/queries/ver-chamado.ts` |
| `buscarChamados` | `application/queries/buscar-chamados.ts` |
| `criarHandler` | `adapters/mcp/server.ts` — o molde do `criarLeitor` |
| `ResourceTemplate` | `@modelcontextprotocol/server` |

**Não** crie contrato Zod novo: a saída dos Resources é a saída das queries que
eles chamam.

### Testes

| Garantia | Onde |
| --- | --- |
| Resource == tool, mesmo conteúdo (AC #1, #2) | teste do adapter, comparando os dois |
| Chamado alheio dá o mesmo erro (AC #3) | teste do adapter, duas identidades |
| Autentica e limita (AC #4) | teste do adapter, com dubles que contam chamadas |
| O Prompt cita tools existentes (AC #5) | teste que cruza o texto com as tools registradas |

O teste do Prompt merece atenção: cruzar o texto com a **lista real de tools do
servidor** é o que impede o template de envelhecer sozinho quando uma tool for
renomeada.

### Mutações obrigatórias

| Mutação | Deve reprovar |
| --- | --- |
| O Resource `chamado` não passa por `verChamado` (query própria) | AC #1 |
| O Resource não autentica | AC #4 |
| O Resource não chama `limitarChamadas` | AC #4 |
| O Resource `fila` ignora o escopo de quem lê | AC #2 |
| O Prompt cita uma tool que não existe | AC #5 |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Resource de histórico ou de resumo | não pedido pela FR-16 |
| Parâmetros no Resource `fila` | a tool já recorta |
| Prompt para ações irreversíveis | AD-7 exige confirmação, e Prompt não confirma |
| `subscribe` / notificação de mudança | não pedido |

### Fim do épico (Task 6)

Esta é a **última** story do Epic 3. Depois do merge: `epic-3: done`,
`RESUME.md` atualizado, prompt do loop com o aviso de épico encerrado e o que o
**Epic 4** (portabilidade e migração) exige de diferente — e então
`/ralph-loop:cancel-ralph`.

### References

- [Source: epics.md#Story 3.6]
- [Source: prd.md#FR-16] — Resource "chamado" retorna o mesmo de `ver_chamado`
- [Source: 1-2-ver-um-chamado-via-mcp.md] — a leitura que o Resource reusa
- [Source: 2-3-atribuir-dono-self-assign.md] — `criarHandler` e a ordem das três linhas
- [Source: ARCHITECTURE-SPINE.md#AD-8], [AD-6]

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A story mais curta do épico, e o motivo é o desenho das anteriores.** Os
Resources são casca: `chamado` chama `verChamado`, `fila` chama
`buscarChamados`. Nenhuma query, nenhum `escopoDeLeitura`, nenhuma tradução de
erro nova — e por isso a autorização não teve como divergir. Produção: **~50
linhas**, contando o Prompt.

**O teste que dá sentido à story compara Resource com tool.** Ler
`chamado://1042` e chamar `ver_chamado(1042)`, para a mesma pessoa, tem de
devolver o mesmo objeto. Se alguém "otimizar" o Resource com consulta própria,
ele reprova — que é exatamente o cenário que o Epic 3 inteiro existe para
impedir.

**A única divergência entre `criarLeitor` e `criarHandler` é o erro**, e ela é
do **protocolo**: tool devolve `isError: true` no envelope, leitura de Resource
não tem envelope e o SDK espera que ela lance. O teste afirma os dois lados — a
tool com `isError`, o Resource com `DomainError` do mesmo código.

**Uma mutação sobreviveu, e a causa foi o duble, não o código.** "O Resource de
Fila ignora os defaults" passou porque meu duble devolvia a mesma lista
independentemente de `limite`/`ordem` — comparar Resource com tool não distingue
nada quando o repositório ignora os parâmetros. Quem a pegou foi a asserção
sobre **o que o Resource pediu**. É o mesmo padrão da 3.1 e da 3.5, e o quinto
lembrete de que **duble que ignora entrada esconde mutação**.

**O Prompt tem um teste que o mantém vivo:** ele extrai os nomes de tool citados
no texto e confirma, um a um, que o servidor os registra. Sem isso, renomear uma
tool deixaria o template mentindo em silêncio.

| Mutação aplicada | Reprovou |
| --- | --- |
| O Resource não autentica | 3 testes |
| O Resource não chama `limitarChamadas` | 2 testes |
| O Resource de Fila ignora os defaults | 1 teste |
| O Prompt cita uma tool que não existe | 1 teste |
| O Prompt esquece a regra da versão | 1 teste |
| O Prompt encaminha para ação irreversível | 1 teste |

### Completion Notes List

- **Task 1** — `criarLeitor`, no molde de `criarHandler`, sem o `catch`.
- **Task 2/3** — `chamado://{numero}` (`ResourceTemplate`) e `fila://atual`,
  ambos casca sobre as queries.
- **Task 4** — `triagem_de_chamado`, com `TEXTO_DA_TRIAGEM` exportado para o
  teste cruzar com a lista real de tools.
- **Task 5** — **798 testes** (eram 785), cobertura **97,74%**; 6 mutações, 6
  reprovações.
- **Task 6** — FR-16 no PRD; o fechamento do épico vai no PR `docs:`.

**Não provado — registrado em vez de deixado implícito:**

1. **Nada foi exercitado por um cliente MCP real.** Os handlers e leitores são
   testados diretamente, sem transporte — o SDK não expõe os callbacks
   registrados. Se `registerResource` mudar de contrato, os testes continuam
   verdes. É a mesma dívida desde a 1.1, agora com Resources e Prompt.
2. **O Prompt não é executado por ninguém nos testes** — verifica-se o texto,
   não o efeito. Se a IA seguir o roteiro e ele estiver errado, nada aqui
   reprova.
3. **`fila://atual` não tem `list`** (`{ list: undefined }` no template do
   Chamado): o servidor não enumera Chamados como recursos. Enumerar exigiria
   decidir o escopo da listagem — que é a mesma pergunta do AD-8, e não foi
   pedida.
4. **Sem `subscribe`**: mudança em Chamado não notifica quem leu o Resource.
5. **O `numero` do Resource vem da URI como texto** e é convertido com
   `Number()`. URI malformada (`chamado://abc`) vira `NaN` e o contrato Zod
   recusa — mas a mensagem que chega é a do schema, não uma explicação sobre a
   URI.

### File List

- `src/adapters/mcp/server.ts` (modificado — `criarLeitor`, dois Resources, o Prompt)
- `src/adapters/mcp/resources.test.ts` (novo)
- `scratchpad/mutacoes-36.py` (novo)
- `prd.md` (FR-16)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-19 | Story criada; decidido por delegação que os Resources são casca sobre as queries, que `criarLeitor` difere de `criarHandler` só no erro, e que o Prompt cruza com a lista real de tools |
| 2026-08-19 | Tasks 1–4: `criarLeitor`, Resources `chamado` e `fila`, Prompt de triagem |
| 2026-08-19 | Task 5: 798 testes; 6 mutações, 6 reprovações — uma só depois de o duble parar de ignorar os parâmetros |
| 2026-08-19 | Task 6: FR-16 registrado no PRD |
