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
- Ferramentas de CI (grátis, repo **público**): Biome, tsc, Vitest (gate de cobertura ~80%), dependency-cruiser (faz cumprir AD-1), CodeQL (SAST), Trivy + Dependabot (SCA), Gitleaks (segredos), commitlint, SonarCloud. Review por IA: `anthropics/claude-code-action` (créditos de API via secret `ANTHROPIC_API_KEY`).

## Setup pendente (ANTES de codar o Epic 0 — é do usuário)

- [ ] `nvm install 24` (máquina está em Node 22; spine pede Node 24)
- [ ] Criar repo **público** no GitHub (gh já autenticado como `alexandrehst`) — projeto ainda NÃO é repo git
- [ ] Secret `ANTHROPIC_API_KEY` no repo
- [ ] Rodar `/install-github-app` (instala o GitHub App do Claude review)
- [ ] Conectar SonarCloud (login com GitHub)
- [ ] Habilitar code scanning + branch protection em `main`

## Suposições a confirmar durante a execução

- Auth: magic link vs. login corporativo (FR-19)
- Formato de export/import do software contratado (FR-25 / spike antecipado)
- Baseline de tempo médio de resolução atual (SM-3, medir antes do corte)

## Ambiente

git ✓ (mas sem repo) · gh ✓ (autenticado `alexandrehst`) · pnpm 10 · npm 11 · Node 22 (→ 24) · uv ✓ (Homebrew)

## Próximas ações sugeridas

1. `bmad-sprint-planning` (gera plano de sprint; não precisa de GitHub)
2. Setup do GitHub (itens acima)
3. Ciclo de story começando pelo **Epic 0** (montar o gateway) e depois **Story 1.1** (tracer bullet: abrir Chamado via MCP → puxa o esqueleto hexagonal).
