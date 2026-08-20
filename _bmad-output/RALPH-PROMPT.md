# Prompt do loop — Epic 4 ✅ ENCERRADO

> **Este épico está completo** (PRs #77, #79, #81, #83) — e com ele o **MVP
> planejado**. As quatro stories estão `done`.
>
> **O corte do contrato NÃO está validado**, e o que falta não é código: o
> baseline do sistema contratado, o mês de operação em paralelo e a avaliação da
> checklist de paridade são do dono do projeto. Ver `RESUME.md` e
> `planning-artifacts/checklist-de-paridade.md`.
>
> **A próxima coisa a fazer é a story de bootstrap**: não há raiz de composição,
> e sem ela os dois e-mails do FR-18 e o agendador do intake continuam prontos e
> desligados — o sistema não roda fora dos testes. Ela depende da topologia de
> deploy, que segue `Deferred` na spine.
>
> O que está abaixo é o registro do que este épico mediu, para o próximo prompt
> aproveitar.

# Prompt do loop — Epic 4 (histórico)

Este arquivo é realimentado **inteiro** a cada iteração do `ralph-loop`. Você
não lembra das voltas anteriores: descubra o estado lendo os arquivos e o
histórico do git.

## Sua tarefa nesta volta

Avançar **uma** story do Epic 4, do início ao merge. Uma só. Não tente duas.

### 1. Descobrir onde parou

Leia `_bmad-output/implementation-artifacts/sprint-status.yaml`.

| Estado encontrado | O que fazer |
| --- | --- |
| Alguma story do Epic 4 em `in-progress` | Retome ela. Não comece outra |
| Alguma em `review` com PR aberto | Verifique os checks; se verdes, mergeie e conclua a volta |
| Alguma em `ready-for-dev` | Rode `bmad-dev-story` nela |
| Todas `done`, exceto `backlog` | Pegue a **primeira** `backlog` na ordem do arquivo |
| Todas as 4 stories do Epic 4 `done` | Encerre o épico (ver seção 7) |

**Os Epics 0, 1, 2 e 3 estão completos** e a **Story 4.1 está `done`** (PR #77).
A próxima é a **4.2** — a mais perigosa do épico.

**Atenção à ordem:** o `epics.md` apresenta a **4.4 antes da 4.3**; o
`sprint-status.yaml` está em ordem numérica, e **é ele que manda** (a nota está
escrita lá, do sprint planning de 2026-08-08). A sequência é 4.1 → 4.2 → 4.3 →
4.4 — e leia a seção 6 antes de chegar na **4.4**, que **não é completável por
código**.

Confira também `git status` e `gh pr list`: pode haver trabalho pendente de uma
volta interrompida. **PR de story aberto com checks verdes é a prioridade
máxima** — já aconteceu de uma volta morrer entre abrir o PR e mergear, e o PR
#52 ficou parado sete dias por causa disso. **Antes de escrever uma linha, rode
`gh pr list`.**

### 2. O ciclo de uma story

```
main atualizada  →  branch story/<chave>  →  bmad-create-story <n.n>
                 →  bmad-dev-story <arquivo>  →  PR  →  gate verde  →  merge
                 →  rearma este prompt para a próxima story
```

O último passo não é enfeite: **você não lembra desta volta**. O que a story
mediu — armadilha nova, decisão tomada, modo de falha inédito do CI — só chega
à próxima se estiver escrito **aqui**, na seção 6, num PR `docs:` separado.
Todas as vinte e uma stories dos Epics 1, 2 e 3 foram fechadas assim.

- Sempre parta da `main` atualizada (`git checkout main && git pull --ff-only`).
- Nome da branch: `story/<chave-da-story>`, igual à chave do sprint-status.
- Título do PR em **conventional commits**, minúsculas no subject.
- Corpo do PR **precisa** referenciar `Story <n>.<n>` — o job `traceability`
  reprova sem isso.
- **Antes de mergear, resolva as conversas do review por IA.** A proteção tem
  `required_conversation_resolution: true`: um comentário aberto **bloqueia o
  merge** mesmo com os nove checks verdes. O `claude-review` comenta em **todo**
  PR — inclusive para dizer que não encontrou violação.

  ```bash
  # lê o comentário ANTES de resolver: pode ser um achado real
  gh api graphql -f query='{repository(owner:"alexandrehst",name:"servicedesk"){pullRequest(number:NN){reviewThreads(first:20){nodes{id isResolved path line comments(first:1){nodes{body}}}}}}}'
  # resolve cada thread
  gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:"THREAD_ID"}){thread{isResolved}}}'
  ```

  **Leia antes de resolver.** Se o comentário apontar violação de pilar ou de
  AD, **corrija o código** — resolver a conversa sem corrigir é falso verde, e é
  o único resultado inaceitável neste projeto. No PR #43 os dois comentários
  eram achado real e viraram mudança de código; no #58 o achado era real mas
  fora do diff, e virou **registro** no Dev Agent Record e na spine. Achado que
  não vira código vira registro — nunca thread resolvida em silêncio.

- Merge com `gh pr merge <n> --squash --delete-branch`.

### 3. Regras não-negociáveis

**Nunca contorne o gate.** Se um check está vermelho, corrija a causa. Não use
`--admin`, não desative proteção, não force merge. O gateway existe justamente
para o modo de operação em que ninguém está olhando.

**Verifique o artefato, não o exit code.** Oito falhas silenciosas foram
encontradas neste projeto com configuração aparentando estar certa. Se um gate
passa, confirme que ele analisou algo — contagem de módulos, de testes,
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
nunca foi versionado: a referência morreu e a prova sumiu.

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
`.claude/settings.json` **não funciona** — foi verificado, o `docker ps`
continua negado. Não perca voltas tentando consertá-lo: não é a sua tarefa.

Como `gh` está na lista, isso vale para **abrir PR, ler checks, resolver thread
e mergear**. E como o Postgres está na lista, vale para `pnpm test` sempre que
houver teste de integração — que neste épico é **quase todo teste que importa**.

**Node e pnpm.** O shell cai em **Node 22** por padrão e o projeto exige 24 —
mas o `pnpm` **só existe no 22**. No 24 ele não está no PATH até você rodar
`corepack enable` (medido na Story 1.9). Prefixe assim:

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

**Docker parado deixou de ser bloqueio** (medido na 1.9): `open -a Docker` sobe
o daemon sem intervenção humana. Só bloqueie se ele não subir.

#### Quando o `security-deps` reprovar sem você ter tocado em dependência

**O Trivy baixa a base de CVE a cada execução: o mesmo lockfile passa hoje e
reprova amanhã.** Aconteceu em 2026-08-18 num PR **só de documentação** —
CVE-2026-40345 (HIGH) em `deepmerge-ts@7.1.5`, transitiva de produção via
`mailparser → html-to-text`. Não é regressão do seu diff, mas **bloqueia todo
PR do repositório** até ser corrigida, porque o check é required.

O caminho, quando não existe upgrade que resolva:

```jsonc
// package.json
"pnpm": { "overrides": { "<pacote>": "^<major novo>" } }
```

**Override de major exige prova de que o consumidor sobrevive** — `pnpm install`
sem erro não prova nada, porque a incompatibilidade aparece em execução:

1. veja **qual API** o consumidor usa (`grep` em `node_modules/.pnpm/<pkg>@<v>/…`);
2. rode um **smoke pelo caminho real**;
3. rode a suíte inteira.

Faça isso num PR `fix(deps):` **separado**, referenciando a Story que introduziu
a dependência, e mergeie-o **antes** do PR travado — depois rebaseie, porque a
proteção tem `strict: true`.

#### Quando o `claude-review` falhar — ou ficar mudo

**Re-run antes de investigar, sempre.** O check já falhou de duas formas, ambas
resolvidas por um re-run sem mudança nenhuma:

| Sintoma no log | Onde | O que era |
| --- | --- | --- |
| `error_max_turns` | PR #28 | morreu com 31 turns; re-run passou com 26. Teto subido para 60 |
| `subtype: success` **com** `is_error: true` | PR #41 | 42/60 turns e **16 `permission_denials`** — não é orçamento |

E há um terceiro modo, o mais perigoso: **executa, fica verde e não comenta
nada**. O silêncio tem assinatura clara — **menos de um minuto** de execução,
contra 4–6 minutos quando revisa de verdade.

**Verde curto não é revisão.** No PR #60 (o maior diff do Epic 2) a primeira
rodada passou em **35 s** sem comentar; o re-run levou **4m20s** e revisou de
verdade. No #46 o re-run depois do silêncio virou **achado real**. Sempre
confira e, no silêncio, re-execute:

> **Desde a correção do PR #66, ele fala — e fala muito.** A 4.2 levou **quatro
> achados em rodadas sucessivas**, todos reais, cada um no código escrito para
> corrigir o anterior. Isso muda o planejamento da volta: **conte com várias
> rodadas de review**, não com uma. E leia cada achado até o fim antes de
> corrigir — o quarto deles apontava um teste que existia, passava, e não
> provava nada.

```bash
gh api repos/alexandrehst/servicedesk/pulls/NN/comments --jq 'length'
gh run rerun <run-id> --job <job-id>
```

Só trate como bloqueio se falhar **duas vezes**.

### 5. Quando bloquear

Pare o loop e reporte. **Não pule a story bloqueada** — a 4.1 e a 4.2 são as
duas metades do mesmo problema (o dado sai e o dado entra), e a 4.2 depende de
decisões que a 4.1 toma sobre formato.

Situações de bloqueio:

- Docker que não sobe nem com `open -a Docker`
- Check vermelho que você não conseguiu corrigir em **3 tentativas**
- Qualquer coisa que exigiria contornar o gate
- Risco externo: gastar dinheiro, mexer com terceiros, apagar dado

**Decisão de produto ou arquitetura ausente NÃO é bloqueio.** Em 2026-08-10 o
dono do projeto delegou: *"vou concordar com as suas recomendações, não precisa
me perguntar"*. **Decida pela melhor opção e siga** — registrando a decisão e o
porquê no PRD, na spine e no Dev Agent Record, marcada como tomada por
delegação. O Epic 2 tomou dezenas de decisões assim.

**Como parar:** escreva o motivo em
`_bmad-output/implementation-artifacts/LOOP-BLOQUEADO.md` (o quê, por quê, o que
já foi feito, o que falta), rode `/ralph-loop:cancel-ralph` e encerre com um
resumo do bloqueio.

### 6. O Epic 4 é o épico do DADO QUE VEM DE FORA — leia isto antes de escrever a story

O Epic 1 abriu e leu **um** Chamado. O Epic 2 fez o Chamado **mudar**. O Epic 3
fez o trabalho **se enxergar**. O Epic 4 tira e põe dado: export CSV (4.1),
import CSV do sistema antigo (4.2), soft-delete completo (4.3) e o corte de
baseline (4.4).

É o épico que **fecha o contrato de R$240k/ano** — sem migrar o histórico, não
há paridade a comprovar.

#### O risco muda pela terceira vez, e agora é o pior

| Épico | Errar significa |
| --- | --- |
| Epic 1 | vazar **um** Chamado |
| Epic 2 | **corromper estado** de um Chamado |
| Epic 3 | vazar Chamado alheio **numa lista** |
| **Epic 4** | **corromper a base inteira de uma vez** — com dado que nunca passou pelo domínio |

Duas coisas são novas e as duas são perigosas:

1. **O dado vem de FORA.** Todo Chamado do sistema já nasceu por `abrirTicket`,
   que valida Título, Descrição e Categoria. Uma linha de CSV não passou por
   nada. Se o import escrever direto no banco, ele cria Chamado que a **própria
   abertura recusaria** — e o resto do sistema passa a lidar com dado que ele
   supõe impossível.
2. **O export sai do alcance do sistema.** Um CSV gerado não tem
   `filaVisivelPara` para corrigir depois. O que saiu, saiu — e vai para o
   e-mail, o Drive, o WhatsApp de alguém.

#### Story 4.1 — o export tem DOIS problemas que a Fila não tinha

**a) O teto de 100 torna o export inútil.** `LIMITE_MAXIMO` (3.1) existe para
não estourar o contexto da IA. Um export de 100 linhas não migra nada e não
prova independência de fornecedor. **Decida como o export escapa do teto** — e
registre: outro limite, cursor, streaming, ou uma tool separada com contrato
próprio. O que **não** vale é reusar o teto e chamar de export.

**b) CSV é formato hostil, e isso é segurança, não estética.** Três armadilhas
conhecidas, e as três precisam de teste:

