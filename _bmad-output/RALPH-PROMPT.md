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
- Check vermelho que você não conseguiu corrigir em **3 tentativas**
- Qualquer coisa que exigiria contornar o gate
- Risco externo: gastar dinheiro, mexer com terceiros, apagar dado

**Decisão de produto ou arquitetura ausente NÃO é mais bloqueio.** Em
2026-08-10, depois de concordar com as recomendações nas Stories 1.3, 1.5 e
1.6, o dono do projeto delegou: *"vou concordar com as suas recomendações, não
precisa me perguntar"*. Então **decida pela melhor opção e siga** — registrando
a decisão e o porquê no PRD, na spine e no Dev Agent Record, marcada como
tomada por delegação. O que ele quer preservado é o registro, não a consulta.

**Como parar:** escreva o motivo em
`_bmad-output/implementation-artifacts/LOOP-BLOQUEADO.md` (o quê, por quê, o
que já foi feito, o que falta), rode `/ralph-loop:cancel-ralph` e encerre com
um resumo do bloqueio.

### 6. Atenção redobrada na Story 1.7

A 1.7 é **soft-delete base** (FR-23, AD-3): exclusão vira marcação, nunca
`DELETE`. É uma story curta com uma armadilha grande.

**A armadilha:** acrescentar `deleted_at` nas tabelas é a parte fácil. O que
decide se a story presta é **quem passa a filtrar** — e hoje há caminhos de
leitura que não sabem que a coluna existe (`buscarPorNumero`, a thread de
Comentários) e outros que virão no Epic 3 (fila, busca, resumo). Um filtro
esquecido devolve Chamado excluído; um filtro duplicado em SQL **e** no domínio
diverge no dia em que um dos dois mudar.

O projeto já resolveu esse tipo de problema quatro vezes, sempre do mesmo jeito:
**torne impossível esquecer, em vez de lembrar**. `NovoTicket` sem `number`
(1.1), handler de leitura sem caminho de escrita (1.2), `ChamadoBruto` que só
abre por `visivelPara` (1.4). Procure a forma equivalente aqui antes de sair
espalhando `WHERE deleted_at IS NULL`.

- **Excluído e inexistente devem ser indistinguíveis** para quem consulta —
  mesmo `TicketNaoEncontrado`, pelo motivo da 1.2 (Números são sequenciais).
- **Soft-delete não pode apagar rastro de auditoria** (FR-23 existe justamente
  para isso). `audit_entries` **não** ganha soft-delete: ela é append-only.
- **Quem pode excluir?** O epics não diz. Decida pela recomendação (Agente, não
  Solicitante, é o palpite coerente com FR-20) e registre — não bloqueie.
- **Verifique por mutação**: remova o filtro de excluídos e confirme que um
  teste reprova.

**O que a 1.6 acrescentou e vale daqui em diante:**

- **I/O externo fica fora da transação**, e sua falha não propaga nem some:
  vira registro estruturado no `Logger` (`platform/logging`).
- **Log em `stderr`**, nunca `stdout` — o transporte MCP é stdio.
- **Dependência opcional em `Deps`** quando o caso de uso continua correto sem
  ela (`notificacao?`), para não transformar conveniência em acoplamento.
- **Teste que inspeciona efeito através da própria biblioteca costuma mentir.**
  O primeiro teste do adapter de e-mail passaria sem enviar nada. Duble para
  capturar; a biblioteca real num teste separado, só para validar o formato.
- **Cobertura esconde o caminho de produção**: o `escrever` padrão do logger
  estava descoberto enquanto o injetado nos testes estava coberto.

**E o de sempre, que já pegou algo em todas as stories:**

- Atomicidade mora no **banco** (`UPDATE ... WHERE ... RETURNING`,
  `INSERT ... ON CONFLICT ... RETURNING`); teste de concorrência exige
  `Promise.all`.
- Erros só se separam quando a distinção **ajuda quem tem direito**.
- Decisão que se repete vira **tabela** com `switch` exaustivo.
- Relógio injetado; cobertura lida **por arquivo**; mutação obrigatória.

**Sobre o `claude-review`:** silêncio intermitente. Ficou mudo em #31–#34, falou
no #35 (com raciocínio específico, e levantou uma lacuna real de auditoria),
voltou a não comentar no #37. Confira antes de tratá-lo como opinião:

```bash
gh api repos/alexandrehst/servicedesk/pulls/NN/comments --jq 'length'
```

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
