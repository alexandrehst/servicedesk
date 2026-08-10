# Prompt do loop — Epic 1

Este arquivo é realimentado **inteiro** a cada iteração do `ralph-loop`. Você
não lembra das voltas anteriores: descubra o estado lendo os arquivos e o
histórico do git.

## Sua tarefa nesta volta

Avançar **uma** story do Epic 1, do início ao merge. Uma só. Não tente duas.

### 1. Descobrir onde parou

Leia `_bmad-output/implementation-artifacts/sprint-status.yaml`.

| Estado encontrado | O que fazer |
| --- | --- |
| Alguma story do Epic 1 em `in-progress` | Retome ela. Não comece outra |
| Alguma em `review` com PR aberto | Verifique os checks; se verdes, mergeie e conclua a volta |
| Alguma em `ready-for-dev` | Rode `bmad-dev-story` nela |
| Todas `done`, exceto `backlog` | Pegue a **primeira** `backlog` na ordem do arquivo |
| Todas as 9 stories do Epic 1 `done` | Emita a promessa de conclusão (ver abaixo) |

Confira também `git status` e `gh pr list`: pode haver trabalho pendente de
uma volta interrompida.

### 2. O ciclo de uma story

```
main atualizada  →  branch story/<chave>  →  bmad-create-story <n.n>
                 →  bmad-dev-story <arquivo>  →  PR  →  gate verde  →  merge
```

- Sempre parta da `main` atualizada (`git checkout main && git pull --ff-only`).
- Nome da branch: `story/<chave-da-story>`, igual à chave do sprint-status.
- Título do PR em **conventional commits**, minúsculas no subject.
- Corpo do PR **precisa** referenciar `Story <n>.<n>` — o job `traceability`
  reprova sem isso.
- **Antes de mergear, resolva as conversas do review por IA.** A proteção tem
  `required_conversation_resolution: true`: um comentário aberto bloqueia o
  merge mesmo com os nove checks verdes. O `claude-review` comenta em **todo**
  PR — inclusive para dizer que não encontrou violação.

  ```bash
  # lê o comentário ANTES de resolver: pode ser um achado real
  gh api graphql -f query='{repository(owner:"alexandrehst",name:"servicedesk"){pullRequest(number:NN){reviewThreads(first:20){nodes{id isResolved path line comments(first:1){nodes{body}}}}}}}'
  # resolve cada thread
  gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:"THREAD_ID"}){thread{isResolved}}}'
  ```

  **Leia antes de resolver.** Se o comentário apontar violação de pilar ou de
  AD, **corrija o código** — resolver a conversa sem corrigir é falso verde, e
  é o único resultado inaceitável neste projeto.

- Merge com `gh pr merge <n> --squash --delete-branch`.

### 3. Regras não-negociáveis

**Nunca contorne o gate.** Se um check está vermelho, corrija a causa. Não
use `--admin`, não desative proteção, não force merge. O gateway existe
justamente para o modo de operação em que ninguém está olhando.

**Verifique o artefato, não o exit code.** Sete falhas silenciosas foram
encontradas neste projeto com configuração aparentando estar certa. Se um
gate passa, confirme que ele analisou algo — contagem de módulos, de testes,
percentual de cobertura. Verde sem alvo não é verde.

**Registre o que não foi provado.** Se uma AC não pôde ser verificada, escreva
isso no Dev Agent Record e **não** marque a story como `done`. Falso verde é o
único resultado inaceitável.

**Commit lista arquivos explicitamente.** Nunca `git add -A` — já apagou
registro de execução neste projeto.

**Subject do commit em minúsculas.** `subject-case` do commitlint reprova
`QUALITY-GATE` e afins no título.

### 4. Pré-condições de ambiente

#### O sandbox bloqueia quase tudo que você precisa — leia antes de rodar comando

Medido na Story 1.2. **Não descubra isso de novo por tentativa e erro:**

| Comando | Sob sandbox | Como rodar |
| --- | --- | --- |
| `git` (https) | ✅ funciona | normal |
| `docker`, `docker-compose` | ❌ socket negado | `dangerouslyDisableSandbox: true` |
| `psql`, e **qualquer** teste que abra conexão com o Postgres | ❌ TCP negado | `dangerouslyDisableSandbox: true` |
| `gh` | ❌ `x509: OSStatus -26276` | `dangerouslyDisableSandbox: true` |

O `excludedCommands: ["docker", "docker-compose"]` que está no
`.claude/settings.json` **não funciona** — foi verificado, o `docker ps` continua
negado. Não confie nele e não perca voltas tentando consertá-lo: não é a sua
tarefa.