- **campo com vírgula, aspas ou quebra de linha** — sem escape correto, o
  arquivo abre com colunas trocadas, e a Descrição de um Chamado vira outro
  campo;
- **CSV injection**: um campo que começa com `=`, `+`, `-` ou `@` é interpretado
  como **fórmula** pelo Excel e pelo Sheets. Um Chamado cujo título seja
  `=cmd|...` vira execução na máquina de quem abre o arquivo. Quem digita o
  título é o Solicitante — **é entrada de usuário indo para um executor**;
- **encoding**: acento em UTF-8 sem BOM abre torto no Excel em português.

**c) A autorização continua sendo a do Epic 3.** `escopoDeLeitura` vale; um
Solicitante que exporte recebe os dele. E decida explicitamente: **Comentário
Interno entra no CSV?** Se entrar, o arquivo carrega conversa do time para fora
do sistema — e um export do Agente vira o vazamento que a 3.4 evitou no `LIKE`.

#### O que a 4.1 mediu

- **Onde há um executor no fim do caminho, o dado precisa ser tratado ali.** O
  Título vem do Solicitante e vira **fórmula** no Excel se começar com `=`, `+`,
  `-`, `@`, tab ou CR. O campo atravessa o sistema inteiro sem que ninguém o
  trate — o domínio não sabe o que é CSV, e o CSV não sabe de onde veio o campo.
  **Vale para o import também:** o que sai de um CSV também vem de fora.
