---
baseline_commit: 886a6321caba4fbf6e6f7626e7fccc312c0b3962
---

# Story 0.4: Fronteiras da arquitetura (dependency-cruiser)

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a construtor,
I want o CI reprovando violações das camadas hexagonais,
so that o AD-1 seja cumprido por máquina, não por disciplina (pilar Escalável).

## Acceptance Criteria

1. **Given** regras de dependency-cruiser que codificam "dependências só para dentro" (AD-1)
   **When** um import viola a direção (ex.: `domain` importando de `adapters`)
   **Then** o CI falha apontando a violação.

2. **Given** o conjunto de regras
   **When** ele é inspecionado
   **Then** cobre as três direções proibidas pelo AD-1:
   - `domain` → `application` / `adapters` / `platform`
   - `application` → `adapters`
   - qualquer camada → dependência circular

3. **Given** uma violação deliberada de cada direção
   **When** o CI roda
   **Then** o job `arch` **falha em cada caso** — provado por execução, com a regra nomeada no log.

4. **Given** que a prova cria arquivos `.ts` em `src/`
   **When** o CI roda
   **Then** **apenas** o job `arch` reprova — os arquivos de prova vêm com teste que os cobre, para não disparar o gate de cobertura da Story 0.2 e contaminar a evidência.

5. **Given** o novo check
   **When** ele aparece no PR
   **Then** tem nome estável (`arch`), apto a virar *required status check* na Story 0.7.

## Tasks / Subtasks

