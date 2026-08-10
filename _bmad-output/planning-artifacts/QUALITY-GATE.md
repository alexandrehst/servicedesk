---
title: Quality Gate & Governance Contract — ServiceDesk
type: governance-contract
status: draft
created: 2026-08-08
updated: 2026-08-08
companions:
  - architecture/architecture-ServiceDesk-2026-08-08/ARCHITECTURE-SPINE.md
  - epics.md
---

# Quality Gate & Governance Contract — ServiceDesk

Contrato de governança do fluxo **spec-driven development**. Define o **Definition of Done** não-negociável e o **gateway de CI** que o faz cumprir. Nenhum merge para `main` acontece sem o gateway verde. As ferramentas são **gratuitas (OSS ou grátis para repositório público)**; a única exceção é o review por IA (ver §4).

> **Pré-condição:** o repositório é **público** — isso destrava CodeQL, GitHub code scanning e SonarCloud sem custo.

## 1. Os 7 pilares não-negociáveis (Definition of Done)

Todo código que chega à `main` precisa ser:

| # | Pilar | O que significa aqui |
| --- | --- | --- |
| 1 | **Auditável** | Toda mudança rastreável a uma Story/FR; commits convencionais; mutações geram Log de auditoria com autor+origem (AD-3, AD-9). |
| 2 | **Funcional** | Compila (`tsc`) e passa em toda a suíte de testes. |
| 3 | **Testado** | Ampla cobertura de testes acima do limite mínimo (gate numérico). |
| 4 | **Seguro** | Sem vulnerabilidade alta/crítica em código (SAST), dependências (SCA) ou segredos vazados. |
| 5 | **Escalável** | Respeita as fronteiras hexagonais (AD-1); sem acoplamento que impeça evolução independente. |
| 6 | **Performático** | Sem anti-padrões de performance (N+1, loop caro, I/O desnecessário) no diff. |
| 7 | **Observável** | Logging estruturado e tratamento de erro presentes onde importam. |

**Princípio-chave:** pilares "duros" (funcional, testado, seguro) têm gate **determinístico** por ferramenta; pilares "de julgamento" (auditável, observável, escalável, performático) são cobertos por ferramenta **+ review por IA**. É por isso que o review por IA não é enfeite: ele fecha o que nenhuma ferramenta gateia sozinha.

## 2. Ferramentas do gateway (todas gratuitas)

| Camada | Ferramenta | Pilar(es) |
| --- | --- | --- |
| Lint + format | **Biome** | Auditável, Observável |
| Type check | **tsc --noEmit** | Funcional |
| Testes + cobertura | **Vitest** (+ coverage) | Funcional, Testado |
| Fronteiras da arquitetura | **dependency-cruiser** (faz cumprir AD-1) | Escalável |
| SAST (código) | **CodeQL** (code scanning nativo, grátis p/ público) | Seguro |
| SCA (dependências) | **Trivy** + **Dependabot** | Seguro |
| Segredos | **Gitleaks** | Seguro |
| Commits/rastreabilidade | **commitlint** (conventional commits) + template de PR | Auditável |
| Quality gate agregado | **SonarCloud** (grátis p/ público) | todos (dashboard) |
| Review por IA | **anthropics/claude-code-action** | Auditável, Observável, Escalável, Performático — ⚠️ **ver §4.1** |

**Acréscimos não previstos, surgidos durante o Epic 0:**

| Arquivo | Por quê |
| --- | --- |
| `.gitleaks.toml` | Falso positivo: checksums SHA-256 em `_bmad/_config/*.csv` lidos como `generic-api-key`. Usa `[extend] useDefault = true` — **sem isso, uma config própria substitui todas as regras padrão e cega a ferramenta**. |
| `.github/dependabot.yml` | *Version updates* (npm + github-actions), além dos *security updates* já ativos. Dependência que não envelhece é melhor que corrida atrás de CVE. |
| `TRIVY_INCLUDE_DEV_DEPS` | O Trivy **não** escaneia devDependencies por padrão. Como todo o toolchain vive nelas, o `pnpm-lock.yaml` nem era reconhecido como alvo — o gate reportava "Clean" sem ter olhado. |