- **Uma story pode ter DUAS seguranças independentes.** A do formato (o arquivo
  mente sobre as colunas, ou executa) e a do conteúdo (o arquivo carrega o que a
  pessoa não podia ver). Um CSV perfeitamente escapado pode vazar a base
  inteira. **Pergunte quantas são, antes de achar que testou.**
- **Duplicação some quando alguém aponta; a garantia contra divergência futura
  só existe com a extração.** O `claude-review` (PR #77) pegou a tradução
  escopo→SQL copiada entre Fila e export — no mesmo PR em que eu generalizava o
  gargalo no domínio. Depois de extrair `condicoesDaFila`, as mutações de escopo
  passaram a reprovar **o dobro** de testes, porque atingem os dois de uma vez.
  **A FR-24 exige que o export cubra os filtros da Fila: isso tem de valer por
  construção, não por disciplina.**
- **As duas sondas do Epic 3 continuam valendo, e eu de novo as escrevi depois
  do fato** (sexta e sétima ocorrência): `temMais` vem do SQL e o domínio não o
  recalcula; a asserção sobre **o que a query pediu** pega o escopo que o
  gargalo corrigiria. **Escreva as duas antes de rodar mutação.**
- **O limite que importa nem sempre é o do contrato.** O teto do export é 5.000,
  mas o limite real é o **contexto da IA** — o CSV volta como texto na resposta
  da tool. Registrado como não provado, junto com o fato de que exportar a base
  inteira pede um canal que não existe.

#### O que a 4.2 mediu — quatro achados do `claude-review` numa story só

Nunca houve tantos num PR deste projeto, e nenhum foi ruído. Vale entender o
padrão: **os quatro apareceram no código que eu escrevi para corrigir o
anterior.** Corrigir cria superfície nova, e a superfície nova não tinha teste.

**a) O laço caro.** O `for` sequencial fazia 5 viagens ao Postgres por linha,
uma esperando a outra — 25 mil viagens em fila num arquivo de 5.000 linhas,
dentro de uma chamada da tool. Lotes concorrentes resolvem; o tamanho é
conservador porque **lote maior que o pool de conexões não acelera**, só troca
espera pelo banco por espera por conexão.

