# Prompt do loop — Epic 2

Este arquivo é realimentado **inteiro** a cada iteração do `ralph-loop`. Você
não lembra das voltas anteriores: descubra o estado lendo os arquivos e o
histórico do git.

## Sua tarefa nesta volta

Avançar **uma** story do Epic 2, do início ao merge. Uma só. Não tente duas.

### 1. Descobrir onde parou

Leia `_bmad-output/implementation-artifacts/sprint-status.yaml`.

| Estado encontrado | O que fazer |
| --- | --- |
| Alguma story do Epic 2 em `in-progress` | Retome ela. Não comece outra |
| Alguma em `review` com PR aberto | Verifique os checks; se verdes, mergeie e conclua a volta |
| Alguma em `ready-for-dev` | Rode `bmad-dev-story` nela |
| Todas `done`, exceto `backlog` | Pegue a **primeira** `backlog` na ordem do arquivo |
| Todas as 6 stories do Epic 2 `done` | Encerre o épico (ver seção 7) |

**2.1, 2.2 e 2.3 estão `done`** (PRs #46, #48 e #50). A próxima é a **2.4**.

Confira também `git status` e `gh pr list`: pode haver trabalho pendente de
uma volta interrompida. **PR de story aberto com checks verdes é a prioridade
máxima** — foi assim que a volta anterior começou duas vezes.

O Epic 1 fechou em 2026-08-11 com as nove stories `done` (PRs #31 a #44).

### 2. O ciclo de uma story

```
main atualizada  →  branch story/<chave>  →  bmad-create-story <n.n>
                 →  bmad-dev-story <arquivo>  →  PR  →  gate verde  →  merge
                 →  rearma este prompt para a próxima story
```

O último passo não é enfeite: **você não lembra desta volta**. O que a story
mediu — armadilha nova, decisão tomada, modo de falha inédito do CI — só chega
à próxima se estiver escrito **aqui**, na seção 6, num PR `docs:` separado.
Todas as nove stories do Epic 1 foram fechadas assim (PRs #36, #38, #40, #42).

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
  é o único resultado inaceitável neste projeto. No PR #43 os dois comentários
  eram achado real e os dois viraram mudança de código; **depois de corrigir,
  confirme no código que o problema sumiu** antes de resolver a thread.

- Merge com `gh pr merge <n> --squash --delete-branch`.

### 3. Regras não-negociáveis

**Nunca contorne o gate.** Se um check está vermelho, corrija a causa. Não
use `--admin`, não desative proteção, não force merge. O gateway existe
justamente para o modo de operação em que ninguém está olhando.

**Verifique o artefato, não o exit code.** Oito falhas silenciosas foram
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

**Versione o script de mutação** em `scratchpad/mutacoes-<n><n>.py` e
**commite**. A Story 1.8 citou `mutacoes-18.py` no Dev Agent Record e o arquivo
nunca foi versionado: a referência morreu e a prova sumiu. A 1.9 corrigiu o
padrão.

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

**Node e pnpm.** O shell cai em **Node 22** por padrão e o projeto exige 24 —
mas o `pnpm` **só existe no 22**. No 24 ele não está no PATH até você rodar
`corepack enable` (medido na Story 1.9; o `corepack` baixa o pnpm 10.32.1 na
primeira vez). Prefixe assim:

```bash
source ~/.nvm/nvm.sh && nvm use 24 && corepack enable \
  && export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
```

#### Postgres no ar

```bash
docker ps >/dev/null 2>&1 || open -a Docker   # sobe o Docker Desktop; leva ~10s
until docker ps >/dev/null 2>&1; do sleep 5; done
docker-compose up -d          # `docker compose` (sem hífen) NÃO existe nesta máquina
until docker exec servicedesk-postgres-1 pg_isready -U servicedesk >/dev/null 2>&1; do sleep 2; done
pnpm db:migrate               # aplica TODAS as migrations, em ordem
```

**Docker parado deixou de ser bloqueio** (medido na Story 1.9): `open -a Docker`
sobe o daemon sem intervenção humana. Só bloqueie se ele não subir.

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

Pare o loop e reporte. **Não pule a story bloqueada** — as stories do Epic 2
são sequenciais e a seguinte depende do padrão que a anterior estabelece. Isso
vale mais aqui do que no Epic 1: a 2.1 define a forma de **toda** mutação (ver
seção 6).

Situações de bloqueio:

- Docker que não sobe nem com `open -a Docker`
- Check vermelho que você não conseguiu corrigir em **3 tentativas**
- Qualquer coisa que exigiria contornar o gate
- Risco externo: gastar dinheiro, mexer com terceiros, apagar dado

**Decisão de produto ou arquitetura ausente NÃO é bloqueio.** Em 2026-08-10,
depois de concordar com as recomendações nas Stories 1.3, 1.5 e 1.6, o dono do
projeto delegou: *"vou concordar com as suas recomendações, não precisa me
perguntar"*. Então **decida pela melhor opção e siga** — registrando a decisão
e o porquê no PRD, na spine e no Dev Agent Record, marcada como tomada por
delegação. O que ele quer preservado é o registro, não a consulta. A Story 1.9
tomou seis decisões assim.

**Como parar:** escreva o motivo em
`_bmad-output/implementation-artifacts/LOOP-BLOQUEADO.md` (o quê, por quê, o
que já foi feito, o que falta), rode `/ralph-loop:cancel-ralph` e encerre com
um resumo do bloqueio.

### 6. O Epic 2 é o épico da ESCRITA — leia isto antes de escrever a story

O Epic 1 construiu um sistema que **abre** e **lê** Chamado. O Epic 2 muda
Chamado que já existe, seis vezes seguidas: comentar (2.1), status (2.2),
dono (2.3), prioridade (2.4), resolver (2.5), ações irreversíveis (2.6).

Isso muda o risco. No Epic 1, errar em uma leitura vazava dado. Aqui, errar
numa mutação **corrompe estado** — e o Log de auditoria passa a registrar a
corrupção como fato.

#### O padrão de mutação já existe: copie `excluirChamado`

`src/application/commands/excluir-chamado.ts` (Story 1.7) é o modelo. Ele faz,
nesta ordem:

```
buscarPorNumero  →  visivelPara(autor, bruto)  →  pode(autor.role, 'capacidade')
                 →  repositorio.<acao>ComAuditoria(...)   ← mutação + auditoria
                                                            na MESMA transação
```

Duas coisas nessa ordem não são estilo:

- **`visivelPara` antes de `pode`.** Quem não pode ver o Chamado recebe
  `TicketNaoEncontrado` (indistinguível de inexistente); quem vê mas não pode
  agir recebe `SemPermissao`. Esconder existência de quem já a conhece não
  protege nada. **Não inverta.**
- **`visivelPara` já descarta excluído** (1.7) e alheio (1.4). Toda mutação do
  Epic 2 herda isso de graça — desde que passe por lá. Se você escrever
  `if (ticket.deletedAt)` ou `if (ticket.requester === ...)` numa mutação nova,
  parou no lugar errado.

#### O AD-10 existe agora — e toda mutação nova precisa usá-lo

A 2.2 construiu o mecanismo, e ele **não é opcional** para 2.3, 2.4 e 2.5:

```sql
UPDATE tickets SET <campo> = $novo, version = version + 1
 WHERE number = $n AND version = $esperada AND deleted_at IS NULL
RETURNING version
```

**Não copie: use.** A Story 2.3 extraiu os três blocos que 2.2 e 2.3
duplicavam, e o Sonar reprovou o PR até que isso fosse feito:

| Use | Onde | O que carrega |
| --- | --- | --- |
| `mutarCampoComAuditoria` | `adapters/persistence/ticket-repository.ts` | o `UPDATE` condicional + auditoria transacional, com as três garantias |
| `conflitoOuSumico` | `application/commands/mutacao-versionada.ts` | a releitura que separa `Conflict` de `TicketNaoEncontrado` |
| `criarHandler` | `adapters/mcp/server.ts` | autenticar → limitar → executar → traduzir erro |

Uma mutação nova de campo custa **poucas linhas**: um `set` no adapter, uma
ação em `ACOES`, uma capacidade na matriz, o contrato e o command. Se a sua
story estiver reescrevendo `db.transaction` ou o `try/catch` do handler, pare —
você está duplicando o que já existe, e o Sonar vai reprovar.

O que essas funções garantem, e que uma cópia perderia:

- **A checagem vive no `WHERE`**, não em JavaScript. Ler-comparar-escrever
  deixa a janela que o AD-10 fecha.
- **`deleted_at IS NULL` no mesmo `UPDATE`** — defesa contra o Chamado ser
  excluído entre a leitura do command e a escrita. Teste isso chamando o
  **repositório direto**: pelo command não prova nada, porque `visivelPara`
  barra antes (foi uma mutação sobrevivente na 2.2).
- **Zero linhas afetadas tem duas causas** — `conflitoOuSumico` relê para
  distinguir. Sem isso, a IA tenta para sempre num Chamado excluído.
- **A versão esperada vem da ENTRADA**, nunca do Chamado que o command acabou
  de ler. Usar a lida faria o command estar sempre "certo", e não haveria
  conflito nenhum. Essa parte **é sua**: está no command, não no helper.
- **`versao` é obrigatória no contrato** (AD-6), e sai em `ver_chamado`.

Escrita **aditiva** (Comentário) não versiona — refinamento da 2.1, já na spine.

#### O que cada story encontra faltando

Verificado no código em 2026-08-11 — **não descubra de novo**:

| Story | O que **não existe** hoje |
| --- | --- |
| ~~2.1~~ | ✅ `done` (PR #46) — command, capacidade `comentaInterno`, vocabulário do Log |
| ~~2.2~~ | ✅ `done` (PR #48) — máquina de estados, `version`, `Conflict`, par `de`/`para` |
| ~~2.3~~ | ✅ `done` (PR #50) — atribuição, e a dívida do `assignee` paga |
| 2.3 | Nada de `assignee` além da coluna (que existe e é sempre `null`). Reatribuição precisa registrar **Dono anterior e novo** no audit — e `audit_entries` hoje só tem `acao`, `autor`, `origin`: não há onde guardar "de X para Y" |
| 2.4 | **A Prioridade inteira.** Não existe coluna `priority` em `tickets`, nem tipo `Prioridade` no domínio. Precisa de migration **e** de lista fechada (`Baixa..Crítica`), no padrão de `STATUS`/`CATEGORIAS`/`ORIGENS`/`PAPEIS` |
| 2.5 | `enviarChamadoResolvido` no port `NotificadorDeChamado` — que hoje só tem `enviarChamadoAberto`. O e-mail traz **quem resolveu e o tempo total** (exige `criadoEm` e o instante da resolução) |
| 2.6 | **AD-7 inteiro.** Não existe `ConfirmationRequired`, nem sinal de confirmação em nenhum contrato |

**A dívida do Log foi paga na 2.2.** `audit_entries` tem `de` e `para` (texto,
nulos quando a ação não muda valor), e o histórico da 1.8 já os expõe. A 2.3
grava o Dono anterior e o novo nessas colunas — **não** invente estrutura nova,
e **não** preencha com `'nenhum'` quando não houver par.

**Acrescentar ação nova agora exige uma linha em `ACOES`** (`domain/auditoria.ts`,
criado na 2.1): o vocabulário do Log é lista fechada, e o compilador cobra.

#### Seis tools MCP novas, e um esquecimento fácil

Cada handler novo em `adapters/mcp/server.ts` precisa, **nesta ordem**:

```ts
const autor: Principal = { ...(await autenticar()), origin: 'mcp' }
await limitarChamadas(autor.identity)   // ← o esquecido
const saida = await executar(input, autor)
```

Autenticar antes de agir (senão a auditoria fica sem autor) e limitar antes de
executar (senão a escrita acontece e o limite não serve para nada numa IA em
loop). São seis chances de esquecer o `limitarChamadas` por copiar-e-colar.

#### Autorização: a matriz obriga a decidir

`Capacidade` em `domain/papeis.ts` tem quatro entradas hoje, e o
`Record<Capacidade, Papel[]>` é deliberado: **capacidade nova sem política é
erro de compilação**. Cada story do Epic 2 acrescenta pelo menos uma
(`comentaInterno`, `mudaStatus`, `atribui`, `mudaPrioridade`, `resolve`,
`fechaOuCancela`, `reabre`). Decida quem pode e escreva o porquê no comentário,
como as quatro existentes.

Atenção na 2.1: o Solicitante **pode** comentar o próprio Chamado, mas só
público. Isso é uma capacidade (`comentaInterno`) mais a posse — não é
"Solicitante não comenta".

#### Ações irreversíveis (2.6): a exigência vive no domínio

AD-7: *"a exigência vive no domínio, não no adapter — todo ponto de entrada a
herda"*. Se a confirmação for validada no handler MCP, o adapter HTTP (e a UI
da Fase 1.5) vão pular o human-in-the-loop. É o mesmo erro que o AD-8 evita
para autorização, e o `claude-review` já pegou exatamente esse padrão duas
vezes (PR #39 e #43).

**Verifique por mutação:** remova a checagem de confirmação e confirme que um
teste reprova. Se nenhum reprovar, o guardrail não existe.

#### O que a 2.3 mediu

- **O SonarCloud reprova duplicação em código novo (>3%), e vale ouvi-lo.** No
  PR #50 ele apontou 9%: eu tinha copiado o padrão da 2.2 em vez de extraí-lo.
  A duplicação não era estilo — era risco, porque cada cópia é uma chance de
  perder uma garantia em silêncio. Depois de extrair os três blocos, a
  duplicação foi a **0,0%** e as mutações ficaram mais fortes: "esquecer o
  `limitarChamadas`" passou a reprovar 8 testes em vez de 1, porque agora há um
  único lugar onde esse esquecimento é possível.
- **`claude-review` e Sonar são gates complementares.** No mesmo PR, o review
  por IA revisou de verdade (4m34s) e aprovou a semântica; quem pegou o
  problema foi o Sonar, olhando forma. Nenhum dos dois substitui o outro.
- **Coluna que ninguém lê é dívida silenciosa.** `assignee` existia desde a 1.1
  e o adapter devolvia `null` **fixo** — e o tipo do domínio era literalmente
  `readonly assignee: null`. Ninguém notou porque nada atribuía Dono. **Ao
  mexer num campo que já existe no schema, verifique se ele é de fato lido**, e
  prove com um teste que escreve direto no banco.
- **Capacidade se nomeia pela pergunta, não pelo papel que hoje a responde.**
  Usei `atribuiChamado` para validar o destinatário e estava errado: "pode
  distribuir trabalho" e "pode receber trabalho" coincidem hoje por acidente de
  só existir um papel de atendimento. Separar custou uma linha.

#### O que a 2.2 mediu

- **Mutação sobrevivente pode apontar redundância, não lacuna.** Uma guarda
  `de !== para` na máquina de estados era inalcançável (nenhuma tabela lista o
  próprio estado como destino). O certo não foi reforçar o teste: foi **remover
  o código morto** e mover a invariante para um teste sobre os **dados**. Se a
  mutação não muda comportamento observável, o problema pode ser o código.
- **Teste no nível errado não prova a garantia.** O `deleted_at IS NULL` do
  `UPDATE` protege a janela entre leitura e escrita; testá-lo pelo command é
  inútil porque `visivelPara` barra antes. Foi preciso chamar o **repositório
  direto**.
- **Cuidado com teste de corrida que fixa timing.** O erro da perdedora não é
  determinístico — `Conflict` ou `TransicaoInvalida`, conforme o instante da
  leitura. Teste a **invariante** (uma escrita só), não o código do erro; e
  rode três vezes antes de confiar.
- **Separe tabelas de política quando o guardrail depender disso.** As
  transições irreversíveis ficaram numa tabela própria para que a tool genérica
  não vire porta dos fundos da 2.6 — com um teste garantindo que as duas não se
  sobrepõem.

#### O que a 2.1 mediu — a primeira mutação do épico

- **O adapter grava, não interpreta.** O `claude-review` (PR #46) pegou o
  adapter Postgres decidindo o rótulo de auditoria, ramificando sobre
  `novo.internal` dentro do INSERT. O argumento que convence é a comparação com
  os métodos irmãos: `criarComAuditoria` grava `'abrir_chamado'` e
  `excluirComAuditoria` grava `'excluir_chamado'` — **sempre string estática,
  decidida por qual operação foi chamada**. Se o seu método novo ramificar
  sobre um campo de negócio para escolher o que gravar, a decisão está no lugar
  errado: resolva no domínio e passe pronto.
- **Capacidade se nomeia pelo que é negado, não pelo que é feito.**
  `comentaInterno` — e não `comentaChamado` — porque o Solicitante **pode**
  comentar o próprio Chamado. A posse quem resolve é `visivelPara`; a matriz
  decide só o recorte. Nomear pela ação inteira teria tirado dele a única
  escrita que ele tem.
- **Recusa explícita, nunca rebaixamento silencioso.** Pedido de Comentário
  Interno por quem não pode devolve `SemPermissao`. Rebaixar para público
  "para ser gentil" faria o texto aparecer para quem o autor quis esconder.
- **Mutação sobrevivente não é sinônimo de teste fraco.** Duas sobreviveram na
  2.1 e as duas eram **inócuas**: uma usava `?? autor.identity` num campo que
  nenhum teste preenche (o código mutado era idêntico ao original), a outra
  mexia numa guarda que nunca dispara. **Antes de reforçar o teste, verifique
  se a mutação muda comportamento observável.** É a segunda vez que isso
  aparece — a 1.9 já tinha registrado.
- **Duração do `claude-review` é o sinal de que ele revisou.** No PR #46 ele
  passou verde em **44s** sem comentar nada e, no commit seguinte, levou
  **4m50s** e achou a violação acima. Revisão de verdade leva 4–5 min (#41:
  4m06s, #43: 4m38s). **Verde curto não é evidência de revisão** — confira
  sempre `/pulls/NN/comments`.

#### O que o Epic 1 mediu e continua valendo

- **Procure o gargalo antes de espalhar condição.** O filtro de excluídos
  entrou em `visivelPara` (1.4) e toda leitura o herdou de graça (1.7).
- **A garantia decide onde o código mora.** A chave que abre o `Bruto` é um
  símbolo não exportado de `visibilidade.ts`; funções que precisam dela vão
  até lá, e a chave **não** é exportada (1.8).
- **Decisão sobre confiança fica no domínio, não no adapter.** O adapter
  entrega dado bruto — cabeçalho, linha do banco — e o domínio julga. Foi o
  achado do `claude-review` no PR #43.
- **Conceito de negócio duplicado no contrato sobe para o domínio** e o
  contrato deriva (`PAPEIS` na 1.4, `ORIGENS` na 1.8, `normalizarEmail` na 1.9).
- **Escrita que não aconteceu não vira auditoria** (1.7): se o `UPDATE` não
  afetou linha, não grave registro de auditoria.
- **Cobertura lida por arquivo**, nunca só o total: 92% global escondia um
  arquivo em 0% na 1.9, e o gate de 80% teria passado.
- **Mutação obrigatória, com tabela no Dev Agent Record.** A 1.9 aplicou 17.
  E cuidado com mutação que *parece* testar mas não testa: trocar a ordem de
  dois `if` só é detectável se existir um caso que os distinga.
- **Teste de ordenação insere fora de ordem**; `ORDER BY` com desempate,
  porque a mutação e sua auditoria têm o mesmo timestamp.
- **Erros só se separam quando a distinção ajuda quem tem direito** — e o
  relógio é sempre injetado.
- **`await promessa.catch((e) => e as Error)` não devolve `Error`.** Use um
  helper que estreite com `ehDomainError` e **falhe quando não houver erro**.
- **`psql -f` sai com código 0 mesmo com SQL quebrado** — exige
  `-v ON_ERROR_STOP=1`.
- Migration nova entra em `drizzle/migrations/` e o `pnpm db:migrate` já itera
  sobre todas — **não** referencie arquivo por nome.

**Sobre o `claude-review`:** revisou de verdade seis vezes em dezessete rodadas
(#35, #39, #41, #43, #46, #50). O silêncio tem assinatura clara: **menos de um
minuto** de execução, contra 4–5 minutos quando revisa. Não conte com ele;
conte com as mutações — e note que no #50 quem pegou o problema real foi o
**Sonar**, não ele. Sempre confira:

```bash
gh api repos/alexandrehst/servicedesk/pulls/NN/comments --jq 'length'
```

### 7. Fim do épico

Quando as **seis** stories do Epic 2 estiverem `done` no `sprint-status.yaml`,
com PRs mergeados:

1. Marque `epic-2: done` e atualize o `RESUME.md`, num PR `docs:` (como o #44).
2. Rode `/ralph-loop:cancel-ralph` e encerre com o resumo do épico.

**Verifique antes de encerrar** — as seis `done`, `epic-2: done`, árvore limpa,
nenhum PR de story aberto (os do Dependabot não contam; ver abaixo). Não
encerre para escapar de um bloqueio: bloqueio se resolve com a seção 5.

## Contexto do projeto

- **Spine:** `_bmad-output/planning-artifacts/architecture/architecture-ServiceDesk-2026-08-08/ARCHITECTURE-SPINE.md` — 11 ADs, hexagonal
- **Contrato de qualidade:** `_bmad-output/planning-artifacts/QUALITY-GATE.md`
- **Épicos:** `_bmad-output/planning-artifacts/epics.md`
- **Ponto de retomada:** `_bmad-output/RESUME.md`

**Padrão a copiar, por tipo de trabalho:**

| Você vai escrever | Copie |
| --- | --- |
| Command de mutação de campo | `atribuir-chamado.ts` (2.3) — usa os três helpers |
| Command de mutação simples | `excluir-chamado.ts` (1.7), `comentar-chamado.ts` (2.1) |
| Regra de domínio com política | `papeis.ts` + `visibilidade.ts` (1.4) |
| Contrato Zod | `contracts/abrir-chamado.ts` (1.1) |
| Port com auditoria transacional | `ports/ticket-repository.ts` (1.1, 1.7) |
| Adapter de e-mail | `adapters/email/smtp.ts` (1.6) |
| Teste de integração com Postgres real | `persistence/soft-delete.test.ts` (1.7) |
| Caso de uso que orquestra sem escrever | `abrir-chamado-por-email.ts` (1.9) |

**Estado do código em 2026-08-11:** 518 testes, cobertura 98,6%, 8 migrations
aplicadas, Epic 0 e Epic 1 completos, Epic 2 com 2.1, 2.2 e 2.3 `done`.

**Gate ativo:** nove required checks na `main` — `lint`, `typecheck`, `test`,
`arch`, `traceability`, `security-deps`, `security-secrets`, `sonar`,
`claude-review`. `enforce_admins` está ligado: não há como mergear com check
vermelho, nem para você.

**Sem cobertura automática:** os pilares **Observável** e **Performático** não
têm gate determinístico e nunca foram exercitados por violação plantada. O
review por IA os cobre por prompt, sem garantia — e no PR #43 foi ele quem
achou o N+1. Preste atenção neles ao escrever código: erro engolido, log
ausente onde a falha seria invisível, N+1, I/O desnecessário.

**PRs do Dependabot abertos — não mergeie sem ler o `RESUME.md`:** #7
(TypeScript 7.0) e #8 (`@types/node` 26) estão marcados para **rejeitar**, com
motivo registrado; #16 (github-actions) é para avaliar. Eles não bloqueiam o
Epic 2 e não são a sua tarefa.

**Dívidas conhecidas, herdadas do Epic 1** (não são desta volta, mas apareceram
nas ACs do Epic 2 — se esbarrar, decida e registre):

- Ações que **não** são de Chamado (login, emissão/revogação de token de
  máquina) não estão auditadas: `audit_entries.ticket_number` é obrigatório.
  Decisão da 1.8: tabela separada, quando houver necessidade real.
- O intake por e-mail (1.9) está **pronto e desligado** — nenhum agendador
  chama `criarVarredura`, porque a topologia de deploy segue `Deferred`.
- Nenhuma retenção/expurgo do Log; ele cresce para sempre.