## 3. Mapa pilar → gate de CI

> **Atualizado em 2026-08-09, ao fim do Epic 0.** A tabela abaixo reflete o
> gateway **realizado**, não o planejado. Onde a realidade divergiu do plano,
> a divergência está registrada — ver §3.1.

| Pilar | Gate determinístico (job de CI) | Reforço por IA |
| --- | --- | --- |
| Funcional | `typecheck` (tsc strict) + `test` (Vitest) | — |
| Testado | `test` — cobertura ≥ **80%** global, quatro métricas `[SUPOSIÇÃO: limite inicial 80%, ajustável]` | — |
| Seguro | CodeQL + `security-deps` (Trivy, **inclui devDependencies**) + `security-secrets` (Gitleaks, histórico completo) | ⚠️ não comprovado |
| Auditável | `traceability` (commitlint em commits **e no título do PR** + referência a Story/FR) + `lint` | ❌ **falhou no teste** |
| Observável | *(nenhum)* | ❌ **falhou no teste** |
| Escalável | `arch` (dependency-cruiser, AD-1) | ❌ **falhou no teste** |
| Performático | *(nenhum)* | ❌ **falhou no teste** |

Agregado: `sonar` (SonarCloud via CI, consome o `lcov.info` do job `test`).

### 3.1 O que NÃO está coberto — leitura honesta

O desenho original previa os quatro pilares de julgamento cobertos por
"ferramenta **+** review por IA". Ao fim do Epic 0, a situação real é:

- **Escalável** tem cobertura parcial e determinística: o `arch` faz cumprir o
  AD-1, mas acoplamento fora da direção de dependências não é verificado.
- **Auditável** tem cobertura de *rastreabilidade* (commit e PR ligados a
  Story/FR), mas **não** de auditoria em runtime: nada garante que uma mutação
  de estado grave registro com autor e origem (AD-3, AD-9).
- **Observável** e **Performático** não têm gate algum.

O reforço por IA, que deveria fechar essa lacuna, **não está operante — mas
por defeito de canal, não de detecção**. Ver §4.1 para o diagnóstico completo.

**Consequência prática:** enquanto o canal não for consertado, para esses
pilares a **revisão humana do PR é a camada real**, não um complemento. Isso
pesa especialmente nas stories que tocam auditoria (1.8) e nas que copiam o
padrão do tracer bullet.

## 4. Review por IA (Claude Code)