**b) Paralelizar quebra o que a ordem garantia.** Duas linhas com a mesma chave
no mesmo lote disputam o índice, e quem vence passa a depender de qual transação
comita primeiro — quando quem migra espera que a **primeira ocorrência do
arquivo** seja a que entra. E o relatório: `Promise.all` preserva a ordem, então
quase tudo já sai ordenado — a exceção é a lista preenchida em **duas fases**,
onde a linha 5 aparecia antes da linha 2. **A primeira mutação que escrevi para
a ordenação sobreviveu**, e a saída não foi remover a guarda: foi achar o caso
em que ela guarda.

**c) `Promise.all` reintroduz o "tudo ou nada" pela porta dos fundos.** Ele
rejeita na primeira falha: um timeout no meio derruba a função inteira, os lotes
seguintes nunca rodam, e quem chamou recebe erro **sem relatório nenhum**. Pior,
ele não cancela as irmãs — as chamadas em voo continuam e podem **comitar depois
do erro**, com escrita real e auditada que não aparece em relatório algum.
`allSettled`, e a falha vira uma categoria própria: **falha ≠ rejeitada**, porque
a ação que cada uma pede é diferente (corrija o arquivo × rode de novo).

**d) O erro do driver carrega os PARÂMETROS.** Medido contra o Postgres real:
`DrizzleQueryError.message` traz `Failed query: ... params: <Título>,<Descrição>,
...,<e-mail>`. Repassar `erro.message` para log ou resposta vaza dado do
Solicitante (AD-9). **Só o SQLSTATE atravessa**, traduzido por tabela nossa —
filtrar texto por padrão seria perder por construção, porque a lista de
mensagens que vazam não é enumerável.

#### As três lições da 4.2 que atravessam para as próximas stories

**1. "Afirmação não é teste" ganhou uma camada — e é a mais perigosa.** Já
tínhamos o caso do Dev Agent Record (3.6) e ganhamos o do comentário no código
("nenhuma rejeição escapa", ao lado do `Promise.all` que a contradizia). Mas o
quarto achado é pior: **o teste existia e passava.** Ele usava um duble que
lançava `new Error('timeout')`, string sintética que nunca teria o formato real.

