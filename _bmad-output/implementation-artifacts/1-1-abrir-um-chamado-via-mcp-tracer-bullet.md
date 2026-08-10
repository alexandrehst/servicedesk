---
baseline_commit: 69bf96658af741e5d45143c48303fbfe7074f7b9
---

# Story 1.1: Abrir um Chamado via MCP (tracer bullet)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Agente operando via IA,
I want abrir um Chamado chamando a tool `abrir_chamado` com título, descrição e categoria,
so that o problema fique registrado e rastreável desde o primeiro minuto.

## Acceptance Criteria

1. **Given** o servidor MCP no ar e o esqueleto hexagonal (`domain`/`application`/`adapters`)
   **When** a IA chama `abrir_chamado(titulo, descricao, categoria)` com dados válidos
   **Then** um Chamado é criado com Número sequencial legível vindo de uma **sequence do Postgres** (AD-4)
   **And** o Chamado nasce com Status `aberto` e sem Dono, e a tool retorna o Número.

2. **Given** a mesma criação
   **When** o command handler persiste o Chamado
   **Then** grava, **na mesma transação**, um registro de Log de auditoria com autor e `origin=mcp` (AD-3)
   **And** nenhum adapter escreve no banco direto — a mutação passa só pelo domínio (AD-2).

3. **Given** um input inválido (título vazio ou categoria fora da lista fixa)
   **When** a tool é chamada
   **Then** o domínio rejeita com **erro tipado** e **nada é persistido**.

4. **Given** a transação de criação
   **When** a gravação da auditoria falha
   **Then** o Chamado **também não** é persistido — atomicidade real, provada por teste que força a falha.
   *(AD-3 diz "mesma transação". Sem este teste, "mesma transação" é intenção, não garantia.)*

5. **Given** o gateway do Epic 0
   **When** o PR desta story roda no CI
   **Then** todos os nove required checks passam
   **And** a cobertura reportada ao SonarCloud é **> 0%** — primeira verificação real do caminho `lcov → Sonar` (pendência da Story 0.7).

## Tasks / Subtasks

