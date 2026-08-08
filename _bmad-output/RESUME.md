# ServiceDesk — Ponto de Retomada

**Última atualização:** 2026-08-08
**Contexto:** projeto de demonstração do fluxo **spec-driven development** (BMad). Migrando de uma sessão para um Claude interativo no terminal.

## O que é o projeto

Service desk interno **MCP-first**: núcleo = API + servidor MCP, operado de dentro de uma IA (UI web é Fase 1.5). Arquitetura **hexagonal**, **TypeScript** ponta-a-ponta. Objetivo de negócio: **substituir o software de chamados contratado (~R$20k/mês ≈ R$240k/ano)** com paridade comprovada. Construído por 1 pessoa + IA. Escala: ~100 funcionários, 8 agentes.

## Onde paramos

Planejamento BMad **completo** (Fases 1–3) + check de prontidão **APROVADO (READY)** + gateway de governança de CI capturado. **Próximo passo: Fase 4 — rodar `bmad-sprint-planning`** (o Epic 0 entra como sprint 0).

## Artefatos (todos em `_bmad-output/planning-artifacts/`, salvo indicado)

- `prds/prd-ServiceDesk-2026-08-08/prd.md` — PRD final, 27 FRs (FR-26/27 = Fase 1.5, fora do MVP)
- `architecture/architecture-ServiceDesk-2026-08-08/ARCHITECTURE-SPINE.md` — 11 ADs (hexagonal); `architecture-deck.html` = deck visual
- `epics.md` — Epic 0 (governança CI, 7 stories) + Epics 1–4 (25 stories de produto)
- `QUALITY-GATE.md` — contrato dos 7 pilares + gateway de CI
- `implementation-readiness-report-2026-08-08.md` — avaliação READY
- `briefs/brief-ServiceDesk-2026-08-08/` — brief + addendum
- `../brainstorming/brainstorm-service-desk-mvp-2026-08-08/` — brainstorm + intent

## Decisões-chave a lembrar

- Paradigma hexagonal; domínio é único ponto de mutação; MCP e API consomem a mesma camada.
- Stack (verificada ago/2026): Node **24** LTS, PostgreSQL 18, MCP SDK v2 (`@modelcontextprotocol/server`), Hono 4.13, Zod 4.4, Drizzle 0.45.
- Migração: número antigo entra como `numero_legado` (referência); Número nativo sempre da sequence (AD-4).
- Intake por e-mail entrou no MVP (Story 1.9) por risco de adoção.
- 7 pilares não-negociáveis (auditável, funcional, testado, seguro, escalável, performático, observável): pilares "duros" gateados por ferramenta, pilares "de julgamento" pelo review por IA.
- Ferramentas de CI (grátis, repo **público**): Biome, tsc, Vitest (gate de cobertura ~80%), dependency-cruiser (faz cumprir AD-1), CodeQL (SAST), Trivy + Dependabot (SCA), Gitleaks (segredos), commitlint, SonarCloud. Review por IA: `anthropics/claude-code-action` (token da assinatura via secret `CLAUDE_CODE_OAUTH_TOKEN`).

## Setup do GitHub

Repo: **https://github.com/alexandrehst/servicedesk** (público)

- [x] `nvm install 24` — v24.19.0 instalado, `default` do nvm já aponta pra ele
- [x] Repo público criado + commit inicial (`7352ec5`, 266 arquivos) + push
- [x] Dependabot: alerts + security updates habilitados
- [x] CodeQL default setup: `configured`, detectou `python` (scripts do BMad) e o run `Analyze (python)` passou. **Adicionar `javascript-typescript` no Epic 0**, assim que existir código TS.
- [x] Branch protection em `main`: PR obrigatório, histórico linear, sem force-push/deleção, conversas resolvidas, `enforce_admins: true`
- [x] Secret `CLAUDE_CODE_OAUTH_TOKEN` criado. Decisão revisada em 2026-08-08: token da assinatura no lugar de créditos de API (ver QUALITY-GATE §4).
- [x] `/install-github-app` — PR #1 mergeado (`02b7d68`), workflows `claude.yml` + `claude-code-review.yml` em `main`, ambos usando `claude_code_oauth_token`
- [x] SonarCloud conectado ao GitHub (feito pelo usuário via navegador — não verificável pelo `gh`)
- [ ] Secret `SONAR_TOKEN` + workflow do scanner — **fica para o Epic 0**. O modo Automatic Analysis do Sonar não recebe cobertura de testes; o pilar *Testado* (cobertura ≥80%, QUALITY-GATE §3) exige análise via CI com o `lcov` do Vitest.
- [ ] Required status checks (`tsc`, Biome, Vitest, Trivy, Gitleaks, dependency-cruiser, commitlint) — só dá pra exigir **depois** que os workflows existirem (Epic 0)

> **Atenção:** `main` já está protegida com `enforce_admins: true`. Todo commit daqui em diante vai por branch + PR, inclusive edições em docs.

## Suposições a confirmar durante a execução

- Auth: magic link vs. login corporativo (FR-19)
- Formato de export/import do software contratado (FR-25 / spike antecipado)
- Baseline de tempo médio de resolução atual (SM-3, medir antes do corte)

## Ambiente

git ✓ (mas sem repo) · gh ✓ (autenticado `alexandrehst`) · pnpm 10 · npm 11 · Node 22 (→ 24) · uv ✓ (Homebrew)

## Próximas ações sugeridas

1. Fechar os 3 itens de setup pendentes acima (API key, GitHub App, SonarCloud)
2. `bmad-sprint-planning` (gera plano de sprint)
3. Ciclo de story começando pelo **Epic 0** (montar o gateway) e depois **Story 1.1** (tracer bullet: abrir Chamado via MCP → puxa o esqueleto hexagonal).