> **Um duble prova o contrato que você imaginou; só o caminho real prova o
> contrato que existe.** Onde a garantia é sobre o **formato de um dado que vem
> de fora do nosso código** — mensagem de erro de driver, resposta de API,
> arquivo de terceiro —, o duble é a própria ilusão. Use integração.

**2. Toda mudança no código é mudança nos alvos de mutação.** O alvo evaporou em
**três rodadas seguidas** desta story (quatro ocorrências), todas pela minha
própria refatoração — não pelo formatador, como nas duas vezes anteriores do
projeto. Na terceira parei de consertar o sintoma: **`mutacoes-NN.py` agora
confere todos os alvos ANTES de rodar** e se recusa a começar, separando
"SCRIPT DESATUALIZADO" de "MUTAÇÃO SOBREVIVENTE" — que eram problemas diferentes
reportados do mesmo jeito. Copie essa conferência para o script da sua story: o
erro passa a aparecer em um segundo em vez de quarenta minutos.

**3. Script de mutação interrompido DEIXA O REPOSITÓRIO MUTADO.** Aconteceu
aqui: a mutação do AD-4 — `nextval` trocado pelo número do arquivo — ficou
aplicada em `ticket-repository.ts` depois de o processo ser morto. O `finally`
restaura, mas `finally` não roda quando o processo morre. **Confira `git status`
depois de rodar mutação**: é a única coisa entre isso e um commit que inverte a
espinha da arquitetura.

#### O que a 4.2 deixou pronto para a 4.3

- **`Logger` chega ao adapter MCP.** `McpDeps` ganhou `logger`, então qualquer
  command novo pode registrar sem mudar a montagem.
- **A distinção `erro` × `aviso` do port tem precedente concreto**: linha
  rejeitada num import é o caso normal e **não** vira erro de log, porque isso
  treinaria quem monitora a ignorar erro.
- **Capacidade `importa`** em `papeis.ts` — a mais restrita do sistema, e o
  exemplo de que **a story pode precisar de autorização que nenhuma AC pediu**:
  importar é a única escrita em que o autor e o dono do registro são pessoas
  diferentes de propósito. A 4.3 tem o mesmo cheiro (excluir Usuário).

#### O que a 4.3 mediu — três achados do `claude-review`, e o padrão se repetiu

Como na 4.2, **cada achado apareceu no código escrito para o anterior**, e o
terceiro foi uma aprovação explícita. Vale ler o que cada um ensinou:

**a) O Log dizia que algo aconteceu, sem dizer com o quê.** O pedido de
confirmação gravava `ticket_number`, `de` e `para` — e para excluir Usuário os
três são nulos. Um pedido que **nunca se confirma** (token expira, ou quem
decide diz não) deixava no Log uma tentativa sem dizer **quem** esteve perto de
ser excluído: a ação mais destrutiva, no caso em que nada mais ficou
registrado. **Ao conferir o entorno apareceu um segundo, pior**, que o achado
não mencionava: a *execução* da exclusão de Comentário gravava o Chamado mas não
qual Comentário.

> **Quando uma story acrescenta um tipo de objeto, todo registro que
> identificava "o objeto" por um campo antigo vira candidato a buraco.** Procure
> onde o identificador implícito deixou de bastar.

**b) O contrato de saída dizia `numero`; o command devolvia `number`.** Correção
de uma linha — mas a pergunta boa é **por que nenhum teste pegou**: os testes de
command não passam pelo `registerTool`, e os do adapter comparavam a saída com
um literal escrito à mão que repetia o mesmo erro. **Os dois lados concordavam
entre si e discordavam do contrato publicado.**

> O teste que fecha isso **parseia o que o handler devolve com o schema que a
> tool publica**. Existe agora para as três exclusões; **estenda-o para a tool
> que a sua story criar.**

#### As duas lições da 4.3 que atravessam

**1. Sobrevivente de mutação não tem um diagnóstico só — tem três.** A 4.3
terminou com três, e cada uma pedia uma ação diferente:

| Sobrevivente | O que era | O que fazer |
| --- | --- | --- |
| "excluir Usuário já excluído registra de novo" | **defeito real**, escondido porque o gargalo do command impedia o caso de chegar ao adapter | teste que chama o **repositório direto** — o port é público |
| "trocar `excluiComentario` por `excluiChamado`" | as duas capacidades têm hoje a mesma política; a separação é uma aposta **futura** | **remover a mutação**, com o porquê |
| "distinguir inexistente de já-excluído" | os dois convergem no **mesmo ramo por construção** | **remover**, e registrar que a garantia é estrutural |

