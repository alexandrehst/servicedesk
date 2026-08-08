# Story 0.1: Toolchain base e pipeline de CI

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a construtor,
I want um repositório público com Biome, TypeScript e Vitest rodando no CI,
so that todo PR já passe pelos gates de estilo, tipo e teste.

## Acceptance Criteria

1. **Given** o repositório com o esqueleto do projeto
   **When** um PR é aberto
   **Then** o workflow de CI executa Biome (lint + format), `tsc --noEmit` e Vitest
   **And** o build falha se **qualquer um dos três** falhar.

2. **Given** o pipeline configurado
   **When** cada gate é submetido a uma violação deliberada (erro de lint, erro de tipo, teste quebrado)
   **Then** o job correspondente **falha** — provado por execução, não por inspeção do YAML.
   *(Um gate que nunca reprova é indistinguível de um gate que funciona. Esta AC existe porque a Story 0.1 é a única sem gate anterior para validá-la.)*

3. **Given** a árvore de fontes definida na spine
   **When** o projeto é inicializado
   **Then** os diretórios `src/domain/`, `src/application/{contracts,commands,queries,ports}/`, `src/adapters/{mcp,http,persistence,email}/`, `src/platform/` e `drizzle/` existem
   **And** nenhum contém código de produto (Epic 1 os preenche).

4. **Given** o runtime fixado pela spine
   **When** o CI e o ambiente local resolvem a versão do Node
   **Then** ambos usam **Node 24**, declarado em `.nvmrc` e em `engines` do `package.json`.

5. **Given** um PR aberto
   **When** o CI conclui
   **Then** os três checks aparecem no PR com nomes estáveis, aptos a virar *required status checks* na Story 0.7.

## Tasks / Subtasks

