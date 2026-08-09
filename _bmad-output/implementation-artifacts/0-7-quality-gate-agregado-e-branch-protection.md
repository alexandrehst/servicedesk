---
baseline_commit: 4860b0d3b9732795a260e4fc814fc75dec33483e
---

# Story 0.7: Quality gate agregado e branch protection

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a construtor,
I want a branch main protegida exigindo todos os checks verdes,
so that o gateway seja o guardrail real do Definition of Done.

## Acceptance Criteria

1. **Given** SonarCloud com `SONAR_TOKEN` já criado e o `lcov.info` que a Story 0.2 gera
   **When** um PR é aberto
   **Then** o job `sonar` roda o scanner via CI e o quality gate do SonarCloud reporta no PR
   **And** a cobertura reportada **não** é `0.0%` — o `lcov` é efetivamente consumido.

2. **Given** todos os jobs do gateway
   **When** a branch protection é configurada
   **Then** os checks abaixo são **required**, com os nomes exatos:
   `lint`, `typecheck`, `test`, `arch`, `traceability`, `security-deps`, `security-secrets`, `sonar`, `claude-review`.

3. **Given** um PR com qualquer check vermelho
   **When** se tenta mergear
   **Then** o GitHub **recusa** o merge — provado por execução, não por inspeção da configuração.

4. **Given** a proteção configurada
   **When** ela é inspecionada
   **Then** mantém `enforce_admins`, histórico linear, sem force-push e sem deleção
   **And** exige que a branch esteja atualizada com a `main` antes do merge (`strict`).

5. **Given** o Epic 0 concluído
   **When** o `QUALITY-GATE.md` é lido
   **Then** ele reflete o estado **real** do gateway, incluindo o que **não** é coberto — nomeadamente os 4 pilares de julgamento (ver Story 0.6).

## Tasks / Subtasks