**A do meio e a última não são preguiça: são mutações mal formuladas.** Mas a
primeira era real, e o sintoma foi o mesmo — por isso **não trate as três do
mesmo jeito**. Pergunte, para cada uma: *existe um estado do sistema em que esta
mutação muda o resultado?* Se existe e nenhum teste o alcança, falta teste. Se
não existe, a mutação não representa defeito nenhum.

**2. Garantia estrutural é mais forte que garantia testada.** "Inexistente" e
"já excluído" dão a mesma resposta porque o filtro faz o excluído chegar como
`null` — não porque alguém escreveu um teste comparando as mensagens. **Quando
puder tornar o defeito impossível em vez de detectável, faça** — e registre,
porque quem vier depois vai procurar o teste e não achar. O projeto já usou a
ideia três vezes: `NovoTicket` sem `number` (AD-4), o símbolo privado da
visibilidade (AD-8), e agora esta.

#### O que a 4.3 deixou pronto para a 4.4

- **`AlvoDeConfirmacao`** (`chamado:N`, `comentario:N/M`, `usuario:email`) — um
  vocabulário só para "o objeto exato", usado pelo escopo do token E pela coluna
  `alvo` do Log.
- **`audit_entries.ticket_number` aceita nulo**, e há precedente de ação que não
  é sobre um Chamado.
- **As três exclusões têm tool**, e a 1.7 não tem mais dívida em aberto — exceto
  as duas que ela mesma mandou registrar em vez de resolver: **não há restauração
  e não há política de retenção**, ambas agora no PRD.

#### O que a 4.4 mediu — e por que o Epic 4 NÃO pode ser declarado completo

A 4.4 entregou o que era entregável: a tool `relatorio_de_operacao` e a
**checklist de paridade** (`planning-artifacts/checklist-de-paridade.md`).
**O que ela não entregou continua não entregue**, e não por falha:

| Falta | Por quê | Quem |
| --- | --- | --- |
| Baseline do sistema contratado | exige acesso ao software do fornecedor | dono do projeto |
| ~1 mês de operação em paralelo | o tempo precisa passar | dono do projeto |
| Avaliar a checklist | julgamento sobre o mundo real | dono do projeto + Agentes |
| Lista de tipos de Chamado do contratado | nunca foi levantada | dono do projeto |

**A promessa `EPIC 4 COMPLETO` não é verdadeira enquanto isso não acontecer** —
e nada disso acontece dentro do loop. Ver a seção 7.

#### A lição da 4.4, que é sobre MÉTRICA e vale para qualquer story futura

A mesma armadilha apareceu **três vezes na mesma story**, com roupas diferentes:

1. **a média sozinha** esconderia que um Chamado esquecido arrasta o número
   (por isso mediana **e** média — há teste com mediana 3,5h e média 100h+);
2. **a reabertura contada pelo primeiro `resolvido`** faria a métrica melhorar
   quando o atendimento piora;
3. **o limite superior no período** transformaria "resolvido depois" em "sem
   resolução", melhorando a média do período.

> **Numa métrica de decisão, desconfie de toda mudança que MELHORA o número.**
> Ela quase sempre está descartando o caso que mais importa. As três acima
> pareciam simplificações razoáveis, e as três teriam feito o sistema parecer
> melhor do que é — na conta que decide um contrato de R$240k/ano.

E a regra irmã: **o que o sistema não consegue medir precisa estar escrito**,
com dono e critério. A tabela "medível daqui / não medível daqui" no Dev Agent
Record da 4.4 é a entrega intelectual daquela story — mais do que o SQL.

#### Sobreviventes de mutação: a 4.4 encontrou os quatro tipos

A 4.3 registrou que sobrevivente não tem um diagnóstico só. A 4.4 confirmou com
uma rodada que teve os quatro:

| Tipo | Exemplo da 4.4 | Ação |
| --- | --- | --- |
| **falta teste** | filtro de período nos autores (o SM-5 inflaria) | escrever a sonda |
| **equivalente por dados** | `min`→`max` num grupo de uma linha só | remover, com o porquê |
| **equivalente por outra guarda** | `JOIN`→`LEFT JOIN`, neutralizado pelo `WHERE` de sanidade | remover, com o porquê |
| **equivalente por política** | `veHistorico`→`veChamadoDeTerceiro`, mesma política hoje | remover, com o porquê |

