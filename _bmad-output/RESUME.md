# ServiceDesk — Ponto de Retomada

**Última atualização:** 2026-08-10
**Repo:** https://github.com/alexandrehst/servicedesk (público)

## O que é o projeto

Service desk interno **MCP-first**: núcleo = API + servidor MCP, operado de dentro de uma IA (UI web é Fase 1.5). Arquitetura **hexagonal**, **TypeScript** ponta-a-ponta. Objetivo: **substituir o software de chamados contratado (~R$240k/ano)** com paridade comprovada. 1 pessoa + IA. Escala: ~100 funcionários, 8 agentes.

## Onde paramos

**Epic 0 completo (7/7).** **Stories 1.1 e 1.2 mergeadas.** Próximo: **Story 1.3** — autenticação e identidade.

| Épico | Estado |
| --- | --- |
| Epic 0 — Governança de CI | ✅ 7/7 `done` |
| Epic 1 — Fundação segura | 1.1 e 1.2 `done`; 1.3 a 1.9 `backlog` |
| Epics 2–4 | `backlog` |

Estado por story: `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## O gateway (o que existe hoje)

**Nove required status checks** na `main`, `strict: true`, `enforce_admins: true`, histórico linear, sem force-push:

`lint` · `typecheck` · `test` · `arch` · `traceability` · `security-deps` · `security-secrets` · `sonar` · `claude-review`

Mais CodeQL (não obrigatório: nomes gerados dinamicamente, um check que some trava a `main`).

| Job | Ferramenta | Detalhe que importa |
| --- | --- | --- |
| `lint` | Biome 2.5.7 | `biome ci`; ordenação de imports só o `check --write` corrige |
| `typecheck` | tsc 5.9.3 | strict + `noUncheckedIndexedAccess` |
| `test` | Vitest 4.1.10 | cobertura ≥80%; service Postgres 18 no CI |
| `arch` | dependency-cruiser 18.1.1 | AD-1; todas as regras `severity: error` |
| `traceability` | commitlint 21.2.1 | commits **e título do PR**; `types` inclui `edited` |
| `security-deps` | Trivy | **`TRIVY_INCLUDE_DEV_DEPS`** obrigatório |
| `security-secrets` | Gitleaks | `fetch-depth: 0`; `.gitleaks.toml` com `useDefault` |
| `sonar` | SonarCloud | consome o artifact de cobertura do job `test` |
| `claude-review` | claude-code-action | **`mcp__github_inline_comment__create_inline_comment` em `allowedTools`** |

**`required_conversation_resolution: true`** — o `claude-review` comenta em
**todo** PR, inclusive para dizer que não achou violação. Um comentário aberto
**bloqueia o merge** mesmo com os nove checks verdes. Leia o comentário, corrija
se for achado real, e só então resolva a thread via
`gh api graphql ... resolveReviewThread`.

**`claude-review` é instável na margem do `--max-turns`.** No PR #28 (1015
linhas) a primeira execução morreu em `error_max_turns` com 31 turns e o re-run,
sem mudança nenhuma, terminou em 26. Teto subido para 60. Se falhar de novo por
orçamento, **re-run antes de investigar** — pode ser só variação.

## ⚠️ PRs do Dependabot abertos — NÃO mergear sem ler

| PR | Proposta | Decisão do projeto |
| --- | --- | --- |
| **#7** | TypeScript 5.9.3 → **7.0.2** | **Rejeitar.** A Story 0.1 escolheu 5.x deliberadamente: a 7.0 é o compilador em Go, e Drizzle (tipos avançados) e dependency-cruiser (usa a API do compilador) são pontos prováveis de atrito. A spine fixa 5.x. Reavaliar só quando ambos declararem suporte |
| **#8** | `@types/node` 24 → **26** | **Rejeitar.** Fixado em `^24` para casar com o runtime. A 26.x expõe APIs que não existem no Node 24 — passariam no `tsc` e quebrariam em execução |
| **#16** | github-actions, 5 updates | Avaliar normalmente |

## Decisões-chave

- Paradigma hexagonal; domínio é único ponto de mutação; MCP e API consomem a mesma camada.
- Stack: Node **24**, PostgreSQL **18** (via Docker), `@modelcontextprotocol/server` **2.0.0**, Zod 4.4.3, Drizzle 0.45.2, pnpm 10.
- Auth do review por IA: **token da assinatura** (`CLAUDE_CODE_OAUTH_TOKEN`), não créditos de API.
- Migração: número antigo entra como `numero_legado`; Número nativo sempre da sequence (AD-4).
- `src/platform/` não é mencionado no AD-1. Adotado `[SUPOSIÇÃO]`: `domain` não importa dele; `application` e `adapters` podem. Ajuste vai na **spine primeiro**, não no `.dependency-cruiser.cjs`.

## O que o Epic 0 ensinou — aplicar sempre

**Sete falhas silenciosas**, todas com configuração aparentando estar certa:

| Ferramenta | O que enganava |
| --- | --- |
| SonarCloud | aprovava com `0.0%` de cobertura |
| `@types/node` | 26.x com runtime Node 24 |
| Vitest | `reporters` (plural) descartado sem aviso — a chave é `reporter` |
| Trivy | `exit-code: 0`, depois devDependencies ignoradas |
| dependency-cruiser | `severity: warn` não altera exit code |
| `claude-code-action` | pula o review e conclui `success` se o PR toca no próprio workflow |
| `claude-code-action` | ferramenta de comentário ausente de `allowedTools` — **custou 4 diagnósticos errados** |
| `psql -f` | **sai com código 0 mesmo com SQL quebrado** — exige `-v ON_ERROR_STOP=1` (Story 1.2) |

Mais um modo distinto: **gate correto no lugar errado** — `traceability` sem `edited` no trigger era contornável editando o título do PR depois do verde.

**Regras que se firmaram:**
- Verificar o **artefato produzido**, nunca o exit code.
- **Isolar a prova**: só o gate sob teste deve reprovar. Arquivo de prova em `src/` vem com teste que o cobre.
- Prova de **conteúdo de arquivo** → `git revert`. Prova de **mensagem de commit** → reescrever histórico (commitlint valida o range inteiro).
- Commit lista arquivos **explicitamente**, nunca `git add -A`.
- Subject de commit em **minúsculas** (`subject-case`).
- **Registrar o que não foi provado**, em vez de deixar implícito.

## Padrão estabelecido pela Story 1.1 — copiar

- `NovoTicket` **não tem** campo `number`: só `Ticket` persistido tem. Gerar o Número em código não compila (AD-4 pelo compilador).
- Port com método único `criarComAuditoria`: dois métodos fariam a atomicidade do AD-3 depender de quem chama.
- Contratos Zod em `application/contracts/` como fonte única; o MCP deriva (AD-6).
- Erros tipados com `code`, shape nascendo no domínio.
- Teste de atomicidade **verificado por mutação**: remover a transação deve reprovar o teste.

## Padrão estabelecido pela Story 1.2 — copiar

- **Um erro só** para "não existe" e "não é seu". Mensagens distintas dariam um oráculo de existência sobre Números sequenciais. Testar comparando as duas, nunca cada uma isolada.
- O adapter devolve dado **bruto**, inclusive o que o Solicitante não pode ver; quem filtra é o domínio (AD-8). É o que impede MCP e HTTP divergirem no que escondem.
- Teste de ordenação insere os registros **fora de ordem** — em ordem, ele passaria pela ordem física do heap mesmo sem `ORDER BY`.
- `await promessa.catch((e) => e as Error)` **não devolve `Error`**: devolve a união com a saída de sucesso, e `.message` não existe nela. Usar um helper que estreita com `ehDomainError` e falha quando não há erro.
- Cobertura **global esconde arquivo descoberto**: 87,5% passava o gate de 80% com o adapter MCP em 72% e uma função sem nenhum teste. Ler a tabela por arquivo, não só o total.
- Script de migration itera sobre `drizzle/migrations/*.sql` — nome fixo deixaria a `0002` fora do CI.

## Sem cobertura automática

Os pilares **Observável** e **Performático** não têm gate determinístico e **nunca foram exercitados** por violação plantada. O review por IA os cobre por prompt, sem garantia. Detalhes em `QUALITY-GATE.md` §3.1.

`no-cross-adapter` e `no-circular` (dependency-cruiser) também seguem declaradas mas não exercitadas.

## Ambiente

- Node 24.19.0 (nvm, `default`) · pnpm 10.32.1 · Docker 28.0.1
- **`docker-compose` (com hífen)** — `docker compose` não existe nesta máquina
- Postgres local: `docker-compose up -d`, depois `pnpm db:migrate` com `DATABASE_URL`
- Secrets no repo: `CLAUDE_CODE_OAUTH_TOKEN`, `SONAR_TOKEN`

## Próximas ações

1. **Sandbox: o socket do Docker segue bloqueado.** `docker ps` devolve `operation not permitted` mesmo com o `allowWrite` do `docker.sock` em `.claude/settings.json`. Na Story 1.2 foi contornado rodando os comandos de Docker e `git push` fora do sandbox. **Resolver antes de ligar o loop** — sem isso o loop trava na primeira migration
2. **Ligar o loop** para 1.3–1.9:
   ```
   /ralph-loop:ralph-loop Leia e execute _bmad-output/RALPH-PROMPT.md --completion-promise 'EPIC 1 COMPLETO' --max-iterations 20
   ```
   O prompt do loop está em `_bmad-output/RALPH-PROMPT.md` — editável durante a execução, é relido a cada volta.