- [ ] **Task 1 — Instalar e configurar** (AC: #1, #2)
  - [ ] `pnpm add -D dependency-cruiser@18.1.1`
  - [ ] Script `arch` → `depcruise src --config .dependency-cruiser.cjs`
  - [ ] `.dependency-cruiser.cjs` (extensão `.cjs` obrigatória: o `package.json` tem `"type": "module"`)

- [ ] **Task 2 — Codificar o AD-1 em regras** (AC: #2)
  - [ ] `no-domain-to-outer`: `src/domain` não depende de `application`, `adapters` nem `platform` — severity `error`
  - [ ] `no-application-to-adapters`: `src/application` não depende de `adapters` — severity `error`
  - [ ] `no-circular`: dependência circular em qualquer camada — severity `error`
  - [ ] `no-cross-adapter`: um adapter não depende de outro adapter — severity `error` (ver *Questão em aberto*)
  - [ ] `tsConfig` apontando para `tsconfig.json`, para o resolver entender os imports TypeScript
  - [ ] `doNotFollow: node_modules` — o objetivo é a arquitetura interna, não a árvore de dependências

- [ ] **Task 3 — Job de CI** (AC: #1, #5)
  - [ ] Novo job `arch` no `ci.yml`, com o mesmo preâmbulo dos jobs que precisam de Node (checkout → pnpm → setup-node → install)
  - [ ] `run: pnpm arch`
  - [ ] Sem `continue-on-error`

- [ ] **Task 4 — Provar que cada regra reprova** (AC: #3, #4)
  - [ ] Criar violação de `no-domain-to-outer`: `src/domain/_prova-ad1.ts` importando de `src/adapters/`
  - [ ] Criar violação de `no-application-to-adapters`
  - [ ] **Acompanhar cada arquivo de prova de um `.test.ts` que o cubra 100%** — sem isso o gate de cobertura reprova junto e a evidência fica ambígua (lição da Story 0.3)
  - [ ] Confirmar no CI: job `arch` **vermelho**, `test` **verde**
  - [ ] Reverter (commit listando os arquivos explicitamente)

## Dev Notes

### O que o AD-1 diz, literalmente

> `domain` não importa de `application`/`adapters`/infra; `application` importa só de `domain`; adapters importam de `application`/`domain`, nunca o contrário. Dependências cruzam para dentro exclusivamente.

Mapa camada → diretório (spine, seção *Design Paradigm*):

| Camada | Diretório | Pode depender de |
|---|---|---|
| Domínio | `src/domain/` | **nada** (núcleo puro) |
| Aplicação | `src/application/` | `domain` |
| Driving adapters | `src/adapters/{mcp,http}/` | `application`, `domain` |
| Driven adapters | `src/adapters/{persistence,email}/` | `application`, `domain` |
| Plataforma | `src/platform/` | — (ver questão abaixo) |

### ⚠️ Questão em aberto — `src/platform/`

O AD-1 **não menciona** `src/platform/` (auth, config, logging). A spine o lista na árvore de fontes, mas fora da tabela de camadas hexagonais.

Decisão adotada `[SUPOSIÇÃO]`: tratar `platform` como **infraestrutura transversal** —

- `domain` **não** pode importar de `platform` (o núcleo é puro; é o que "infra" significa no texto do AD-1)
- `application` e `adapters` **podem** importar de `platform`

Isso é o mais fiel ao espírito do AD-1 sem inventar restrição que ele não impõe. **Se a regra se mostrar apertada ou frouxa no Epic 1, o ajuste é na spine primeiro, não no `.dependency-cruiser.cjs`.** Registrar em retrospectiva.

Mesma lógica para `no-cross-adapter` (adapter não importa de adapter): o AD-1 não proíbe explicitamente, mas dois adapters acoplados violam o propósito de serem intercambiáveis. Adotado como `error` — se atrapalhar, é decisão de arquitetura, não de config.

### O problema que esta story compartilha com a 0.2

`src/` contém apenas `.gitkeep`. **Não há import nenhum para validar.** O job `arch` vai passar verde por ausência de alvo — igual ao gate de cobertura na 0.2.

Consequências:
1. A AC #3 (prova por violação deliberada) é o que dá valor real à story. Sem ela, entregamos um arquivo de config e nenhuma garantia.
2. O gate só passa a valer de fato na **Story 1.1**, quando o esqueleto hexagonal ganhar código. E é exatamente aí que ele mais importa: a 1.1 é o *tracer bullet* que define o padrão que todas as stories seguintes copiam.

### 🔴 A armadilha específica desta story: prova contaminada

Na Story 0.3, o arquivo de prova foi criado em `src/platform/` e **disparou o gate de cobertura junto** — o job `test` ficou vermelho ao mesmo tempo que o gate sob teste. A evidência ficou ambígua: qual gate reprovou por quê?

Aqui o problema é inevitável, porque provar o AD-1 **exige** arquivos `.ts` dentro de `src/`. A solução é a AC #4: **cada arquivo de prova vem com seu `.test.ts` cobrindo 100%.** Assim a cobertura fica satisfeita e só o `arch` reprova.

Exemplo do par:

```
src/domain/_prova-ad1.ts        ← importa de adapters (viola AD-1)
src/domain/_prova-ad1.test.ts   ← cobre 100% do arquivo acima
```

Isolar a reprovação ao gate sob teste é o que transforma "ficou vermelho" em evidência.

### Estado atual do CI (pós-Story 0.3, merge `886a632`)

`.github/workflows/ci.yml` tem **5 jobs**:

| Job | Precisa de Node? | Particularidade |
|---|---|---|
| `lint` | sim | `pnpm lint` |
| `typecheck` | sim | `pnpm typecheck` |
| `test` | sim | `pnpm test:coverage`, `pull-requests: write`, artifact, comentário no PR |
| `security-deps` | **não** | Trivy com `TRIVY_INCLUDE_DEV_DEPS` |
| `security-secrets` | **não** | Gitleaks com `fetch-depth: 0` |

O job `arch` **precisa** de Node e das dependências instaladas — o dependency-cruiser é um pacote npm e resolve imports via `tsconfig.json`. Copiar o preâmbulo de `lint`/`typecheck`.

Outros arquivos relevantes já no repositório:
- `tsconfig.json` — `strict`, `module: nodenext`, `include: ['src/**/*.ts','tests/**/*.ts','*.config.ts']`
- `vitest.config.ts` — `coverage.include: ['src/**/*.ts']`, thresholds 80%
- `biome.json` — `linter.rules.preset: 'recommended'`
- `.gitleaks.toml` — `[extend] useDefault = true` + allowlist
- `package.json` — `"type": "module"`, scripts `lint`/`format`/`typecheck`/`test`/`test:coverage`

### Armadilhas conhecidas

- **`"type": "module"` no `package.json`.** A config do dependency-cruiser precisa ser `.dependency-cruiser.cjs` (CommonJS). Com `.js`, o Node tenta carregar como ESM e falha.
- **`tsConfig` é obrigatório.** Sem apontar o `tsconfig.json`, o resolver não entende paths TypeScript e pode reportar módulos como não-resolvidos — ou pior, não seguir os imports e passar verde.
- **`depcruise` sem `--config` procura por convenção.** Explicitar o caminho evita depender de descoberta implícita.
- **Regra `no-circular` precisa de `severity: error`.** O default de várias regras geradas por `depcruise --init` é `warn`, e **warn não faz o comando sair com código diferente de zero** — gate decorativo, o quinto caso deste épico.
- **`doNotFollow` vs `exclude`.** `doNotFollow` entra no módulo mas não segue suas dependências; `exclude` ignora completamente. Para `node_modules`, `doNotFollow` é o correto.
- **Nome do job.** `arch` vira required check na 0.7.

### Aprendizados das Stories 0.1–0.3 (aplicar)

- **Verificar o artefato, não o exit code.** Confirmar que o depcruise realmente percorreu arquivos (contagem de módulos no output), não apenas que retornou 0.
- **`severity: warn` não reprova.** Mesmo padrão do `exit-code: 0` do Trivy, do `reporters` plural do Vitest e do `--include-dev-deps` ausente. Quatro ferramentas, mesmo modo de falha: **a configuração parece certa e o gate não morde.**
- **Commit de prova lista arquivos explicitamente**, nunca `git add -A`.
- **Isolar a reprovação ao gate sob teste** — daí a AC #4.
- **Verificar o estado antes de configurar** — a nota da 0.1 sobre o CodeQL já estava obsoleta na 0.3.

### Testing standards

Os `.test.ts` que acompanham os arquivos de prova são **temporários e revertidos** junto com eles. Não deixam resíduo. A suíte permanente continua sendo `tests/toolchain.test.ts`.

### Project Structure Notes

- `.dependency-cruiser.cjs` (novo, raiz)
- `.github/workflows/ci.yml` (job `arch` acrescentado; **não reescrever**)
- `package.json` (script `arch` + devDependency)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 0.4] — user story e AC original
- [Source: ARCHITECTURE-SPINE.md#AD-1] — texto literal da regra de direção de dependências
- [Source: ARCHITECTURE-SPINE.md#Design Paradigm] — mapa camada → diretório
- [Source: ARCHITECTURE-SPINE.md#Structural Seed] — árvore de fontes mínima
- [Source: QUALITY-GATE.md#2] — dependency-cruiser faz cumprir AD-1, pilar Escalável
- [Source: QUALITY-GATE.md#3] — "dependency-cruiser (AD-1) sem violação"
- [Source: 0-3-seguranca-sast-sca-e-segredos.md#Debug Log References] — prova contaminada por outro gate

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