- [ ] **Task 1 — Scanner do SonarCloud** (AC: #1)
  - [ ] `sonar-project.properties` com `sonar.projectKey=alexandrehst_servicedesk`, `sonar.organization=alexandrehst`, `sonar.sources=src`, `sonar.tests=tests`, `sonar.javascript.lcov.reportPaths=coverage/lcov.info`
  - [ ] Job `sonar` no `ci.yml` com `SonarSource/sonarqube-scan-action@v8.2.1`
  - [ ] **Ordem obrigatória:** rodar `pnpm test:coverage` **antes** do scanner — ele lê um arquivo que precisa já existir
  - [ ] `fetch-depth: 0` (o Sonar usa o histórico para blame/new code)
  - [ ] `SONAR_TOKEN` do secret
  - [ ] **Verificar no log que o `lcov.info` foi consumido** — não aceitar "job verde" como prova

- [ ] **Task 2 — Required status checks** (AC: #2, #4)
  - [ ] Aplicar via `gh api -X PATCH .../branches/main/protection` com os **nove** nomes exatos
  - [ ] `strict: true` (branch atualizada antes do merge)
  - [ ] Preservar o que já existe: `enforce_admins`, `required_linear_history`, `allow_force_pushes: false`, `allow_deletions: false`, `required_conversation_resolution`
  - [ ] Conferir a proteção resultante lendo a API de volta

- [ ] **Task 3 — Provar que o merge é recusado** (AC: #3)
  - [ ] Num PR de teste, introduzir violação que reprove **um** check
  - [ ] Tentar `gh pr merge` e confirmar a **recusa** com a mensagem do GitHub
  - [ ] Reverter e confirmar que o merge passa a ser permitido

- [ ] **Task 4 — Atualizar o QUALITY-GATE com o estado real** (AC: #5)
  - [ ] Substituir o mapa pilar→gate teórico pelo **realizado**, com os nomes dos jobs
  - [ ] Registrar que os 4 pilares de julgamento estão **descobertos** (resultado da Story 0.6)
  - [ ] Registrar as duas limitações conhecidas do `claude-review`
  - [ ] Registrar as ferramentas que passaram a existir e não estavam previstas (ex.: `.gitleaks.toml`)

## Dev Notes

### 🔴 O detalhe que trava tudo se errado: nomes dos checks

Um required status check com nome que **não existe** deixa todo PR **pendente para sempre** — o GitHub espera um check que nunca vai reportar, e não há mensagem de erro, só um merge bloqueado sem explicação.

Nomes coletados da API, **exatamente como o GitHub os vê num PR**:

```
arch  claude-review  lint  security-deps  security-secrets  test  traceability  typecheck
```

**Armadilha confirmada:** no branch `main` o check do Claude aparece como **`claude`** (do `claude.yml`, disparado por `@claude` em comentário), mas em PRs aparece como **`claude-review`** (do `claude-code-review.yml`). **São workflows diferentes.** Exigir `claude` travaria todo PR — ele nunca roda em PR.

O check `sonar` ainda **não existe**; será criado na Task 1. Configurar a proteção **depois** de o job existir e ter rodado ao menos uma vez.

Também aparecem `Analyze (actions)`, `Analyze (javascript-typescript)`, `Analyze (python)` e `CodeQL` (default setup). **Não incluir**: são gerados dinamicamente conforme as linguagens detectadas, e a lista pode mudar sozinha — um check exigido que desaparece trava a `main`.

### Estado atual do gateway (fim do Epic 0)

| Job | Story | O que gateia |
|---|---|---|
| `lint` | 0.1 | Biome — estilo e formatação |
| `typecheck` | 0.1 | `tsc --noEmit` strict |
| `test` | 0.1 / 0.2 | Vitest + cobertura ≥80% |
| `arch` | 0.4 | dependency-cruiser (AD-1) |
| `traceability` | 0.5 | commitlint (commits + título do PR) + referência a Story/FR |
| `security-deps` | 0.3 | Trivy (CVE High/Critical, com devDependencies) |
| `security-secrets` | 0.3 | Gitleaks (histórico completo) |
| `claude-review` | 0.6 | Review por IA — **ver ressalva abaixo** |
| `sonar` | **0.7** | A criar |

Branch protection hoje: `enforce_admins: true`, `required_linear_history: true`, sem force-push, sem deleção, `required_conversation_resolution: true`, **`required_status_checks: null`** — nenhum check obrigatório.

### ⚠️ `claude-review` entra como required, mas NÃO conta como cobertura

Decisão tomada com o resultado da Story 0.6 em mãos. Ele vira required porque isso **garante que o review roda** e que os comentários aparecem. Mas duas limitações comprovadas impedem tratá-lo como garantia de qualidade:

1. **Não apontou a violação plantada.** Um handler mutando estado sem registro de auditoria (viola AD-3 e AD-9) passou pelo review com plugin carregado, ferramentas livres e prompt correto: run `31289868069`, 6 turns, `is_error: false`, `$0.168`, `No buffered inline comments`.
2. **Conclui `success` quando é pulado.** Se o PR modifica `.github/workflows/claude-code-review.yml`, a action se recusa a rodar (proteção contra exfiltração de segredos) e **termina verde**. Como required check, esses PRs satisfazem o gate automaticamente.

**Consequência que precisa estar no QUALITY-GATE:** os pilares **Auditável, Observável, Escalável e Performático** não têm cobertura automática efetiva. A revisão humana é a camada real para eles. Fingir o contrário é o falso verde que este épico existe para impedir.

### SonarCloud — o que precisa ser verificado, não presumido

Situação: `SONAR_TOKEN` existe (criado durante o setup); a **Automatic Analysis foi desligada** pelo usuário; nenhum scanner via CI foi configurado. Hoje o Sonar **não reporta nada** — confirmado: nenhum `status` de commit em PRs recentes.

Histórico relevante: no PR #2, com a Automatic Analysis ligada, o Sonar aprovou o quality gate exibindo **`0.0% Coverage on New Code`**. Foi a **primeira falha silenciosa** encontrada neste projeto. A AC #1 existe por causa disso: não basta o job ficar verde, a cobertura reportada precisa refletir o `lcov` real.

**Ordem no job importa:** `pnpm test:coverage` → scanner. Invertido, o scanner lê um `coverage/lcov.info` inexistente e reporta 0% — sem erro nenhum.

### Aprendizados de todo o Epic 0 (aplicar)

Seis falhas silenciosas encontradas, todas com configuração aparentemente correta:

| # | Ferramenta | O que enganava |
|---|---|---|
| 1 | SonarCloud | aprovava com `0.0%` de cobertura |
| 2 | `@types/node` | 26.x com runtime Node 24 |
| 3 | Vitest | `reporters` (plural) descartado sem aviso |
| 4 | Trivy | `exit-code: 0`, depois devDependencies ignoradas |
| 5 | dependency-cruiser | `severity: warn` não altera exit code |
| 6 | `claude-code-action` | pula o review e conclui `success` |

Mais um modo distinto: **gate correto no lugar errado** — o `traceability` sem `edited` no trigger era contornável editando o título do PR após o verde.

**Regras que se firmaram:**
- Verificar o **artefato produzido**, nunca o exit code.
- **Isolar a prova**: só o gate sob teste deve reprovar.
- Provas de conteúdo de arquivo → `git revert`. Provas de mensagem de commit → reescrever histórico (o commitlint valida o range inteiro).
- Commit de prova lista arquivos **explicitamente**, nunca `git add -A`.
- **Registrar o que não foi provado** em vez de deixar implícito.

### Armadilhas conhecidas

- **Ordem de execução**: criar o job `sonar`, deixar rodar num PR, **só então** incluí-lo nos required checks. Exigir antes = PR travado.
- **`strict: true`** obriga a branch a estar atualizada com a `main` antes do merge. Com um único desenvolvedor o custo é baixo e evita merge de código validado contra base antiga.
- **`enforce_admins: true` vale para você.** Depois desta story, nem você mergeia com check vermelho. É o ponto do exercício — mas saiba que o escape é desativar a proteção, o que fica registrado no audit log do repositório.
- **A Story 0.6 não vai a `done` nesta story.** Ela está em `review` com a AC #3 falhando; fechar o Epic 0 não a conclui retroativamente.

### Testing standards

Sem teste de produto. A prova da Task 3 é a tentativa real de merge com check vermelho.

### Project Structure Notes

- `sonar-project.properties` (novo, raiz)
- `.github/workflows/ci.yml` (job `sonar`; **não reescrever o arquivo**)
- `_bmad-output/planning-artifacts/QUALITY-GATE.md` (atualizado com o estado real)
- Branch protection: via API, não é arquivo versionado

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 0.7] — user story e AC original
- [Source: QUALITY-GATE.md#5] — regra de merge: nenhum PR mergeia sem todos os checks verdes
- [Source: QUALITY-GATE.md#2] — SonarCloud como quality gate agregado
- [Source: QUALITY-GATE.md#1] — os 7 pilares e a distinção duro / de julgamento
- [Source: ARCHITECTURE-SPINE.md#AD-11] — gateway de governança de CI obrigatório
- [Source: 0-6-code-review-por-ia-claude-code.md#Resultado da AC #3] — por que o `claude-review` não conta como cobertura
- [Source: 0-2-gate-de-cobertura-de-testes.md#Completion Notes List] — o `lcov.info` que o Sonar vai consumir

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