Como `gh` está na lista, isso vale para **abrir PR, ler checks, resolver thread
e mergear**. E como o Postgres está na lista, vale para `pnpm test` sempre que
houver teste de integração.

**Node:** o shell cai em **Node 22** por padrão e o projeto exige 24. Prefixe:

```bash
source ~/.nvm/nvm.sh && nvm use 24 && export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
```

#### Postgres no ar

```bash
docker ps >/dev/null 2>&1 || echo "daemon parado"
docker-compose up -d          # `docker compose` (sem hífen) NÃO existe nesta máquina
until docker exec servicedesk-postgres-1 pg_isready -U servicedesk >/dev/null 2>&1; do sleep 2; done
pnpm db:migrate               # aplica TODAS as migrations, em ordem
```

Se o daemon do Docker estiver parado, **isso é bloqueio** — veja a seção 5.

#### Quando o `claude-review` falhar por `error_max_turns`

**Re-run antes de investigar.** O teto é 60 desde o PR #29, mas o check já se
mostrou instável na margem: no PR #28 morreu com 31 turns e o re-run, sem
mudança nenhuma, passou com 26. Só trate como bloqueio se falhar duas vezes.

```bash
gh run rerun <run-id> --failed
```

### 5. Quando bloquear

Pare o loop e reporte. **Não pule a story bloqueada** — as stories do Epic 1
são sequenciais e a seguinte depende do padrão que a anterior estabelece.

Situações de bloqueio:

- Docker parado (exige ação humana)
- Uma AC exige decisão de produto ou de arquitetura que não está no PRD nem na
  spine
- Check vermelho que você não conseguiu corrigir em **3 tentativas**
- Qualquer coisa que exigiria contornar o gate

**Como parar:** escreva o motivo em
`_bmad-output/implementation-artifacts/LOOP-BLOQUEADO.md` (o quê, por quê, o
que já foi feito, o que falta), rode `/ralph-loop:cancel-ralph` e encerre com
um resumo do bloqueio.

### 6. Atenção redobrada na Story 1.5

A 1.5 é **segurança do adapter MCP**: token escopado por identidade e rate
limit (FR-21, AD-9). Ela fecha a fronteira que a 1.3 abriu e a 1.4 endureceu.

**Verifique primeiro se ela está bloqueada.** Duas coisas que a AC exige podem
não estar decididas em lugar nenhum:

1. **O que é o "token escopado" do cliente MCP.** A 1.3 criou sessão de 8 h
   nascida de magic link — feita para humano. Um cliente MCP autônomo pode
   precisar de credencial de máquina, com prazo e ciclo de vida próprios. Se o
   PRD e a spine não disserem qual dos dois, **é bloqueio** (seção 5): não
   invente política de credencial.
2. **Os números do rate limit.** FR-21 pede rate limit sem dizer quantas
   chamadas em qual janela, nem o que acontece ao estourar. Limite é decisão de
   produto — 8 agentes e ~200–400 chamados/mês é o contexto, mas o número é do
   dono.

Se estiver decidido, o resto segue os padrões já estabelecidos:

- **O rate limit é do adapter, não do domínio.** Ele protege o ponto de
  entrada; a regra de negócio não muda por causa dele.
- **A identidade — nunca o nome da tool — é o autor auditado** (AD-9). Já vale
  desde a 1.1; a 1.5 precisa manter isso com o token de máquina.
- **Erro de limite estourado não é erro de credencial.** São coisas
  diferentes e o cliente precisa distinguir para saber se adianta tentar de
  novo. Decida deliberadamente e **escreva no Dev Agent Record**.
- **Verifique por mutação**: afrouxe o limite e confirme que um teste reprova.
- **Relógio injetado** para testar a janela — nada de `sleep`.

**Três lacunas registradas na 1.3 pertencem a esta story ou vêm junto dela:**
`solicitarLink` sem rate limit (spam de caixa de entrada), links de login
válidos simultâneos sem invalidação do anterior, e `login_links`/`sessions`
crescendo sem expurgo.

**Não existe composition root.** O projeto nunca teve entrypoint: nem
`McpDeps.principal` (até a 1.2) nem `McpDeps.autenticar` (1.3) estão ligados a
um servidor em execução. Se a 1.5 precisar de um, isso é trabalho dela — e
então passa a haver um lugar onde o token do cliente é lido de verdade.

**O gate não cobre nada disso, e o revisor está mudo.** O `claude-review` passou
verde sem comentar nada em **três PRs seguidos** — #31 (duas execuções), #32 e
#33 —, incluindo as duas stories de fronteira de segurança do Epic 1. Confira
antes de tratá-lo como opinião:

```bash
gh api repos/alexandrehst/servicedesk/pulls/NN/comments --jq 'length'
```

Zero e check verde significa que ninguém revisou. Siga — o gate está
legitimamente verde — mas **registre no Dev Agent Record** e não conte com ele.

**O que as 1.3 e 1.4 estabeleceram e vale daqui em diante:**

- **Torne impossível o que hoje é lembrado.** Três vezes seguidas o projeto
  trocou disciplina por garantia do compilador: `NovoTicket` sem `number`
  (1.1), handler de leitura sem caminho de escrita (1.2) e o `ChamadoBruto`
  que só abre por `visivelPara` (1.4). Prove isso com `@ts-expect-error` — se
  o vazamento virar compilável, o `typecheck` reprova com `TS2578`.
- Decisão que se repete vira **tabela** (`domain/papeis.ts`), com `switch`
  exaustivo: caso novo sem política é erro de compilação.
- Um erro só para modos de falha que não devem ser distinguíveis, com teste
  que **compara as mensagens entre si** e varre as palavras que vazariam.
- Garantia de concorrência mora no **banco** (`UPDATE ... WHERE ... RETURNING`).
- Relógio injetado; `fileParallelism: false` porque os testes de integração
  dividem um Postgres.
- **Contrato Zod sem teste fica com 0%** e a média global esconde.

Se qualquer AC exigir decisão que não está no PRD nem na spine, **isso é
bloqueio** — seção 5. Já aconteceu na 1.3 (FR-19/Q7) e a decisão veio do dono.

### 7. Promessa de conclusão

Emita **`EPIC 1 COMPLETO`** — exatamente isso — somente quando **todas as nove
stories** do Epic 1 estiverem `done` no `sprint-status.yaml`, com PRs mergeados.

Não emita para escapar de um bloqueio. Bloqueio se resolve com a seção 5.

## Contexto do projeto

- **Spine:** `_bmad-output/planning-artifacts/architecture/architecture-ServiceDesk-2026-08-08/ARCHITECTURE-SPINE.md` — 11 ADs, hexagonal
- **Contrato de qualidade:** `_bmad-output/planning-artifacts/QUALITY-GATE.md`
- **Épicos:** `_bmad-output/planning-artifacts/epics.md`
- **Padrão a copiar:** a Story 1.1 (`1-1-abrir-um-chamado-via-mcp-tracer-bullet.md`)
  estabeleceu o modelo — domínio puro, contratos Zod como fonte única, port com
  auditoria embutida, transação real. A 1.2
  (`1-2-ver-um-chamado-via-mcp.md`) acrescentou o lado da leitura, e a 1.3
  (`1-3-autenticacao-e-identidade.md`) trocou o principal de configuração por
  autenticação real. Siga os três.

**O que a 1.2 ensinou e vale para todas as próximas:**

- **Cobertura global esconde arquivo descoberto.** 87,5% passava o gate de 80%
  com uma função inteira sem nenhum teste e o adapter MCP em 72%. Leia a tabela
  **por arquivo** do `pnpm test:coverage`, não só o total.
- **`psql -f` sai com código 0 mesmo com SQL quebrado** — exige
  `-v ON_ERROR_STOP=1`. Oitava falha silenciosa catalogada no projeto.
- **`await promessa.catch((e) => e as Error)` não devolve `Error`**: devolve a
  união com a saída de sucesso, e `.message` não existe nela. Use um helper que
  estreite com `ehDomainError` e **falhe quando não houver erro**.
- **Teste de ordenação insere fora de ordem.** Em ordem, ele passa pela ordem
  física do heap mesmo sem `ORDER BY`.
- **O adapter devolve dado bruto; quem filtra por papel é o domínio** (AD-8).
- Migration nova entra em `drizzle/migrations/` e o `pnpm db:migrate` já itera
  sobre todas — **não** referencie arquivo por nome.

**Gate ativo:** nove required checks na `main` — `lint`, `typecheck`, `test`,
`arch`, `traceability`, `security-deps`, `security-secrets`, `sonar`,
`claude-review`. `enforce_admins` está ligado: não há como mergear com check
vermelho, nem para você.

**Sem cobertura automática:** os pilares **Observável** e **Performático** não
têm gate determinístico e nunca foram exercitados por violação plantada. O
review por IA os cobre por prompt, sem garantia. Preste atenção neles ao
escrever código: erro engolido, log ausente onde a falha seria invisível, N+1,
I/O desnecessário.