**E uma quinta, que é a mais instrutiva:** ao justificar a remoção de uma delas,
escrevi **no próprio script** que outra mutação "morre". Ela sobreviveu na
rodada seguinte. Quarta aparição de *"afirmação não é teste"* no projeto — e
desta vez a afirmação estava no arquivo que existe para verificar afirmações.

#### Use o que os Epics 1–3 deixaram prontos

| Use | Onde | O que carrega |
| --- | --- | --- |
| `escopoDeLeitura` / `filaVisivelPara` | `domain/visibilidade.ts` | a autorização de leitura em conjunto |
| `buscarFilaBruta` | port | filtros, ordem e escopo já resolvidos |
| `abrirTicket` | `domain/ticket.ts` | a validação que o import **precisa** atravessar |
| `criarComAuditoria` | port | escrita + auditoria na mesma transação (AD-3) |
| `numero_legado` | `tickets` (3.4) | criada vazia para o import preencher |
| `criarHandler` / `criarLeitor` | `adapters/mcp/server.ts` | autenticar → limitar → executar |

#### O que os Epics 2 e 3 mediram, e atravessa para cá

- **A pergunta que abre a story é "o mecanismo já existe?"** — três stories
  seguidas (2.5, 2.6, 3.6) descobriram que sim.
- **Guardrail que o próprio chamador preenche não é guardrail** (2.6).
- **Duas camadas se mascaram mutuamente** (3.5): cada uma precisa de um teste
  que desligue a outra. **Escreva o teste que chama o repositório direto desde o
  início** — foi ignorado uma vez e custou uma rodada inteira de mutação.
- **Procure a SONDA**: o campo que atravessa a camada de baixo sem ser refeito
  em cima (`temMais` na 3.3, o `limite` na 3.5). No import, os candidatos são
  **a contagem de linhas aceitas e o relatório de rejeitadas**.
- **Duble que ignora entrada esconde mutação** (3.6, quinta ocorrência).
- **Dado que entra por caminho que o SDK não valida precisa do contrato aplicado
  à mão** (3.6) — e **um CSV é exatamente esse caminho**.
- **Afirmação no Dev Agent Record não substitui teste** (3.6): se escrever que
  algo é recusado, exercite a recusa.
- **Índice/plano só se prova com volume e dado realista** (3.4).
- **Teste de ordenação passou por acaso quatro vezes** (1.2, 2.2, 3.1, 3.5):
  monte os dados para a ordem certa **divergir** da trivial.
- **Cobertura lida por arquivo**, nunca só o total.
- **Migration nova entra em `drizzle/migrations/`** — a próxima é a **0013**.
- **`psql -f` sai com código 0 mesmo com SQL quebrado** — exige
  `-v ON_ERROR_STOP=1`.

**Sobre o `claude-review`:** ficou mudo do PR #61 ao #65 por defeito de
configuração (não recebia o diff), corrigido no #66 — e voltou a achar coisa
real: no #74 apontou que o `numero` da URI não passava pelo contrato Zod, e
estava certo. **Leia o resumo do job** (turnos, negações, duração) antes de
tratar o verde como revisão: menos de um minuto é silêncio.

### 7. Fim do épico

Quando as **quatro** stories do Epic 4 estiverem `done` no `sprint-status.yaml`,
com PRs mergeados:

1. Marque `epic-4: done` e atualize o `RESUME.md`, num PR `docs:`.
2. Deixe no topo deste arquivo o aviso de épico encerrado.
3. Rode `/ralph-loop:cancel-ralph` e encerre com o resumo do épico.

**Verifique antes de encerrar** — as quatro `done`, `epic-4: done`, árvore
limpa, nenhum PR de story aberto. E **atenção especial à 4.4**: ela só é `done`
se o que ficou fora do alcance do código estiver **escrito** como pendência de
quem opera, não escondido.

**Este é o último épico do MVP.** Ao fechá-lo, o `RESUME.md` deve dizer o que
falta para o corte do contrato acontecer de verdade — incluindo as dívidas que
atravessaram todos os épicos: a **story de bootstrap** (não há raiz de
composição; os dois e-mails do FR-18 e o agendador do intake estão prontos e
desligados) e a **topologia de deploy**, que segue `Deferred` na spine.

## Contexto do projeto

- **Spine:** `_bmad-output/planning-artifacts/architecture/architecture-ServiceDesk-2026-08-08/ARCHITECTURE-SPINE.md` — 11 ADs, hexagonal
- **Contrato de qualidade:** `_bmad-output/planning-artifacts/QUALITY-GATE.md`
- **Épicos:** `_bmad-output/planning-artifacts/epics.md`
- **Ponto de retomada:** `_bmad-output/RESUME.md`