- [ ] **Task 1 — Scaffold do projeto** (AC: #3, #4)
  - [ ] `package.json` com `"type": "module"`, `"private": true`, `engines.node: ">=24"`, e scripts `lint`, `format`, `typecheck`, `test`
  - [ ] `.nvmrc` com `24`
  - [ ] Árvore de diretórios da spine com `.gitkeep` em cada pasta vazia
  - [ ] `.gitignore` — acrescentar o que faltar (o arquivo já existe na raiz; **não recriar do zero**)

- [ ] **Task 2 — TypeScript** (AC: #1)
  - [ ] `tsconfig.json`: `strict: true`, `module: nodenext`, `moduleResolution: nodenext`, `target: es2024`, `noEmit: true`, `verbatimModuleSyntax: true`
  - [ ] Confirmar que `pnpm typecheck` (→ `tsc --noEmit`) passa na árvore vazia

- [ ] **Task 3 — Biome** (AC: #1)
  - [ ] `biome.json` com linter e formatter habilitados
  - [ ] Script `lint` → `biome ci .` (modo CI: não escreve, só reporta)
  - [ ] Script `format` → `biome format --write .` para uso local

- [ ] **Task 4 — Vitest + teste de fumaça** (AC: #1, #4)
  - [ ] `vitest.config.ts` com `environment: 'node'`
  - [ ] `tests/toolchain.test.ts` verificando que o major de `process.version` é **≥ 24**
  - [ ] *Sem* configuração de cobertura — é escopo da Story 0.2

- [ ] **Task 5 — Workflow de CI** (AC: #1, #5)
  - [ ] `.github/workflows/ci.yml` disparando em `pull_request` e `push` na `main`
  - [ ] Job com `pnpm/action-setup` e `actions/setup-node@v4` (`node-version-file: .nvmrc`, `cache: pnpm`)
  - [ ] Três steps nomeados de forma estável: `lint`, `typecheck`, `test`
  - [ ] Sem `continue-on-error` em nenhum step

- [ ] **Task 6 — Provar que os gates reprovam** (AC: #2)
  - [ ] Introduzir temporariamente uma violação de lint → confirmar job vermelho
  - [ ] Introduzir temporariamente um erro de tipo → confirmar job vermelho
  - [ ] Quebrar temporariamente o teste de fumaça → confirmar job vermelho
  - [ ] Reverter as três violações; registrar as evidências (link do run + conclusão) nas Completion Notes

## Dev Notes

### Escopo — o que esta story NÃO faz

Delimitado para evitar invasão das stories seguintes do Epic 0:

| Fora de escopo | Story dona |
|---|---|
| Threshold de cobertura, relatório `lcov`, SonarCloud | 0.2 |
| Trivy, Gitleaks (CodeQL e Dependabot já estão ativos) | 0.3 |
| dependency-cruiser / enforcement do AD-1 | 0.4 |
| commitlint, template de PR | 0.5 |
| Prompt de review por IA | 0.6 |
| Required status checks na branch protection | 0.7 |

Nenhum código de domínio, adapter ou persistência. Esta story entrega **o encanamento**, não produto.

### Stack fixada

| Ferramenta | Versão | Observação |
|---|---|---|
| Node.js | **24** (local: 24.19.0) | `.nvmrc` + `engines` |
| TypeScript | **5.9.3** | Última 5.x; decisão fixada abaixo |
| Biome | **2.5.7** | lint + format numa ferramenta só |
| Vitest | **4.1.10** | `engines` aceita Node 24 |
| pnpm | **10** | `node_modules` estrito; decisão fixada abaixo |

### Decisões fixadas (2026-08-08) — não reabrir durante a implementação

1. **TypeScript 5.9.3**, não 7.x. A linha `latest` do npm é a 7.0.2 (compilador reescrito em Go), mas: o ganho de velocidade só se materializa em bases muito maiores que esta; Drizzle ORM (tipos avançados) e dependency-cruiser (usa a API do compilador, Story 0.4) são pontos prováveis de atrito com um compilador novo; e 5.x é o que a spine fixa — adotar 7.x exigiria emendar o contrato de arquitetura na primeira story. Migrar depois custa subir a versão e rodar `tsc`; migrar agora custaria depurar às cegas, sem gate. **Reavaliar quando Drizzle e dependency-cruiser declararem suporte explícito à 7.x.**

2. **pnpm 10** como gerenciador de pacotes (a spine não definia). Decisivo não é a velocidade, é o `node_modules` estrito: importar pacote não declarado no `package.json` **falha**, em vez de passar silenciosamente como no npm. Esse rigor é do mesmo tipo que o AD-1 e o dependency-cruiser vão exigir. Custo: um step `pnpm/action-setup` no CI.

### Por que a AC #2 existe

Esta é a única story do projeto que constrói o gate sem ter um gate que a valide. Todos os modos de falha aqui são silenciosos: um `biome ci` que não encontra arquivos, um `tsc` que não checa nada porque a árvore está vazia, um Vitest que passa por não achar teste algum. Os três produzem check verde e proteção zero.

Isso não é hipotético — já aconteceu duas vezes neste repositório:
- o SonarCloud aprovando PR com `0.0% Coverage on New Code`;
- o `claude-review` concluindo verde sem ter revisado os pilares que deveria.

Por isso a AC #2 exige **prova por execução**. Verde não é evidência; vermelho sob violação é.

### Armadilhas conhecidas

- **Vitest sem arquivos de teste**: por padrão, `vitest run` sem testes encontrados retorna erro em v4 — mas não confie nisso, o teste de fumaça da Task 4 elimina a ambiguidade.
- **`biome ci` vs `biome check`**: usar `ci` no workflow. O `check` pode escrever arquivos; `ci` só reporta e retorna código de saída.
- **`tsc --noEmit` em árvore vazia** passa trivialmente. Ele só vira gate real quando existir código (Epic 1) — por isso a AC #2 valida com erro de tipo deliberado.
- **Nomes dos checks**: a Story 0.7 vai referenciá-los como *required status checks*. Renomear depois quebra a branch protection silenciosamente (um check exigido que não existe mais deixa o PR pendente para sempre).
- **`.gitignore` já existe** na raiz, com `node_modules/`, `dist/`, `coverage/`, `.env*` e `.claude/settings.local.json`. Estender, não substituir.

### Estado atual do repositório

Já existe e **não deve ser refeito**:
- `.github/workflows/claude.yml` e `claude-code-review.yml` (Story 0.6, parcial)
- CodeQL default setup ativo (linguagem detectada: `python`) — a Story 0.3 adiciona `javascript-typescript`
- Dependabot alerts + security updates ativos
- Branch protection na `main`: PR obrigatório, histórico linear, sem force-push, `enforce_admins`. **Sem required status checks** — Story 0.7
- Secrets `CLAUDE_CODE_OAUTH_TOKEN` e `SONAR_TOKEN`
- `_bmad/custom/bmad-dev-auto.toml` — `on_complete` que publica o PR e colhe o veredito do CI

O repositório **ainda não tem** `package.json`, `src/` ou qualquer código TypeScript.

### Project Structure Notes

A árvore segue literalmente a *Árvore de fontes mínima* da spine. Criar as pastas agora — mesmo vazias — importa por dois motivos: o dependency-cruiser da Story 0.4 precisa de alvos para as regras do AD-1, e a Story 1.1 herda a estrutura em vez de improvisar.

`src/adapters/web/` fica **de fora**: é Fase 1.5, explicitamente adiada na spine.

### Testing standards

- Runner: Vitest. Arquivos `*.test.ts`.
- Testes de unidade convivem com o código-fonte a partir do Epic 1; `tests/` guarda os de nível de projeto (como o de fumaça desta story).
- Cobertura não é gate nesta story (Story 0.2).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 0.1] — user story e AC original
- [Source: _bmad-output/planning-artifacts/architecture/architecture-ServiceDesk-2026-08-08/ARCHITECTURE-SPINE.md#Stack] — versões
- [Source: ARCHITECTURE-SPINE.md#Structural Seed] — árvore de fontes
- [Source: ARCHITECTURE-SPINE.md#AD-11] — gateway de CI obrigatório
- [Source: ARCHITECTURE-SPINE.md#Consistency Conventions] — `kebab-case` para arquivos, `PascalCase` para tipos, `camelCase` para funções
- [Source: _bmad-output/planning-artifacts/QUALITY-GATE.md#2] — Biome → pilares Auditável/Observável; tsc → Funcional; Vitest → Funcional/Testado
- [Source: _bmad-output/planning-artifacts/QUALITY-GATE.md#5] — regra de merge que a Story 0.7 vai aplicar

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
