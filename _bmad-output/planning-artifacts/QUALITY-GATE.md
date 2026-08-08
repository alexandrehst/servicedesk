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
| Review por IA | **anthropics/claude-code-action** | Auditável, Observável, Escalável, Performático |

## 3. Mapa pilar → gate de CI

| Pilar | Gate determinístico | Reforço por IA |
| --- | --- | --- |
| Funcional | `tsc` verde + Vitest verde | — |
| Testado | Cobertura ≥ **80%** (falha o build abaixo disso) `[SUPOSIÇÃO: limite inicial 80%, ajustável]` | — |
| Seguro | CodeQL sem High/Critical + Trivy sem CVE High/Critical + Gitleaks limpo | IA aponta padrões inseguros no diff |
| Auditável | commitlint passa + PR referencia Story/FR + Biome | IA verifica rastreabilidade e clareza |
| Observável | Regras de lint de log/erro | IA verifica logs estruturados e tratamento de erro |
| Escalável | dependency-cruiser (AD-1) sem violação | IA avalia acoplamento e limites |
| Performático | (budget/benchmark leve, quando aplicável) | IA aponta N+1, loop caro, I/O supérfluo |

## 4. Review por IA (Claude Code)

A action **[anthropics/claude-code-action](https://github.com/anthropics/claude-code-action)** roda o runtime do Claude Code no runner do GitHub Actions, lê o repositório, analisa o diff e posta comentários de review no PR.

- **Setup:** no terminal, dentro do Claude Code, rodar `/install-github-app` (instala o GitHub App e configura o secret de auth).
- **Disparo:** automático a cada PR aberto **e** sob demanda via `@claude` em comentário.
- **Escopo do prompt de review:** focar nos pilares de julgamento — **auditável, observável, escalável, performático** — e sinalizar violações dos ADs da spine.
- **Custo:** consome créditos de API **ou** a cota da assinatura Claude. **Decisão:** usar **créditos de API** (`ANTHROPIC_API_KEY` como secret do repositório). Este é o único item não-OSS-grátis do gateway — custo pequeno por PR, aceito pelo dono do projeto.

## 5. Regra de merge (branch protection)

`main` é protegida. Um PR só pode ser mergeado quando **todos** os checks estiverem verdes: `tsc`, Biome, Vitest + cobertura, CodeQL, Trivy, Gitleaks, dependency-cruiser, commitlint — **e** o review por IA sem bloqueios abertos. Nenhuma exceção; o gateway é o guardrail que torna os 7 pilares não-negociáveis de fato.

## 6. Relação com a arquitetura

Este contrato **materializa no CI** invariantes que já vivem na spine: o dependency-cruiser faz cumprir o **AD-1** (dependências só para dentro); o pilar Auditável reflete **AD-3/AD-9** (auditoria com autor+origem). Governado por **AD-11** (Gateway de governança de CI) na ARCHITECTURE-SPINE.
