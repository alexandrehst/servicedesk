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
                 →  rearma este prompt para a próxima story
```

O último passo não é enfeite: **você não lembra desta volta**. O que a story
mediu — armadilha nova, decisão tomada, modo de falha inédito do CI — só chega
à próxima se estiver escrito **aqui**, na seção 6, num PR `docs:` separado.
Toda story do Epic 1 foi fechada assim (PRs #36, #38, #40, #42).

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

#### Quando o `claude-review` falhar

**Re-run antes de investigar, sempre.** O check é instável e já falhou de duas
formas diferentes, ambas resolvidas por um re-run sem mudança nenhuma:

| Sintoma no log | Onde | O que era |
| --- | --- | --- |
| `error_max_turns` | PR #28 | morreu com 31 turns; re-run passou com 26. Teto subido para 60 no #29 |
| `subtype: success` **com** `is_error: true` | PR #41 | 42/60 turns e **16 `permission_denials`** — não é orçamento. O modelo insistiu em ferramenta fora da `allowedTools` até estourar. Re-run passou limpo |

O segundo engana: o log diz `success` na mesma linha em que diz `is_error`.
Olhe `num_turns` **e** `permission_denials_count` antes de concluir que é teto
de turnos — se `num_turns` está longe de 60, não é.

```bash
gh run rerun <run-id> --failed
# a causa fica no JSON do resultado, não no ##[error]:
gh api repos/alexandrehst/servicedesk/actions/jobs/<job-id>/logs \
  | grep -E 'num_turns|is_error|permission_denials'
```

Só trate como bloqueio se falhar **duas vezes**.

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

### 6. Atenção redobrada na Story 1.9 — a última do Epic 1

A 1.9 é **abrir Chamado por e-mail**: o Solicitante manda uma mensagem para o
endereço de suporte e um Chamado nasce, com Solicitante = remetente, Título =
assunto, Descrição = corpo — e ele recebe o e-mail de abertura da 1.6 de volta.

Tudo que veio antes tratou de entradas **autenticadas por token**. Esta é a
primeira escrita que chega de **fora**, por um canal que ninguém controla, e
onde a identidade vem de um cabeçalho. É o ponto mais exposto do Epic 1:

- **O `From` é falsificável.** Sem SPF/DKIM verificados, "e-mail corporativo
  reconhecido" é só uma string que combina com um domínio — qualquer um a
  escreve. A AC diz "a origem é tratada com segurança"; decida **como** se
  verifica o remetente e registre. Confiar na verificação do provedor de
  recepção é resposta legítima; confiar no `From` cru não é.
- **Passe pelo mesmo command.** A AC é explícita: o intake usa o command de
  FR-1 (AD-2), não um caminho paralelo. O adapter de e-mail traduz mensagem em
  entrada de comando e para por aí. Se você estiver inserindo em `tickets`
  daqui, parou no lugar errado — é o mesmo erro que a 1.8 evitou na leitura.
- **Qual é a `origin`?** `ORIGENS` tem `api` e `mcp`, e nenhuma das duas
  descreve um e-mail. Graças à 1.8 isso agora é **uma linha no domínio** —
  mas é uma decisão de AD-9, que existe para separar "humano via IA" de chamada
  nativa. Decida, registre na spine, e lembre que `origin` novo é filtro novo
  na 1.8.
- **Quem é o principal?** Não há token. A abertura precisa de uma identidade
  para a auditoria (AD-9) e para o `visivelPara` da 1.4 — derivada do
  remetente, não um usuário genérico "e-mail", senão o Chamado não é de
  ninguém e o Solicitante não vê o próprio.
- **E-mail é entregue mais de uma vez.** Retry de servidor é normal; sem
  deduplicação por `Message-ID`, um retry abre dois Chamados. É o caso de teste
  que ninguém escreve e que aparece em produção.
- **Remetente não reconhecido: recusa silenciosa.** Não responda ao endereço
  para avisar — bounce automático a remetente forjado transforma o suporte em
  amplificador de spam. Não criar e **não** responder.
- **O envio fica fora da transação** (decisão da 1.6): o Chamado é gravado,
  o e-mail sai depois. Falha de SMTP não pode desfazer abertura.

**A direção de entrada é decisão de infra em aberto** — IMAP com polling,
webhook de provedor, ou pasta. A 1.6 resolveu a saída com Nodemailer/SMTP; a
entrada não tem decisão registrada. **Decida pela melhor opção e registre**
(seção 5): o que importa é que o teste não dependa de rede — o adapter tem que
ser injetável como os outros.

**O que a 1.8 acrescentou e vale daqui em diante:**

- **A garantia decide onde o código mora.** `historicoVisivelPara` ficou em
  `visibilidade.ts`, não em `auditoria.ts`, porque a chave que abre o `Bruto` é
  um símbolo **não exportado** de lá. Mover a função exigiria um `abrirBruto`
  público — e aí qualquer leitura poderia pular a autorização. Quando o desenho
  empurrar o código para um módulo, **ouça**, não exporte a chave.
- **Recorte de consulta desce ao SQL; decisão de quem enxerga, não** (AD-8). O
  filtro de `origem` é o usuário pedindo um pedaço; a autorização é negócio. E
  prove com teste que pedir um recorte não contorna a autorização.
- **Conceito de negócio duplicado no contrato vai para o domínio** e o contrato
  deriva — foi o que aconteceu com `ORIGENS`, como a 1.4 fez com `PAPEIS`.
- **Desempate no `ORDER BY` não é paranoia:** a mutação e sua auditoria saem na
  **mesma transação**, então timestamps iguais são o caso comum.
- **Leitura não audita a si mesma** — o Log cresceria a cada revisão e quem
  procurasse o que a IA fez encontraria, sobretudo, gente procurando.

**E o de sempre:** atomicidade no banco com `Promise.all` no teste; erros só se
separam quando a distinção ajuda quem tem direito; relógio injetado; cobertura
lida **por arquivo**; mutação obrigatória com tabela no Dev Agent Record.

**Sobre o `claude-review`:** revisou de verdade três vezes em dez rodadas
(#35, #39 e #41), e nas três levantou algo que virou registro — a auditoria de
token no #35, o AD-7 no #39, a fronteira recorte/autorização no #41. Nas
outras, silêncio verde. Sempre confira:

```bash
gh api repos/alexandrehst/servicedesk/pulls/NN/comments --jq 'length'
```

### 7. Promessa de conclusão

Emita **`EPIC 1 COMPLETO`** — exatamente isso — somente quando **todas as nove
stories** do Epic 1 estiverem `done` no `sprint-status.yaml`, com PRs mergeados.

Se foi a **sua** volta que mergeou a 1.9, emita na mesma volta: com o Epic
fechado não há próxima story para a seguinte encontrar.

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
