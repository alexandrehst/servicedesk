# Prompt do loop — Epic 3

Este arquivo é realimentado **inteiro** a cada iteração do `ralph-loop`. Você
não lembra das voltas anteriores: descubra o estado lendo os arquivos e o
histórico do git.

## Sua tarefa nesta volta

Avançar **uma** story do Epic 3, do início ao merge. Uma só. Não tente duas.

### 1. Descobrir onde parou

Leia `_bmad-output/implementation-artifacts/sprint-status.yaml`.

| Estado encontrado | O que fazer |
| --- | --- |
| Alguma story do Epic 3 em `in-progress` | Retome ela. Não comece outra |
| Alguma em `review` com PR aberto | Verifique os checks; se verdes, mergeie e conclua a volta |
| Alguma em `ready-for-dev` | Rode `bmad-dev-story` nela |
| Todas `done`, exceto `backlog` | Pegue a **primeira** `backlog` na ordem do arquivo |
| Todas as 6 stories do Epic 3 `done` | Encerre o épico (ver seção 7) |

**Os Epics 0, 1 e 2 estão completos** (`epic-2: done` desde 2026-08-18, PRs #46
a #61). Nenhuma story do Epic 3 começou: a primeira é a **3.1**.

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
Todas as quinze stories dos Epics 1 e 2 foram fechadas assim.

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

Pare o loop e reporte. **Não pule a story bloqueada** — as stories do Epic 3 são
sequenciais: a 3.1 define a forma de **toda** leitura em conjunto, e a 3.2, 3.4
e 3.5 são recortes dela.

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

### 6. O Epic 3 é o épico da LEITURA EM CONJUNTO — leia isto antes de escrever a story

O Epic 1 construiu um sistema que **abre** e **lê um** Chamado. O Epic 2 fez o
Chamado **mudar**, seis vezes. O Epic 3 faz o sistema **enxergar o trabalho**:
fila filtrada (3.1), recortes (3.2), resumo (3.3), busca (3.4), parecidos (3.5)
e a superfície de Resources/Prompts do MCP (3.6).

Hoje só se acha um Chamado **sabendo o Número dele**. Essa é a distância que
falta para a paridade com o software contratado.

#### O risco muda de lugar, e isso muda o que precisa ser testado

| Épico | Errar significa |
| --- | --- |
| Epic 1 | vazar **um** Chamado a quem não devia |
| Epic 2 | **corromper estado**, e o Log registra a corrupção como fato |
| **Epic 3** | **vazar Chamado alheio numa lista** — e uma lista vaza em silêncio |

Um `ver_chamado` indevido é um vazamento pontual e visível. Uma consulta de
lista com autorização frouxa entrega a base inteira de uma vez, e o resultado
*parece* correto: vem ordenado, filtrado, com contadores plausíveis. **Nada na
resposta denuncia que ela contém Chamado de terceiro.**

Por isso, toda story deste épico precisa de um teste com **duas identidades e
dados de ambas no banco** — e não apenas "o Solicitante vê os dele". A pergunta
que reprova é: *o resultado do Solicitante contém alguma linha que não é dele?*

#### O gargalo: `visivelPara` foi escrito para UM Chamado por vez

`domain/visibilidade.ts` é a peça central do AD-8, e hoje ela é assim:

```ts
visivelPara(quem, bruto: ChamadoBruto): ChamadoVisivel | null
```

Um Chamado entra, um Chamado (ou `null`) sai. O conteúdo bruto mora atrás de um
**símbolo não exportado**, então nenhum caso de uso consegue entregar Chamado
sem passar por lá — a garantia é estrutural, não disciplina. Isso funcionou
lindamente para leitura de um item. **Para lista, cria uma escolha, e a escolha
é a decisão da Story 3.1:**

| Caminho | O que ganha | O que perde |
| --- | --- | --- |
| **A.** Trazer tudo do banco e filtrar com `visivelPara` no domínio | AD-8 intacto, zero regra nova | lê a base inteira para devolver 20 linhas — o pilar **Performático**, e o `claude-review` já pegou N+1 no PR #43 |
| **B.** Filtrar no SQL (`WHERE requester = $1`) | rápido, paginável | a regra de autorização **desce para o adapter**, que é exatamente o que o AD-8 proíbe: MCP e HTTP passam a poder divergir |

**Nenhum dos dois, puro.** E o precedente já existe, medido na Story 1.8: o port
de histórico aceita `origem` como parâmetro de consulta, com este comentário —

> `origem` é **recorte de consulta**, não autorização — por isso pode ir ao SQL.
> A decisão de quem enxerga continua no domínio (AD-8); se ela descesse para cá,
> MCP e HTTP poderiam divergir.

A saída para a 3.1 é **formalizar essa distinção**: o **domínio** decide *o que
a pessoa pode alcançar* e produz um valor que descreve isso (algo como
`escopoDeLeitura(quem)` → "todos os vivos" ou "apenas os de `identity`"); o
**adapter** traduz esse valor para `WHERE`, sem decidir nada. A regra continua
morando num lugar só e o banco continua fazendo o trabalho pesado.

Duas coisas para não perder no caminho:

- **`filtrarComentarios` continua sendo do domínio.** Se a busca (3.4) devolver
  Comentários junto, eles passam pelo filtro — Comentário Interno não vai para
  Solicitante nem dentro de um resultado de lista.
- **Chamado excluído continua invisível** (1.7). Hoje isso vem de graça dentro
  de `podeVerTicket`; num `WHERE` montado à parte, é uma condição que alguém
  precisa lembrar de escrever. **Mutação obrigatória:** remover o
  `deleted_at IS NULL` do escopo e confirmar que um teste reprova.

#### O vazamento sutil da busca textual (3.4): o match em Comentário Interno

FR-11 diz que a busca cobre **Título, Descrição e Comentários**. Considere:

> Um Comentário **Interno** diz "cliente é encrenqueiro, escalar para o
> jurídico". O Solicitante busca por "jurídico" e o Chamado dele aparece.

O conteúdo interno não foi exibido — mas a **existência do resultado** revelou
que ele existe e do que fala. É o mesmo raciocínio da resposta cega da 1.3 e do
`AtribuicaoInvalida` da 2.3, agora num `LIKE`: **o que casa a busca também é
informação.** Decida na 3.4 (e registre): para quem não vê Comentário Interno,
o match não pode considerá-lo.

#### `chamados_parecidos` (3.5) tem um conflito de frente com o AD-8

FR-12 quer sugerir Chamados parecidos **na abertura** para evitar duplicados —
e quem abre costuma ser o **Solicitante**, que só pode ver os próprios Chamados
(FR-2). Sugerir "parecidos" a ele, respeitando o AD-8, devolve quase nada útil;
não respeitar é vazar Chamado de terceiro para quem abre um ticket.

Não invente uma terceira coisa sem registrar. Os caminhos honestos são: sugerir
apenas dentro do escopo de quem pergunta (útil de verdade só para o Agente), ou
devolver ao Solicitante uma forma **sem conteúdo** (Número e Título de Chamados
dele; nada de terceiros). **Decida, registre no PRD, e diga no Dev Agent Record
o que a sugestão NÃO faz.** A AC já garante uma coisa: *a sugestão não bloqueia
a abertura* — ela é conselho, não gate.

#### O que cada story encontra faltando

Verificado no código em 2026-08-18, depois do merge da 2.6 — **não descubra de
novo**:

| Story | O que **não existe** hoje |
| --- | --- |
| 3.1 | **Nenhuma leitura de lista.** O port só tem `buscarPorNumero` e `buscarHistoricoBruto`. Não há paginação, ordenação, nem `escopoDeLeitura` no domínio. Índices: só `tickets_vivos_idx (number) WHERE deleted_at IS NULL` — **nada** cobre `status`, `assignee` ou `categoria` |
| 3.2 | Depende inteiramente da forma que a 3.1 definir. "Sem Dono" é `assignee IS NULL`, e a AC exige que seja **recorte de primeira classe**, não um filtro escondido |
| 3.3 | Nenhuma agregação. `resumo_fila` precisa de `COUNT ... GROUP BY` por Status, Categoria e Dono — e a autorização vale para o agregado: contar Chamado que a pessoa não pode ver **é** vazar (um contador é um oráculo) |
| 3.4 | Nenhuma busca textual: sem `pg_trgm`, sem `tsvector`, sem índice de texto. E **`numero_legado` não existe** — a AC o cita, mas ele nasce no Epic 4. Decida se cria a coluna agora (nula) ou tira a AC de escopo, e **registre** |
| 3.5 | Nada. Depende da busca da 3.4 e da decisão de escopo acima |
| 3.6 | Nenhum Resource, nenhum Prompt. O SDK tem `registerResource(name, uriOrTemplate, config, cb)` e `registerPrompt(name, config, cb)` (`@modelcontextprotocol/server@2.0.0`) — e o Resource "chamado" precisa passar pela **mesma** query e pelo **mesmo** `visivelPara` de `ver_chamado`, senão nasce uma segunda porta de leitura sem autorização |

#### Decisões que a 3.1 toma e as outras herdam

Estas não são detalhes de implementação — são o formato de tudo que vem depois.
**Decida na 3.1, registre no PRD, e não as reabra sem motivo:**

1. **Limite e paginação.** Não há nada disso hoje, e uma tool MCP que devolve a
   base inteira **estoura o contexto da IA** — que é o consumidor primário
   (FR-13). Um limite padrão com cursor ou offset explícito é o mínimo. Decida
   o teto e o comportamento quando ele é atingido (truncar em silêncio é
   inaceitável: quem chamou precisa saber que há mais).
2. **O que uma linha da lista carrega.** `ver_chamado` devolve o Chamado
   **inteiro, com a thread**. Uma lista de 50 desses é lixo para a IA ler.
   Defina um **resumo** (Número, Título, Status, Prioridade, Dono, data) e um
   contrato Zod próprio — derivado do domínio, como manda o AD-6.
3. **Ordenação.** FR-8 pede ordenável por data de abertura. **A hora da
   Prioridade chegou:** a 2.4 registrou que "a ordem de `PRIORIDADES` é
   semântica, mas nada depende dela — o teste trava a sequência baixa→crítica
   para o dia em que a fila ordenar". Esse dia é agora. Ordenação sem desempate
   estável passa por acaso até parar de passar (lição da 1.2): **`ORDER BY` com
   desempate por `number`**.
4. **Índices.** Filtro sem índice funciona com 20 Chamados e morre com 20 mil —
   e a paridade é com um sistema que tem anos de histórico. Índice novo entra na
   migration junto com o filtro que o exige, e o Dev Agent Record diz **qual
   consulta** ele serve.

#### Use o que os Epics 1 e 2 deixaram prontos

| Use | Onde | O que carrega |
| --- | --- | --- |
| `criarHandler` | `adapters/mcp/server.ts` | autenticar → limitar → executar → traduzir erro. **Toda** tool nova passa por ele |
| `visivelPara` / `filtrarComentarios` | `domain/visibilidade.ts` | posse, papel, excluído e Comentário Interno |
| `embrulharBruto` / `Bruto<T>` | `domain/visibilidade.ts` | o símbolo privado que torna impossível entregar dado sem autorizar — **a leitura de lista precisa do mesmo tratamento** |
| Contrato Zod derivado do domínio | `contracts/*.ts` | AD-6; `STATUS`, `PRIORIDADES` e `CATEGORIAS` vêm de `domain/ticket.ts` |

**Rate limit vale para leitura também** (FR-21, via `criarHandler`) — e aqui com
uma diferença que merece registro: o limite conta **chamadas**, não custo. Uma
tool de fila é ordens de magnitude mais cara que um `ver_chamado`. Se você achar
que isso importa, registre como dívida; **não** invente um segundo mecanismo de
limite nesta story.

#### O que o Epic 2 mediu, e atravessa para cá

- **A pergunta que abre a story não é "como implementar", é "o mecanismo já
  existe?".** Duas stories seguidas descobriram que sim (2.5 e 2.6): o que
  faltava era o caminho de execução, não a regra. Antes de criar tabela, port ou
  tool, procure o que já responde à pergunta.
- **Guardrail que o próprio chamador preenche não é guardrail** (2.6). Quando
  uma AD deixa a forma em aberto, **a forma é a decisão da story** — e a decisão
  barata costuma ser a que não protege.
- **Diga o que o guardrail NÃO garante.** A 2.6 registrou que nenhum protocolo
  server-side prova que um humano confirmou. Aqui o análogo é: até onde a
  autorização de lista cobre? Contadores? Ordenação? A existência de um
  resultado?
- **Extrair antes do Sonar reprovar já é barato** (2.3, 2.5). O gate reprova
  duplicação acima de **3%** em código novo. Seis stories de leitura vão
  compartilhar escopo, paginação e formato de saída — extraia na segunda, não na
  quinta.
- **Quatro modos de mutação sobrevivente já vistos.** Quando uma sobreviver,
  pergunte nesta ordem: (1) ela muda comportamento observável? [inócua — 1.9,
  2.1, 2.3]; (2) o código é redundante? [2.2]; (3) o alvo está certo e é único?
  [2.4 — rode `biome check --write` **antes** de escrever o script]; (4) **o
  teste chega até aquela linha?** [2.6 — o caso usava dado que era barrado por
  outro filtro antes].
- **Teste que passa de primeira merece segunda leitura** (2.6): um deles passava
  pela razão errada, e só o nome denunciava. **Confira que ele passou pela razão
  que anuncia** — especialmente neste épico, em que "a lista veio certa" é fácil
  de afirmar e difícil de provar.
- **Cobertura lida por arquivo**, nunca só o total: 92% global escondia um
  arquivo em 0% na 1.9.
- **Teste de ordenação insere fora de ordem**, e `ORDER BY` com desempate.
- **Decisão sobre confiança fica no domínio, não no adapter** (achado do review
  no PR #43).
- **Conceito de negócio duplicado no contrato sobe para o domínio** e o contrato
  deriva (`PAPEIS` na 1.4, `ORIGENS` na 1.8, `duracaoLegivel` na 2.5).
- **Erros só se separam quando a distinção ajuda quem tem direito**, e o relógio
  é sempre injetado.
- **`await promessa.catch((e) => e as Error)` não devolve `Error`.** Use um
  helper que estreite com `ehDomainError` e **falhe quando não houver erro**.
- **`psql -f` sai com código 0 mesmo com SQL quebrado** — exige
  `-v ON_ERROR_STOP=1`.
- Migration nova entra em `drizzle/migrations/` (a próxima é a **0011**) e o
  `pnpm db:migrate` já itera sobre todas — **não** referencie arquivo por nome.
- **Coluna nova entra `NOT NULL DEFAULT`**, não nulável, quando o domínio tem um
  valor natural (2.4).

**Sobre o `claude-review`:** revisou de verdade **nove** vezes em vinte e três
rodadas. Não conte com ele; conte com as mutações — e note que no #50 quem pegou
o problema real foi o **Sonar**, olhando forma, e não ele.

### 7. Fim do épico

Quando as **seis** stories do Epic 3 estiverem `done` no `sprint-status.yaml`,
com PRs mergeados:

1. Marque `epic-3: done` e atualize o `RESUME.md`, num PR `docs:`.
2. Deixe no topo deste arquivo o aviso de épico encerrado — como o Epic 2 fez —
   e diga o que o Epic 4 (portabilidade e migração: export CSV, import,
   soft-delete completo, corte de baseline) exige de diferente.
3. Rode `/ralph-loop:cancel-ralph` e encerre com o resumo do épico.

**Verifique antes de encerrar** — as seis `done`, `epic-3: done`, árvore limpa,
nenhum PR de story aberto (os do Dependabot não contam). Não encerre para
escapar de um bloqueio: bloqueio se resolve com a seção 5.

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

**Estado do código em 2026-08-18:** 647 testes, cobertura 98,56%, 10 migrations
aplicadas, Epics 0, 1 e 2 completos. O Chamado nasce, muda, é resolvido e
encerrado — com auditoria, concorrência otimista e human-in-the-loop nas três
ações que não voltam atrás.

**Gate ativo:** nove required checks na `main` — `lint`, `typecheck`, `test`,
`arch`, `traceability`, `security-deps`, `security-secrets`, `sonar`,
`claude-review`. `enforce_admins` está ligado: não há como mergear com check
vermelho, nem para você. Mais `required_conversation_resolution: true`.

**Sem cobertura automática:** os pilares **Observável** e **Performático** não
têm gate determinístico e nunca foram exercitados por violação plantada. **Neste
épico o Performático deixa de ser teórico** — leitura de lista é exatamente onde
N+1, varredura de tabela e I/O desnecessário aparecem. Preste atenção nele ao
escrever código, e considere plantar a violação para ver se alguém reclama.

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
