# ServiceDesk — Ponto de Retomada

**Última atualização:** 2026-08-11
**Repo:** https://github.com/alexandrehst/servicedesk (público)

## O que é o projeto

Service desk interno **MCP-first**: núcleo = API + servidor MCP, operado de dentro de uma IA (UI web é Fase 1.5). Arquitetura **hexagonal**, **TypeScript** ponta-a-ponta. Objetivo: **substituir o software de chamados contratado (~R$240k/ano)** com paridade comprovada. 1 pessoa + IA. Escala: ~100 funcionários, 8 agentes.

## Onde paramos

**Epic 0 completo (7/7). Epic 1 COMPLETO (9/9).** Próximo: **Epic 2** — ciclo de vida do Chamado (comentar, mudar status, atribuir dono, prioridade, resolver, ações irreversíveis).

O MVP já tem: abrir e ver Chamado via MCP, autenticação por magic link, dois papéis com autorização no domínio, token de máquina com rate limit, e-mail de abertura com link de acesso, soft-delete, revisão do Log de auditoria e intake por e-mail com remetente verificado.

| Épico | Estado |
| --- | --- |
| Epic 0 — Governança de CI | ✅ 7/7 `done` |
| Epic 1 — Fundação segura | ✅ 9/9 `done` |
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

**E tem um quarto modo de falha, visto a partir do PR #31 (Story 1.3):**
executa, conclui `is_error: false`, fica verde e **não comenta nada** — nem
inline, nem geral, nem "nenhuma violação encontrada". Foram **cinco rodadas
seguidas** assim (#31 em duas execuções, #32, #33, #34 e a primeira rodada do
#35), atravessando as três stories de fronteira de segurança do Epic 1 — e
então, no commit seguinte do #35, ele **voltou a comentar**, com raciocínio
específico sobre a ordem das chamadas, o UPSERT atômico e o AD-9. O silêncio é
**intermitente**, não permanente: verde continua não sendo evidência de review,
mas mudo também não é o estado definitivo. Verde do `claude-review` **não é evidência
de que houve review**: confira `/pulls/N/comments` antes de tratá-lo como
opinião. O que era "nunca reprovou nada" (Story 0.6) virou "nem fala mais".

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
- **E-mail (FR-18, decidido em 2026-08-10):** link do e-mail é magic link de acesso a **um** Chamado, **7 dias**, **reutilizável** (uso único seria hostil para quem abre o e-mail dias depois); transporte **Nodemailer/SMTP** configurável. O envio fica **fora** da transação do AD-3.
- **Decisões abertas agora se resolvem por recomendação**, sem parar o loop: o dono delegou em 2026-08-10, depois de concordar com as três consultas anteriores. Registrar sempre no PRD, na spine e no Dev Agent Record. Risco externo (dinheiro, terceiros, apagar dado) continua exigindo confirmação.
- **Segurança do adapter MCP (FR-21, decidida em 2026-08-10):** token de **máquina** separado da sessão humana, revogável, com identidade própria (é o que permite o AD-9 separar agente autônomo de "humano via IA"); **60 chamadas/minuto por identidade**; contador no Postgres. Prazo do token não foi decidido — `expira_em` aceita nulo.
- **Autenticação do produto (FR-19/Q7, decidida em 2026-08-10):** magic link por e-mail; sessão em tabela no Postgres com o token só em hash SHA-256; link de 15 min de uso único; sessão de 8 h. O papel vive em `users` e é lido a cada resolução. PRD e spine atualizados — a questão não está mais aberta.
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

## Padrão estabelecido pela Story 1.3 — copiar

- **O principal vem de `McpDeps.autenticar`**, uma função resolvida a cada
  chamada de tool. Resolver uma vez na montagem faria a expiração de 8 h não
  ter efeito sobre uma conexão MCP longa.
- **Autenticar antes do caso de uso.** Chamado gravado antes de saber o autor
  violaria o AD-3 e ficaria no banco.
- **Um erro só** (`CredencialInvalida`) para inexistente, expirado, usado,
  vazio e usuário fora do cadastro — e um teste que varre a mensagem atrás das
  palavras que distinguiriam os casos.
- **Uso único é garantia do banco**, não da ordem do código:
  `UPDATE ... WHERE usado_em IS NULL RETURNING`, com teste de duas trocas
  simultâneas.
- **Sessão não guarda papel** — `INNER JOIN users` na resolução faz
  rebaixamento e remoção valerem na hora.
- **Relógio injetado** (`agora: () => Date`): expiração testada sem `sleep`.
- **`papelSchema.parse` em vez de `as`** em fronteira que decide visibilidade:
  cast errado cai silencioso no ramo "não é agente".
- **Contrato Zod sem teste fica com 0% e a média global esconde** — foi o que
  aconteceu com `contracts/autenticacao.ts` (schemas usados só como tipo).

## Padrão estabelecido pela Story 1.4 — copiar

- **Autorização é garantia do compilador, não disciplina.** O port devolve o
  Chamado embrulhado (`ChamadoBruto`) e o conteúdo só sai por `visivelPara`; o
  símbolo que guarda o dado **não é exportado**. Caso de uso que esqueça a
  autorização não compila. Mesma ideia do `NovoTicket` sem `number` (1.1) e do
  handler de leitura sem escrita (1.2).
- **Capacidade por papel vive numa tabela** (`domain/papeis.ts`), com `switch`
  exaustivo: papel novo sem política é erro de compilação; papel corrompido em
  runtime **lança**, em vez de virar `false` silencioso.
- **Garantia estrutural se prova com `@ts-expect-error`** — se o vazamento
  virar compilável, o `typecheck` reprova com `TS2578`. É a única forma de um
  gate verificar "isto não compila".
- **`fileParallelism: false`** no Vitest: testes de integração dividem um
  Postgres e truncam tabelas; em paralelo um limpa a base do outro.
- **Uma lista, não três.** `papelSchema` deriva de `PAPEIS` do domínio — antes
  eram domínio, contrato e banco divergindo sem que nada reprovasse.

## Padrão estabelecido pela Story 1.5 — copiar

- **Contadores e credenciais são atômicos no banco**:
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`. `SELECT`-e-`UPDATE`
  afrouxaria o limite exatamente sob concorrência.
- **Teste de concorrência exige `Promise.all`** — em sequência, o código
  não-atômico passa.
- **Erros só se separam quando a distinção ajuda quem tem direito.**
  `LimiteExcedido` ≠ `CredencialInvalida` porque quem bateu no limite já provou
  quem é; dentro de "credencial ruim", tudo continua indistinguível.
- **Defesa que devolveria zero em silêncio precisa lançar.** No UPSERT do
  contador, um retorno vazio tratado como `0` desligaria o rate limit inteiro
  sem nenhum teste vermelho.
- **Limite é por identidade, nunca por conexão** (contornável) nem global
  (uma IA em loop derrubaria todo mundo).

## Padrão estabelecido pela Story 1.8 — copiar

- **Leitura nova passa pelo gargalo, não reimplementa autorização.** O
  histórico autoriza com `podeVerTicket` + uma capacidade — e já nasceu sabendo
  recusar Chamado excluído, sem uma linha a respeito.
- **A garantia decide onde o código mora.** `historicoVisivelPara` ficou em
  `visibilidade.ts` porque a chave que abre o `Bruto` é privada daquele módulo;
  pôr a função em outro arquivo exigiria expor a chave e desfazer a garantia.
- **Recorte de consulta pode descer ao SQL; autorização, não.** Filtro por
  `origin` é recorte. Com teste provando que pedir um pedaço não contorna a
  regra.
- **Conceito que o domínio precisa vive no domínio** — `ORIGENS` saiu do
  contrato Zod, como `PAPEIS` na 1.4.
- **Leitura não audita a si mesma** — o Log cresceria a cada revisão.

## Padrão estabelecido pela Story 1.7 — copiar

- **Garantia estrutural rende juros.** O filtro de excluídos entrou no gargalo
  da 1.4 (`visivelPara`) e **toda** leitura o herdou — inclusive as que ainda
  não existem. Antes de espalhar uma condição por queries, procure o gargalo.
- **Campo que só existe depois de persistir vai em `Ticket`, não em
  `NovoTicket`** — mesma ideia do `number` (AD-4).
- **Matriz de política na direção que obriga a decidir:**
  `Record<Capacidade, Papel[]>` faz capacidade nova sem política virar erro de
  compilação. A direção oposta a deixaria cair em "ninguém pode", silenciosa.
- **Asserção contra o catálogo do banco** quando a AC é sobre o schema —
  verificar o próprio `schema.ts` é verificar a si mesmo. E prove os dois
  lados: "não tem a coluna" passa com a migration inteira ausente.
- **Escrita que não aconteceu não vira auditoria** — registrar exclusão que
  falhou poluiria o Log com evento falso.

## Padrão estabelecido pela Story 1.6 — copiar

- **I/O externo fica fora da transação.** E-mail dentro dela prenderia a linha
  do Chamado e desfaria a escrita ao falhar.
- **Falha de I/O externo não propaga e não some**: vira registro estruturado
  via port `Logger`. Um `catch {}` vazio é violação direta do pilar Observável.
- **Log em `stderr`, nunca `stdout`** — o transporte MCP é stdio e o stdout
  carrega o protocolo.
- **Dependência opcional em `Deps` quando o caso de uso continua correto sem
  ela** (`notificacao?`), para não transformar conveniência em acoplamento.
- **Teste que inspeciona efeito através da própria biblioteca costuma mentir**:
  o primeiro teste do adapter de e-mail passaria sem enviar nada. Duble para
  capturar; a biblioteca real num teste separado, só para validar o formato.
- **Cobertura esconde o caminho de produção**: o `escrever` padrão do logger
  estava descoberto enquanto o injetado nos testes estava coberto.

## Sem cobertura automática

Os pilares **Observável** e **Performático** não têm gate determinístico e **nunca foram exercitados** por violação plantada. O review por IA os cobre por prompt, sem garantia. Detalhes em `QUALITY-GATE.md` §3.1.

`no-cross-adapter` e `no-circular` (dependency-cruiser) também seguem declaradas mas não exercitadas.

## Ambiente

- Node 24.19.0 (nvm, `default`) · pnpm 10.32.1 · Docker 28.0.1
- **`docker-compose` (com hífen)** — `docker compose` não existe nesta máquina
- Postgres local: `docker-compose up -d`, depois `pnpm db:migrate` com `DATABASE_URL`
- Secrets no repo: `CLAUDE_CODE_OAUTH_TOKEN`, `SONAR_TOKEN`

## Próximas ações

1. **Ligar o loop** para 1.3–1.9. Decisão de 2026-08-10: a 1.3 (auth) sai **sem** revisão humana no caminho. O RALPH-PROMPT ganhou uma seção específica sobre ela — o gate não entende autenticação e o `claude-review` nunca reprovou nada aqui:
   ```
   /ralph-loop:ralph-loop Leia e execute _bmad-output/RALPH-PROMPT.md --completion-promise 'EPIC 1 COMPLETO' --max-iterations 20
   ```
   O prompt do loop está em `_bmad-output/RALPH-PROMPT.md` — editável durante a execução, é relido a cada volta.

   **Exige sessão sem sandbox** (`--dangerously-skip-permissions`). Medido em 2026-08-10: sob sandbox, `docker`, `psql`/Postgres e `gh` estão todos bloqueados — ou seja, o loop não roda teste de integração, não abre PR e não mergeia. O `excludedCommands` do `.claude/settings.json` **não funciona**; `git` por https é o único que passa.
