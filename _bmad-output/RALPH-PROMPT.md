# Prompt do loop — Epic 4

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

**Os Epics 0, 1, 2 e 3 estão completos** (PRs #1 a #75). Nenhuma story do Epic 4
começou: a primeira é a **4.1**.

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

#### Story 4.2 — o import é o inverso, e mais perigoso

**a) Cada linha passa pelo DOMÍNIO, não pelo SQL.** `abrirTicket` valida e
normaliza; `ehCategoria` recusa categoria inventada; `PRIORIDADES` é lista
fechada. Um import que faça `INSERT` direto contorna tudo isso — e a 2.4 já
registrou o que acontece quando uma coluna nasce com valor que o domínio não
conhece.

**b) O Número é da sequence; o número antigo vai para `numero_legado`.** O AD-4
é explícito: o Numero é gerado pela persistência, **nunca** pelo chamador.
`numero_legado` **já existe** (criada vazia na 3.4, `text`, indexada, e a busca
já a cobre — foi feita exatamente para isto). Preservar o número antigo como
**referência**, não como identidade.

**c) A AC pede relatório de erros SEM abortar o lote.** Isso conflita com
"transação única": ou tudo entra, ou nada. **Decida e registre** — o caminho
provável é transação **por linha**, com um relatório do que foi rejeitado e por
quê. E responda: o que acontece com a linha 5.000 quando a 4.999 falha?

**d) Quem é o AUTOR de um Chamado importado?** O AD-3 exige autor e origem em
toda escrita, e `audit_entries.autor` é obrigatório. O Chamado veio de um
sistema que não tem identidade aqui. **Decida**: uma identidade de import
(`import@sistema`), o Solicitante do CSV se ele existir no cadastro, ou os dois
— e o que fazer quando o e-mail do CSV não estiver em `users`.

**e) Rodar duas vezes duplica tudo?** `numero_legado` **não é UNIQUE** hoje. Um
import repetido cria a base inteira de novo. **Decida**: índice único, checagem
prévia, ou aceitar e registrar — mas não descubra isso em produção.

**f) Não há biblioteca de CSV no projeto.** Escrever o parser à mão é onde as
armadilhas da 4.1 aparecem de novo, agora na leitura (aspas escapadas, campo com
quebra de linha). **Dependência nova exige aprovação** (seção 5 do fluxo de
dev): se for o caminho, pare e pergunte. Se for parser próprio, **documente o
subconjunto de CSV que ele aceita** e teste os casos hostis.

**g) O formato real do fornecedor é desconhecido** — a AC diz isso. Não invente
um formato "provável" e o chame de pronto: defina o **contrato de entrada** que
você aceita (colunas, tipos, obrigatórias), e registre que o mapeamento do CSV
real virá quando o arquivo existir.

#### Story 4.3 — soft-delete completo, e o que falta é concreto

Verificado no código em 2026-08-19:

- `tickets.deleted_at` ✅ (1.7) e `comments.deleted_at` ✅ (existe no schema
  desde a 1.2, e `filtrarComentarios` já o respeita);
- **`users` NÃO tem `deleted_at`** — é o buraco da FR-23;
- **não existe comando para excluir Comentário nem Usuário**: só
  `excluir-chamado.ts`. A coluna de Comentário existe e nada a escreve.

Excluir Usuário toca coisas que as outras exclusões não tocam: login (1.3),
atribuição (2.3 — o Dono de um Chamado aberto), o escopo de leitura (3.1) e o
cadastro que a 2.3 consulta. **Decida o que acontece com o Chamado de um
Solicitante excluído e com o Chamado atribuído a um Agente excluído** — e note
que `audit_entries` **não** recebe soft-delete (decisão da 1.7: é append-only, e
uma coluna de exclusão ali permitiria apagar a prova).

#### Story 4.4 — NÃO é completável por código, e isso precisa estar claro

A AC pede medir o baseline do sistema atual e **rodar em paralelo por ~1 mês**.
O loop não roda um mês, não tem acesso ao software contratado e não avalia
checklist operacional. **Não finja que fez.**

O que é entregável por código, e é o que a story deve entregar:

- **o instrumento de medição** — a consulta/relatório que calcula tempo médio de
  resolução a partir do Log (`audit_entries` já tem `mudar_status` com o par
  `de`/`para` e `registrado_em`, desde a 2.2);
- **a checklist de paridade** como documento versionado, com os critérios do
  SM-1/SM-5 em forma verificável.

O que **não** é: os números do sistema antigo e o mês de operação em paralelo.
Isso é do dono do projeto. **Entregue o instrumento, marque a story como
parcialmente entregue no Dev Agent Record, e diga exatamente o que falta e quem
faz.** Se preferir tratar como bloqueio, use a seção 5 — mas não marque `done`
o que não foi feito.

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

**Estado do código em 2026-08-19:** 798 testes, cobertura 97,7%, 12 migrations
aplicadas, **Epics 0, 1, 2 e 3 completos**. O Chamado
nasce, muda, é resolvido e encerrado; a Fila se enxerga — filtrada, com recortes,
paginada e ordenada —, o resumo diz a carga, e a busca acha por texto em Título,
Descrição, Comentários e número do sistema anterior; a sugestão de parecidos
evita duplicado na abertura; e o MCP expõe Resources e um Prompt de triagem.

**O que o Epic 4 encontra pronto:** `numero_legado` (coluna vazia, indexada),
`escopoDeLeitura` para o export, `abrirTicket` para o import validar, e
`pg_trgm` instalado. **O que não encontra:** nenhuma biblioteca de CSV, nenhuma
escrita em lote, `users` sem `deleted_at` e nenhum comando que exclua Comentário
ou Usuário.

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
