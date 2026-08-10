---
baseline_commit: 4860b0d3b9732795a260e4fc814fc75dec33483e
---

# Story 0.7: Quality gate agregado e branch protection

Status: done

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

- [x] **Task 1 — Scanner do SonarCloud** (AC: #1)
  - [x] `sonar-project.properties` com `sonar.projectKey=alexandrehst_servicedesk`, `sonar.organization=alexandrehst`, `sonar.sources=src`, `sonar.tests=tests`, `sonar.javascript.lcov.reportPaths=coverage/lcov.info`
  - [x] Job `sonar` no `ci.yml` com `SonarSource/sonarqube-scan-action@v8.2.1`
  - [x] **Ordem obrigatória:** rodar `pnpm test:coverage` **antes** do scanner — ele lê um arquivo que precisa já existir
  - [x] `fetch-depth: 0` (o Sonar usa o histórico para blame/new code)
  - [x] `SONAR_TOKEN` do secret
  - [x] **Verificar no log que o `lcov.info` foi consumido** — não aceitar "job verde" como prova

- [x] **Task 2 — Required status checks** (AC: #2, #4)
  - [x] Aplicar via `gh api -X PATCH .../branches/main/protection` com os **nove** nomes exatos
  - [x] `strict: true` (branch atualizada antes do merge)
  - [x] Preservar o que já existe: `enforce_admins`, `required_linear_history`, `allow_force_pushes: false`, `allow_deletions: false`, `required_conversation_resolution`
  - [x] Conferir a proteção resultante lendo a API de volta

- [x] **Task 3 — Provar que o merge é recusado** (AC: #3)
  - [x] Num PR de teste, introduzir violação que reprove **um** check
  - [x] Tentar `gh pr merge` e confirmar a **recusa** com a mensagem do GitHub
  - [x] Reverter e confirmar que o merge passa a ser permitido

- [x] **Task 4 — Atualizar o QUALITY-GATE com o estado real** (AC: #5)
  - [x] Substituir o mapa pilar→gate teórico pelo **realizado**, com os nomes dos jobs
  - [x] Registrar que os 4 pilares de julgamento estão **descobertos** (resultado da Story 0.6)
  - [x] Registrar as duas limitações conhecidas do `claude-review`
  - [x] Registrar as ferramentas que passaram a existir e não estavam previstas (ex.: `.gitleaks.toml`)

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

claude-opus-5

### Debug Log References

**O `lcov.info` está vazio — e o guard distingue isso de "ausente".** Com `src/` contendo apenas `.gitkeep`, o `coverage/lcov.info` tem 0 linhas. Um `test -s` simples reprovaria o job por algo legítimo. O guard final separa três casos: arquivo ausente → falha; vazio **sem** código em `src/` → passa com `::notice`; vazio **com** código em `src/` → falha. A terceira condição é a que passa a valer na Story 1.1 e impede o Sonar de medir 0% em silêncio.

Saída real no CI: `lcov.info presente: 0 linhas` seguido de `::notice::lcov vazio e src/ sem codigo — esperado ate a Story 1.1`.

**O job `sonar` consome o artifact, não roda a suíte de novo.** `needs: test` + `actions/download-artifact@v4`. Duas consequências: economiza uma execução completa, e garante que o número reportado ao Sonar é **exatamente** o `lcov` que o gate de cobertura validou — não uma segunda medição que poderia divergir.

**Efeito cascata revelado na prova da AC #3.** Ao introduzir o erro de tipo, três coisas aconteceram: `typecheck` falhou (esperado), `test` falhou junto (o arquivo sem teste derrubou a cobertura) e **`sonar` ficou `skipping`** por depender de `test`. Isso importa para a branch protection: um check `skipping` **não** satisfaz o required check — o merge fica bloqueado igual. Comportamento correto, mas vale registrar que a dependência `needs: test` propaga bloqueio.

**Nomes dos checks — a armadilha que teria travado a `main`.** Na `main` o check do review por IA aparece como `claude` (workflow `claude.yml`, disparado por `@claude` em comentário); em PRs, como `claude-review` (workflow `claude-code-review.yml`). Se eu tivesse coletado os nomes da `main` — o caminho óbvio — teria exigido `claude`, um check que **nunca roda em PR**, e todo PR ficaria pendente para sempre sem mensagem de erro. Os nomes foram coletados do commit HEAD de um PR real.

**CodeQL deliberadamente fora dos required checks.** `Analyze (python)`, `Analyze (javascript-typescript)`, `Analyze (actions)` e `CodeQL` são gerados dinamicamente conforme o default setup detecta linguagens. Essa lista **já mudou sozinha duas vezes** neste repositório (Story 0.1: só `python`; Story 0.3: cinco linguagens). Um check exigido que desaparece trava a `main` permanentemente. O CodeQL segue rodando e reportando — apenas não bloqueia.

### Completion Notes List

- **Task 1** — `sonar-project.properties` com `projectKey`, `organization`, `sources`, `tests`, `javascript.lcov.reportPaths` e `exclusions` (`_bmad/`, `_bmad-output/` — artefatos de planejamento distorceriam as métricas). Job `sonar` com `needs: test`, `fetch-depth: 0`, download do artifact, guard do lcov e `SonarSource/sonarqube-scan-action@v8.2.1`.
- **Task 2** — nove required checks aplicados via API, com `strict: true`. Proteção lida de volta para conferência: `enforce_admins: true`, `linear: true`, `strict: true`, nove contexts corretos.
- **Task 3** — evidências abaixo.
- **Task 4** — `QUALITY-GATE.md` atualizado: §2 ganhou os acréscimos não previstos (`.gitleaks.toml`, `dependabot.yml`, `TRIVY_INCLUDE_DEV_DEPS`); §3 passou a refletir o gateway **realizado** com nova §3.1 sobre o que **não** está coberto; §4.1 registra as duas limitações do `claude-review`; §5 documenta os nove checks, o que ficou de fora e por quê.

**AC #1 — Sonar consumindo o lcov** (PR #15, run `31310914483`, job 53s):

```
- coverage (ID: 9037351878, Size: 15137)      ← artifact baixado
lcov.info presente: 0 linhas
::notice::lcov vazio e src/ sem codigo — esperado ate a Story 1.1
ANALYSIS SUCCESSFUL ... EXECUTION SUCCESS
```

Ressalva honesta: a cobertura ainda **não** é diferente de zero, porque não há código de produto. O que está provado é que o caminho `test → artifact → scanner` funciona e que o guard reprova se o lcov sumir. **A verificação de que o número reflete cobertura real fica para a Story 1.1**, quando houver o que cobrir.

**AC #2 e #4 — proteção aplicada**, lida de volta da API:

```json
{"admins":true,"checks":["lint","typecheck","test","arch","traceability",
 "security-deps","security-secrets","sonar","claude-review"],
 "linear":true,"strict":true}
```

**AC #3 — merge recusado**, provado por execução:

```
X Pull request alexandrehst/servicedesk#15 is not mergeable:
  the base branch policy prohibits the merge.
```

Com `typecheck` e `test` vermelhos e `sonar` em `skipping`. Reversão restaurou a mergeabilidade.

**AC #5 — `QUALITY-GATE.md` atualizado** com o estado real, incluindo a §3.1 que declara os pilares Observável e Performático **sem gate algum** e Auditável com cobertura apenas de rastreabilidade, não de auditoria em runtime.

### File List

- `sonar-project.properties` (novo)
- `.github/workflows/ci.yml` (modificado — job `sonar`)
- `_bmad-output/planning-artifacts/QUALITY-GATE.md` (modificado — §2, §3, §3.1, §4.1, §5)
- `_bmad-output/implementation-artifacts/0-7-quality-gate-agregado-e-branch-protection.md` (modificado)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modificado)
- Branch protection da `main` — alterada via API, não versionada

## Change Log

| Data | Evento |
|---|---|
| 2026-08-09 | Task 1: job `sonar` + `sonar-project.properties`; SonarCloud volta a analisar após o desligamento da Automatic Analysis |
| 2026-08-09 | PR #15 aberto; `sonar` verde com `ANALYSIS SUCCESSFUL` |
| 2026-08-09 | Task 2: nove required status checks aplicados com `strict: true` |
| 2026-08-09 | Task 3: merge recusado com `typecheck` vermelho — `the base branch policy prohibits the merge` |
| 2026-08-09 | Task 4: `QUALITY-GATE.md` atualizado com o gateway realizado e o que não está coberto |
| 2026-08-09 | Story para `review` |