**Padrão a copiar, por tipo de trabalho:**

| Você vai escrever | Copie |
| --- | --- |
| Query de leitura | `queries/ver-chamado.ts` (1.2) — e note que ele lê **um** |
| Leitura com recorte que vai ao SQL | `queries/ver-historico.ts` + o port (1.8) — o precedente do "recorte de consulta" |
| Regra de domínio com política | `papeis.ts` + `visibilidade.ts` (1.4) |
| Tabela de decisão no domínio | `acoes-irreversiveis.ts` (2.6), `transicoes.ts` (2.2) |
| Contrato Zod | `contracts/ver-chamado.ts` (1.2) |
| Tool MCP | `criarHandler` em `adapters/mcp/server.ts` (2.3) |
| Teste de integração com Postgres real | `persistence/acao-irreversivel.test.ts` (2.6) |
| Migration com índice | `0006_soft_delete.sql` (índice parcial, com o porquê escrito) |
| Leitura em conjunto com escopo | `queries/buscar-chamados.ts` + `escopoDeLeitura` (3.1) — o export parte daqui |
| Escrita que valida no domínio | `commands/abrir-chamado.ts` (1.1) — o import **precisa** passar por `abrirTicket` |
| Escrita em lote com auditoria | não existe: a 4.2 é a primeira |

**Estado do código em 2026-08-19:** 846 testes, cobertura 97,6%, 12 migrations
aplicadas, **Epics 0 a 3 completos** e a Story 4.1 `done`. O Chamado
nasce, muda, é resolvido e encerrado; a Fila se enxerga — filtrada, com recortes,
paginada e ordenada —, o resumo diz a carga, e a busca acha por texto em Título,
Descrição, Comentários e número do sistema anterior; a sugestão de parecidos
evita duplicado na abertura; e o MCP expõe Resources e um Prompt de triagem.

**O que a 4.2 encontra pronto:** `platform/csv/csv.ts` (geração — a **leitura**
ainda não existe), `numero_legado` (coluna vazia, indexada), `abrirTicket` para
validar cada linha, `condicoesDaFila` compartilhada, e `criarComAuditoria` para
escrever com auditoria na mesma transação. **O que não encontra:** parser de
CSV, escrita em lote, `users` sem `deleted_at` e nenhum comando que exclua
Comentário ou Usuário.

**Dependência de deploy nova (3.4):** a extensão `pg_trgm` precisa existir no
banco. `CREATE EXTENSION` exige privilégio elevado — some junto com a topologia
`Deferred`.

**Gate ativo:** nove required checks na `main` — `lint`, `typecheck`, `test`,
`arch`, `traceability`, `security-deps`, `security-secrets`, `sonar`,
`claude-review`. `enforce_admins` está ligado: não há como mergear com check
vermelho, nem para você. Mais `required_conversation_resolution: true`.

**Sem cobertura automática:** **Observável** segue sem gate determinístico e
nunca exercitado. O **Performático** deixou de ser teórico na 3.1: dois testes
de `EXPLAIN` com 5.000 linhas afirmam `Index Scan` e não `Seq Scan`, e a
violação foi plantada à mão (`DROP INDEX` → o teste reprova). **Copie o padrão**
em toda story que criar consulta nova — sem volume o `EXPLAIN` não prova nada,
porque com 20 linhas o planejador varre a tabela de qualquer jeito, e
`enable_seqscan = off` testaria o `SET`, não o índice.

**PRs do Dependabot abertos — não mergeie sem ler o `RESUME.md`:** #7
(TypeScript 7.0) e #55 (`@types/node` 26) estão marcados para **rejeitar**, com
motivo registrado; #16 (github-actions) e #54 (imapflow) são para avaliar. Eles
não bloqueiam o Epic 3 e não são a sua tarefa.

**Dívidas conhecidas, herdadas dos Epics 1 e 2** (não são desta volta, mas se
esbarrar, decida e registre):

- **Ninguém monta o servidor MCP.** Não há raiz de composição: os handlers são
  criados com deps que ninguém fornece, então os dois e-mails do FR-18 e o
  agendador do intake (1.9) estão **prontos e desligados**. Depende da topologia
  de deploy, `Deferred` na spine — e é trabalho de uma story de bootstrap que
  ainda não existe no backlog.
- Ações que **não** são de Chamado (login, emissão/revogação de token de
  máquina) não estão auditadas: `audit_entries.ticket_number` é obrigatório.
- Nenhuma retenção/expurgo do Log nem de `confirmacoes`; as duas crescem para
  sempre.