A action **[anthropics/claude-code-action](https://github.com/anthropics/claude-code-action)** roda o runtime do Claude Code no runner do GitHub Actions, lê o repositório, analisa o diff e posta comentários de review no PR.

- **Setup:** no terminal, dentro do Claude Code, rodar `/install-github-app` (instala o GitHub App e configura o secret de auth).
- **Disparo:** automático a cada PR aberto **e** sob demanda via `@claude` em comentário.
- **Escopo do prompt de review:** focar nos pilares de julgamento — **auditável, observável, escalável, performático** — e sinalizar violações dos ADs da spine.
- **Custo — DECISÃO REVISADA (2026-08-08):** usar o **token da assinatura Claude**, não créditos de API.
  - Secret do repositório: **`CLAUDE_CODE_OAUTH_TOKEN`** (gerado com `claude setup-token`).
  - *Decisão anterior, substituída:* `ANTHROPIC_API_KEY` com créditos de API pagos.
  - *Motivo:* não há créditos de API provisionados; o token da assinatura entrega o mesmo review sem custo incremental nem cartão.
  - *Trade-off aceito:* o review consome a **cota do plano Claude** do dono do projeto, que é compartilhada com o uso interativo. Em volume alto de PRs isso pode esbarrar em limite de uso — se acontecer, o caminho de volta é provisionar créditos de API e trocar o secret.
  - Com isso o gateway passa a ser **inteiramente sem custo incremental**.

### 4.1 Limitações comprovadas

**1. O review nunca conseguiu postar comentário neste repositório — defeito de
canal, não de detecção.** `[DIAGNOSTICADO 2026-08-10, corrige conclusão
anterior]`

Histórico do que foi observado e do que cada observação realmente provava:

| Tentativa | Resultado | Leitura correta |
| --- | --- | --- |
| PRs #2 a #17 (prompt padrão e customizado) | `No buffered inline comments` em ~12 runs | Nenhum comentário jamais saiu |
| Story 0.6, violação plantada (run `31287913106`) | 8 turns, mudo | Eu havia removido o plugin e restringido `allowedTools` — erro meu |
| Story 0.6, com plugin restaurado (run `31289868069`) | 6 turns, mudo | **Conclusão registrada na época: "o review não detecta". Estava mal fundamentada** |
| Story 1.1, código real (PR #17) | 4m38s, mudo | Hipótese "faltava contexto real" descartada |
| Diagnóstico (run `31383183377`) | **28 turns**, `$0.705`, mudo | Ver abaixo |

O diagnóstico foi desenhado para separar duas explicações que antes estavam
confundidas. Duas mudanças: o prompt passou a **exigir comentário sempre**
(*"se não encontrou violação, diga isso explicitamente"*), e o PR plantou
**duas** violações — uma de pilar de julgamento (auditoria ausente) e um bug
de correção óbvio (off-by-one).

Resultado: **28 turns de análise — 3,5× o custo das tentativas anteriores — e
nem o comentário "nenhuma violação encontrada" foi postado.**

Um modelo que analisa por 28 turns e desobedece uma instrução de output direta
e trivial não está exercendo julgamento sobre o que vale reportar. **Ele não
tem como escrever no PR.** A ferramenta de buffer que o entrypoint
`post-buffered-inline-comments.ts` consome não está sendo alcançada.

**O que isso invalida:** a afirmação de que "o review não detecta violações de
pilar" **nunca foi testada**. Não houve observação possível de detecção, porque
nenhuma saída chegou ao PR. A capacidade do gate segue **desconhecida**, não
refutada.

**O que permanece verdadeiro:** enquanto o canal não funcionar, os quatro
pilares de julgamento não têm cobertura automática. A ação prática é a mesma —
revisão humana —, mas a causa é outra, e a correção também.

**2. Conclui `success` quando é pulado.** Se o PR modifica
`.github/workflows/claude-code-review.yml`, a action se recusa a rodar
(proteção contra exfiltração de segredos) e **termina verde**. Como required
check, esses PRs satisfazem o gate automaticamente. Sem correção possível do
nosso lado — mitigação é revisar manualmente todo PR que toque nesse arquivo.

## 5. Regra de merge (branch protection)

`main` é protegida. **Aplicado em 2026-08-09** (Story 0.7), com estes nove
*required status checks*:

`lint` · `typecheck` · `test` · `arch` · `traceability` · `security-deps` ·
`security-secrets` · `sonar` · `claude-review`

Mais: `strict: true` (branch atualizada com a `main` antes do merge),
`enforce_admins: true`, histórico linear, sem force-push, sem deleção,
conversas resolvidas.

**Provado por execução:** um PR com `typecheck` vermelho recebeu do GitHub
`the base branch policy prohibits the merge`. Verde não é evidência; recusa sob
violação é.

**Checks deliberadamente fora da lista:** os do CodeQL default setup
(`Analyze (python)`, `Analyze (javascript-typescript)`, `Analyze (actions)`,
`CodeQL`). São gerados dinamicamente conforme as linguagens detectadas — a
lista já mudou sozinha duas vezes neste repositório, e um check exigido que
desaparece trava a `main` permanentemente. O CodeQL continua rodando e
reportando; apenas não bloqueia o merge.

**Cuidado com nomes:** na `main` o check do review por IA aparece como `claude`
(do `claude.yml`, disparado por `@claude` em comentário); em PRs, como
`claude-review` (do `claude-code-review.yml`). São workflows diferentes —
exigir `claude` travaria todo PR, porque ele nunca roda em PR.

## 6. Relação com a arquitetura

Este contrato **materializa no CI** invariantes que já vivem na spine: o dependency-cruiser faz cumprir o **AD-1** (dependências só para dentro); o pilar Auditável reflete **AD-3/AD-9** (auditoria com autor+origem). Governado por **AD-11** (Gateway de governança de CI) na ARCHITECTURE-SPINE.