- [x] **Task 1 — Infraestrutura de banco** (AC: #1)
  - [x] `compose.yaml` com PostgreSQL **18** (a spine fixa 18; o Homebrew local tem 14 — não usar)
  - [x] `services: postgres:18` no job `test` do CI
  - [x] `.env.example` com `DATABASE_URL`; `.env` já está no `.gitignore`
  - [x] Documentar no README como subir (o Docker Desktop precisa estar aberto)

- [x] **Task 2 — Domínio puro** (AC: #1, #3)
  - [x] `src/domain/ticket.ts`: tipo `Ticket`, `Status` como união fechada (AD-5, só `aberto` nesta story), `Category` como união fechada
  - [x] `src/domain/errors.ts`: erros tipados (`TituloObrigatorio`, `CategoriaInvalida`) — o shape do erro **nasce no domínio** (Consistency Conventions)
  - [x] Função pura de criação que **valida e rejeita**, sem tocar em I/O
  - [x] **Zero imports** de `application`, `adapters` ou `platform` — o `arch` reprova

- [x] **Task 3 — Contratos Zod** (AC: #1, #3)
  - [x] `src/application/contracts/abrir-chamado.ts` com schema de input e output em **Zod 4.4**
  - [x] Fonte **única**: o adapter MCP deriva daqui, não redefine (AD-6)

- [x] **Task 4 — Ports** (AC: #2)
  - [x] `src/application/ports/ticket-repository.ts` — interface com `criar(...)` recebendo o principal
  - [x] A interface **inclui a auditoria na mesma operação**, para que a atomicidade não dependa de disciplina de quem implementa

- [x] **Task 5 — Command handler** (AC: #1, #2, #3)
  - [x] `src/application/commands/abrir-chamado.ts`
  - [x] Recebe `Principal { identity, role, origin }` (AD-8, AD-9)
  - [x] Invoca o domínio para validar, delega persistência ao port
  - [x] **Não** importa de `adapters` — o `arch` reprova

- [x] **Task 6 — Adapter de persistência** (AC: #1, #2, #4)
  - [x] `drizzle/schema.ts`: tabelas `tickets` e `audit_entries`
  - [x] **Número por sequence do Postgres**, `DEFAULT nextval(...)` — nunca gerado em código (AD-4)
  - [x] Migration versionada em `drizzle/`
  - [x] `src/adapters/persistence/ticket-repository.ts` implementa o port **dentro de uma transação** que cobre ticket + auditoria

- [x] **Task 7 — Adapter MCP** (AC: #1, #3)
  - [x] `src/adapters/mcp/server.ts` com `@modelcontextprotocol/server@2.0.0`, transporte **stdio** (a spine adia HTTP)
  - [x] Tool `abrir_chamado` derivando validação dos contratos Zod da Task 3
  - [x] Mapeia erro de domínio → erro de tool (o shape vem do domínio)
  - [x] Carimba `origin: 'mcp'` no principal

- [x] **Task 8 — Testes** (AC: #1–#5)
  - [x] Unidade: domínio (validação, erros tipados) — sem I/O
  - [x] Unidade: command handler com port fake
  - [x] **Integração com Postgres real**: número sequencial, status inicial, auditoria com autor e origem
  - [x] **Teste de atomicidade** (AC #4): forçar falha na auditoria e verificar que o ticket **não** existe
  - [x] Cobertura ≥80% — o gate reprova abaixo disso

## Dev Notes

### Por que esta story é diferente

É o **tracer bullet**: atravessa todas as camadas com a fatia mais fina possível. O que for estabelecido aqui — nomes, formato de erro, jeito de testar, forma da transação — **será copiado por 31 stories**. Um atalho aqui vira dívida multiplicada por 31.

É também onde três pendências do Epic 0 se resolvem:

| Pendência | Origem |
|---|---|
| Cobertura real no SonarCloud (hoje 0%, sem código) | Story 0.7, AC #1 |
| Regras `no-circular` e `no-cross-adapter` nunca exercitadas | Story 0.4 |
| Reteste do review por IA com código real | Story 0.6, AC #3 |

### Stack verificada no npm (2026-08-10)

| Pacote | Versão | Nota |
|---|---|---|
| `@modelcontextprotocol/server` | **2.0.0** | A spine estava certa: o pacote existe, ao lado de `/core` e `/node`. Traz `zod ^4.2.0` e `@modelcontextprotocol/core@2.0.0`. Export `./stdio` |
| `zod` | **4.4.3** | Compatível com o peer do MCP |
| `drizzle-orm` | **0.45.2** | Conforme a spine |
| `postgres` (driver) | **3.4.9** | Driver do Drizzle para Postgres |
| PostgreSQL | **18** | Via Docker. **O Homebrew local tem 14 — não usar**, criaria divergência silenciosa com o CI |

### ⚠️ Decisão de infraestrutura (tomada nesta story)

A spine deixou "topologia de deploy" em *Deferred*. Para os testes, **decido**: Docker Compose com Postgres 18 local + `services:` no CI.

Alternativas descartadas:
- **Postgres 14 do Homebrew** — divergiria da spine e do CI; sequences e tipos podem se comportar diferente entre majors.
- **Banco em memória / mock** — a AC #1 exige sequence **do Postgres** (AD-4) e a AC #4 exige transação real. Mock provaria nada.

**Isto não decide deploy de produção**, que segue em *Deferred*.

### Os ADs que esta story materializa

| AD | O que exige aqui |
|---|---|
| **AD-1** | `domain` sem imports para fora; `application` sem imports de `adapters`. O job `arch` reprova |
| **AD-2** | Nenhum adapter escreve no banco direto; toda mutação passa pelo command handler |
| **AD-3** | Ticket + auditoria **na mesma transação**, com autor e origem |
| **AD-4** | Número vem de sequence do Postgres, atribuído no insert, **imutável** |
| **AD-5** | `Status` é união fechada no domínio (só `aberto` por ora) |
| **AD-6** | Schemas Zod em `application/contracts/`; o MCP **deriva**, não redefine |
| **AD-8/AD-9** | Todo caso de uso recebe `Principal { identity, role, origin }`; a **identidade do token** é o autor gravado — nunca o nome da tool |

### Glossário PT → código EN (Consistency Conventions)

`Chamado`→`Ticket` · `Número`→`number` · `Status`→`status` · `Dono`→`assignee` · `Solicitante`→`requester` · `Categoria`→`category` · `Prioridade`→`priority` · `Comentário`→`Comment`

Arquivos em `kebab-case`, tipos em `PascalCase`, funções em `camelCase`. **Um caso de uso por arquivo** em `application/`.

**Atenção:** as tools MCP têm nomes em **português** (`abrir_chamado`) — é a interface com o Agente, e o PRD as define assim (FR-14). O código interno é EN. Não "corrigir" o nome da tool.

### ⚠️ Autenticação ainda não existe (Story 1.3)

Esta story precisa de um `Principal`, mas a autenticação real é a Story 1.3. Solução: o adapter MCP monta um principal a partir de configuração/variável de ambiente, com a **interface já no formato final** (`{ identity, role, origin }`). Assim a 1.3 troca a origem do valor sem mexer em domínio, aplicação nem persistência.

**Não inventar login nem tabela de usuários aqui.** Escopo é a 1.3.

### Armadilhas conhecidas

- **`AD-4` é sobre quem GERA o número.** Tentador fazer `SELECT max(number)+1` ou gerar em código — ambos violam. Precisa ser `DEFAULT nextval(...)` na coluna, com o valor voltando do `INSERT ... RETURNING`.
- **Transação de verdade.** Duas chamadas ao banco em sequência **não** são uma transação. Precisa de `db.transaction(...)`, e a AC #4 força a prova.
- **Teste de integração precisa de banco limpo.** Sem truncar entre testes, a sequence continua de onde parou e asserções sobre número quebram de forma intermitente — pior tipo de teste falho.
- **`verbatimModuleSyntax`** está ligado no `tsconfig`: usar `import type` para tipos. O `typecheck` reprova.
- **Imports com extensão `.js`** mesmo em arquivos `.ts` — `module: nodenext` exige.
- **O `arch` roda sobre `src/`**, e agora vai ter o que analisar pela primeira vez. Se as camadas estiverem trocadas, ele reprova — é o objetivo.
- **Cobertura ≥80% com `coverage.include: ['src/**/*.ts']`**: arquivo sem teste entra com 0% e derruba a média. Todo arquivo novo precisa de teste.

### Aprendizados do Epic 0 (aplicar)

- **Verificar o artefato, não o exit code.** Sete falhas silenciosas foram encontradas assim.
- **Isolar a prova**: só o gate sob teste deve reprovar.
- **Commit lista arquivos explicitamente**, nunca `git add -A`.
- **Subject do commit em minúsculas** — `subject-case` reprovou um commit meu com `QUALITY-GATE` no título.
- **`enforce_admins` está ligado**: nem você mergeia com check vermelho, e `--admin` não contorna.
- **Registrar o que não foi provado**, em vez de deixar implícito.

### Testing standards

- Unidade para domínio e handler (sem I/O).
- **Integração com Postgres real** para número, transação e auditoria — o que a story precisa provar não é mockável.
- Arquivos `*.test.ts` ao lado do código.
- A suíte de integração precisa de `DATABASE_URL`; no CI vem do `services:`.

### Project Structure Notes

Novos: `compose.yaml`, `.env.example`, `drizzle/schema.ts`, migration em `drizzle/`, e arquivos em `src/domain/`, `src/application/{contracts,commands,ports}/`, `src/adapters/{mcp,persistence}/`.

Modificados: `package.json` (deps + scripts), `.github/workflows/ci.yml` (service do Postgres no job `test`).

`src/adapters/http/`, `email/` e `platform/` **continuam vazios** — fora do escopo.

### References

- [Source: epics.md#Story 1.1] — user story e ACs originais
- [Source: prd.md#FR-1] — abrir chamado; número sequencial; status inicial; campos obrigatórios
- [Source: prd.md#FR-14] — tools MCP de escrita; autor e origem no Log de auditoria
- [Source: prd.md#Glossário] — Categoria é classificação fixa (Hardware, Software, Rede, Acesso)
- [Source: ARCHITECTURE-SPINE.md#AD-1..AD-9] — invariantes materializadas aqui
- [Source: ARCHITECTURE-SPINE.md#Consistency Conventions] — glossário, nomes, erros, auth
- [Source: ARCHITECTURE-SPINE.md#Structural Seed] — ERD e árvore de fontes
- [Source: QUALITY-GATE.md#5] — os nove required checks
- [Source: 0-7-quality-gate-agregado-e-branch-protection.md] — pendência da cobertura real no Sonar

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**Docker Compose como binário separado.** `docker compose up -d` falhou com `unknown shorthand flag: 'd'` — nesta máquina o Compose é `docker-compose` (v2.33.1), não subcomando do `docker`. Sem impacto no CI, que usa `services:`.

**O teste de atomicidade foi verificado por mutação.** Um teste de atomicidade que passaria mesmo sem transação não prova nada. Removi o `db.transaction(...)`, rodei a suíte (`1 failed | 25 passed` — exatamente o de atomicidade), restaurei (`26 passed`). Só depois disso a AC #4 foi considerada satisfeita.

**`noUncheckedIndexedAccess` pegou desestruturação insegura no meu próprio teste.** `const [[novo, principal]] = repositorio.chamadas` não compila: o índice pode ser `undefined`. Corrigido com acesso opcional. O strict do tsconfig funcionando contra quem o configurou.

**`pnpm format` não corrige ordenação de imports.** O `lint` reprovou com `assist/source/organizeImports` depois de eu rodar `format`. São coisas diferentes: `biome format` mexe em espaçamento; ordenar imports é regra de *assist*, que só `biome check --write` aplica.

**O SDK não expõe o callback da tool registrada.** Cobrir o caminho de erro exigiria subir um cliente MCP inteiro — e não há pacote cliente instalado (seria dependência fora do escopo). Extraí o handler para `criarHandlerAbrirChamado`, testável direto. A cobertura do adapter foi de 41% para 100%, e o desenho ficou melhor: o handler não depende de transporte.

**Dois falsos positivos do Sonar, ambos de idioma.** `S1135` pediu para "completar o TODO" em `principal.ts`, onde não há TODO algum — casou com a palavra *todo* em português dentro de um comentário. `S7718` exigiu renomear o parâmetro `erro` para `error_`, convenção anglófona. Desativadas em `sonar-project.properties` com justificativa, em vez de deformar o código para agradar um analisador que não fala a língua do projeto.

### Completion Notes List

- **Task 1** — `compose.yaml` e `services:` no CI com Postgres 18-alpine; `.env.example`; script `db:migrate` idempotente.
- **Task 2** — domínio puro: `Status` e `Categoria` como uniões fechadas, `DomainError` com `code`. **`NovoTicket` não tem campo `number`** — gerar o Número em código deixa de ser algo a evitar e passa a ser algo que não compila (AD-4 garantido pelo compilador).
- **Task 3** — contratos Zod derivando `CATEGORIAS` do domínio, sem duplicar a lista (AD-6).
- **Task 4** — port com método único `criarComAuditoria`. Dois métodos separados fariam a atomicidade do AD-3 depender de quem chama lembrar da transação.
- **Task 5** — command handler como único caminho de escrita (AD-2), recebendo `Principal` (AD-8, AD-9).
- **Task 6** — `db.transaction(...)` cobrindo ticket + auditoria; `number` vem de `DEFAULT nextval` e volta pelo `RETURNING`.
- **Task 7** — tool `abrir_chamado` (nome PT, FR-14) com `inputSchema` = schema do contrato; handler extraído para função testável.
- **Task 8** — 32 testes: 19 de domínio, 4 de handler, 5 de integração com Postgres real, 6 de adapter MCP.

**Resultados no CI (PR #17, run `31381750919`):** dez checks verdes, `test` com Postgres real em 32s.

**Pendências do Epic 0 fechadas:**

| Pendência | Resultado |
|---|---|
| `arch` nunca exercitado (Story 0.4) | **14 módulos, 24 dependências**, zero violações |
| Cobertura real no Sonar (Story 0.7) | **91.5% Coverage on New Code** — antes 0.0% |

**Reteste do review por IA (Story 0.6, AC #3): resultado NEGATIVO confirmado.** Este PR era o contexto real que faltava — código de produto, módulos vizinhos, port de auditoria, transação. O `claude-review` rodou 4m38s e **não postou comentário**. A hipótese de que o silêncio anterior se devia ao arquivo isolado parecer stub **não se sustenta**. A conclusão da Story 0.6 se confirma: o review por IA não é cobertura confiável dos pilares de julgamento, e a revisão humana segue sendo a camada real.

**Não exercitado:** `no-cross-adapter` e `no-circular` seguem sem prova — exigiriam dois adapters se cruzando ou um ciclo, que não existem. `principal.ts` com 0% de cobertura: só definições de schema, sem lógica executável.

### File List

- `compose.yaml`, `.env.example` (novos)
- `drizzle/schema.ts`, `drizzle/migrations/0001_inicial.sql` (novos)
- `src/domain/ticket.ts`, `errors.ts` + testes (novos)
- `src/application/contracts/{abrir-chamado,principal}.ts` (novos)
- `src/application/ports/ticket-repository.ts` (novo)
- `src/application/commands/abrir-chamado.ts` + teste (novos)
- `src/adapters/persistence/ticket-repository.ts` + teste (novos)
- `src/adapters/mcp/server.ts` + teste (novos)
- `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `sonar-project.properties` (modificados)
- `_bmad-output/implementation-artifacts/{1-1-...,sprint-status.yaml}` (modificados)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-10 | Tasks 1–8: esqueleto hexagonal completo com 32 testes, cobertura 92,15% |
| 2026-08-10 | Teste de atomicidade verificado por mutação (AC #4) |
| 2026-08-10 | PR #17: dez checks verdes; Sonar reporta 91.5% de cobertura (fecha pendência da 0.7) |
| 2026-08-10 | Reteste do review por IA: negativo com código real — confirma a conclusão da Story 0.6 |
| 2026-08-10 | Dois falsos positivos do Sonar desativados com justificativa |
