---
baseline_commit: 5b3d154af55dc91e7fc5ac60957cb9e1c3e11c7e
---

# Story 0.3: Segurança — SAST, SCA e segredos

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a construtor,
I want checagem de vulnerabilidade automática no CI,
so that nada inseguro chegue à main (pilar Seguro).

## Acceptance Criteria

1. **Given** o pipeline de CI
   **When** um PR é aberto
   **Then** rodam **CodeQL** (SAST), **Trivy** (CVEs de dependências) e **Gitleaks** (segredos).

2. **Given** uma dependência com CVE High ou Critical
   **When** o CI roda
   **Then** o job de SCA **falha** — provado por execução, com o CVE identificado no log.

3. **Given** um segredo presente no código
   **When** o CI roda
   **Then** o job de segredos **falha** — provado por execução, com a regra que disparou no log.

4. **Given** dependências desatualizadas ou vulneráveis
   **When** o Dependabot avalia o repositório
   **Then** ele abre PRs de atualização automaticamente.

5. **Given** os novos checks
   **When** eles aparecem no PR
   **Then** têm nomes estáveis, aptos a virar *required status checks* na Story 0.7.

## Tasks / Subtasks

- [ ] **Task 1 — Reconciliar o que já existe** (AC: #1, #4)
  - [ ] **Não reconfigurar o CodeQL.** O default setup já está `configured` e detectou `javascript-typescript` sozinho quando o TS chegou (Story 0.2). Apenas registrar o estado nas Completion Notes
  - [ ] **Não reativar** Dependabot alerts nem security updates — ambos já ativos desde o setup inicial
  - [ ] Registrar no Debug Log o que já estava pronto **antes** desta story, para o Change Log do épico não sugerir trabalho que não houve

- [ ] **Task 2 — Dependabot version updates** (AC: #4)
  - [ ] Criar `.github/dependabot.yml` com dois ecosystems: `npm` e `github-actions`
  - [ ] Agenda `weekly`; `open-pull-requests-limit` baixo (5) para não afogar o repositório
  - [ ] Agrupar atualizações de patch/minor de devDependencies num PR só (`groups`), reduzindo ruído

- [ ] **Task 3 — Trivy (SCA)** (AC: #1, #2, #5)
  - [ ] Novo job `security-deps` no `ci.yml` usando `aquasecurity/trivy-action@v0.36.0`
  - [ ] `scan-type: fs`, `scanners: vuln`, lendo o `pnpm-lock.yaml` do repositório
  - [ ] `severity: 'CRITICAL,HIGH'` e **`exit-code: '1'`** — sem o exit-code o Trivy só reporta e o job fica verde com CVE crítica presente
  - [ ] `ignore-unfixed: true` (CVE sem correção disponível não deve travar merge indefinidamente)

- [ ] **Task 4 — Gitleaks (segredos)** (AC: #1, #3, #5)
  - [ ] Novo job `security-secrets` usando `gitleaks/gitleaks-action@v3.0.0`
  - [ ] `fetch-depth: 0` no checkout — sem isso o Gitleaks vê só o último commit e não varre o histórico
  - [ ] **Sem `GITLEAKS_LICENSE`**: exigido apenas para contas de organização; `alexandrehst` é conta pessoal

- [ ] **Task 5 — Provar que o SCA reprova** (AC: #2)
  - [ ] Instalar temporariamente `minimist@1.2.0` (CVE-2021-44906, Critical — prototype pollution)
  - [ ] Confirmar job `security-deps` vermelho no CI, anotando o CVE do log
  - [ ] Reverter (commit listando os arquivos explicitamente)

- [ ] **Task 6 — Provar que o gate de segredos reprova** (AC: #3)
  - [ ] Introduzir um segredo **sintético** em arquivo temporário (chave inventada, nunca uma real)
  - [ ] Confirmar job `security-secrets` vermelho, anotando a regra que disparou
  - [ ] Reverter
  - [ ] **Se o push protection do GitHub bloquear o push**, registrar isso como resultado válido (é uma camada a mais de proteção) e provar o Gitleaks localmente com `docker run` ou binário

## Dev Notes

### Boa parte desta story já está feita — e isso importa

Diferente das stories 0.1 e 0.2, aqui **três dos quatro itens do AC já estão no ar**, feitos durante o setup manual do GitHub antes do Epic 0 começar:

| Item do AC | Estado real | Ação |
|---|---|---|
| CodeQL (SAST) | ✅ `configured`, languages: `actions`, `javascript`, `javascript-typescript`, `python`, `typescript` | **Nada.** Registrar |
| Dependabot alerts | ✅ ativo | **Nada.** Registrar |
| Dependabot security updates | ✅ ativo | **Nada.** Registrar |
| Dependabot version updates | ❌ sem `dependabot.yml` | Task 2 |
| Trivy | ❌ | Task 3 |
| Gitleaks | ❌ | Task 4 |

**O `javascript-typescript` entrou sozinho.** Na Story 0.1 o CodeQL detectava apenas `python`, e ficou anotado que a 0.3 precisaria adicionar TypeScript manualmente. Não precisa: o default setup redetecta linguagens conforme o repositório muda, e o TS apareceu assim que a Story 0.2 mergeou. **Verificar antes de configurar** — a nota da 0.1 está desatualizada.

Alertas Dependabot abertos hoje: **0**.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
|---|---|
| dependency-cruiser / AD-1 | 0.4 |
| commitlint, template de PR | 0.5 |
| Prompt de review por IA | 0.6 |
| SonarCloud, required status checks | 0.7 |

**Sobre "bloqueiam o merge"** (texto do AC no `epics.md`): os jobs desta story **falham** diante de High/Critical, mas isso só *impede o merge* quando virarem required status checks — que é a Story 0.7. Aqui entregamos o sensor; o freio é lá. Não marcar como bloqueio efetivo antes disso.

### Decisão consciente de extensão do AC

O AC #4 pede apenas que o Dependabot abra PRs para dependências **vulneráveis** — o que os *security updates* já ativos fazem. A Task 2 adiciona **version updates** (`dependabot.yml`), que vão além: mantêm as dependências atualizadas preventivamente, inclusive as actions do GitHub.

Justificativa: custa um arquivo, e o pilar Seguro é melhor servido por dependências que não envelhecem do que por corrida atrás de CVE. Registrado aqui para não parecer escopo silencioso.

### Estado atual do CI (pós-Story 0.2, merge `5b3d154`)

`.github/workflows/ci.yml` tem 3 jobs, todos com o mesmo preâmbulo (checkout → pnpm/action-setup → setup-node com `.nvmrc` e `cache: pnpm` → `pnpm install --frozen-lockfile`):

| Job | Comando | Particularidade |
|---|---|---|
| `lint` | `pnpm lint` | — |
| `typecheck` | `pnpm typecheck` | — |
| `test` | `pnpm test:coverage` | `permissions.pull-requests: write`, artifact `coverage`, comentário no PR |

`permissions` global: `contents: read`. Concurrency com `cancel-in-progress`.

**Os dois jobs novos não precisam de Node nem de `pnpm install`** — Trivy e Gitleaks operam sobre os arquivos do repositório. Copiar o preâmbulo dos jobs existentes seria desperdício de ~20s por run.

O `security-secrets` precisa de `fetch-depth: 0`; o `security-deps` não.

### Armadilhas conhecidas

- **Trivy sem `exit-code: '1'` só reporta.** O default é `0` — ele imprime a tabela de CVEs e o job fica **verde**. É o modo de falha silenciosa clássico desta ferramenta, e exatamente o que este épico existe para impedir.
- **Gitleaks sem `fetch-depth: 0`** varre apenas o commit mais recente. Um segredo que entrou três commits atrás passa despercebido.
- **Push protection pode bloquear a prova da Task 6.** O secret scanning do GitHub é gratuito e ativo em repositórios públicos; ele pode recusar o push com o segredo sintético. Se acontecer, **isso é sucesso, não obstáculo** — registrar e provar o Gitleaks localmente.
- **`ignore-unfixed`.** Sem ele, uma CVE sem patch disponível trava todo merge até o upstream corrigir — situação em que o time não tem ação possível.
- **Nomes dos jobs.** `security-deps` e `security-secrets` viram required checks na 0.7. Renomear depois quebra a branch protection em silêncio.
- **Versões das actions.** `aquasecurity/trivy-action@v0.36.0` (traz Trivy v0.70.0) e `gitleaks/gitleaks-action@v3.0.0` (roda em Node 24, sem mudança de inputs).

### Aprendizados das Stories 0.1 e 0.2 (aplicar)

- **Commit de prova lista arquivos explicitamente.** `git add -A` na 0.1 fez o revert apagar o Dev Agent Record.
- **Verificar o artefato, não o exit code.** Na 0.2, `coverage.reporters` (plural) foi descartado em silêncio e o `exit=0` escondia a ausência do `lcov.info`. Aqui: conferir que o Trivy realmente varreu o `pnpm-lock.yaml`, não que "passou".
- **Verificar o estado antes de configurar.** A nota da 0.1 sobre o CodeQL precisar de TypeScript já estava obsoleta quando esta story começou.
- **Isolar a reprovação.** Na 0.2, `lint` e `typecheck` verdes com `test` vermelho provaram que o gate específico mordeu. Repetir: ao provar o Trivy, os demais jobs devem seguir verdes.

### Testing standards

Nenhum teste de produto nesta story. Os "testes" são os próprios jobs, validados pelas Tasks 5 e 6. A suíte existente (`tests/toolchain.test.ts`) deve continuar verde — os jobs novos não tocam em código de aplicação.

### Project Structure Notes

- `.github/dependabot.yml` (novo)
- `.github/workflows/ci.yml` (dois jobs acrescentados; **não reescrever o arquivo**)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 0.3] — user story e AC original
- [Source: _bmad-output/planning-artifacts/QUALITY-GATE.md#2] — camadas SAST, SCA e segredos
- [Source: _bmad-output/planning-artifacts/QUALITY-GATE.md#3] — "CodeQL sem High/Critical + Trivy sem CVE High/Critical + Gitleaks limpo"
- [Source: ARCHITECTURE-SPINE.md#AD-11] — gateway de CI obrigatório
- [Source: _bmad-output/implementation-artifacts/0-2-gate-de-cobertura-de-testes.md#Debug Log References] — padrão de verificar artefato e não exit code

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
