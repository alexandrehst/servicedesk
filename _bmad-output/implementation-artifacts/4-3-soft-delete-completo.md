---
baseline_commit: 240cb1e
---

# Story 4.3: Soft-delete completo

Status: done

## Story

As a construtor,
I want soft-delete garantido em todas as entidades,
so that nada seja perdido e tudo permaneça auditável.

## Acceptance Criteria

1. **Given** todas as entidades (Chamado, Comentário, Usuário)
   **When** qualquer exclusão ocorre
   **Then** é **lógica, nunca física**, e permanece no Log de auditoria
   (FR-23 completo, AD-3).

2. **Given** um Comentário
   **When** um Agente o exclui
   **Then** ele some da thread para **todo mundo** (o filtro da 1.2 já faz
   isso), a exclusão vai para o Log com autor e origem, e o corpo **continua no
   banco**.

3. **Given** um Usuário
   **When** ele é excluído
   **Then** ele **não autentica mais** — nem por sessão já aberta, nem por link
   de login, nem por token MCP —, **não recebe atribuição** e **não abre
   Chamado por e-mail**; os Chamados dele **permanecem**.

4. **Given** uma exclusão que é irreversível na prática
   **When** ela é exposta por qualquer superfície (tool MCP)
   **Then** exige **confirmação explícita** (AD-7) — a dívida que a Story 1.7
   deixou nominalmente para esta story.

5. **Given** o Log de auditoria
   **When** qualquer exclusão é registrada
   **Then** o Log **não** ganha soft-delete (decisão da 1.7: é append-only, e
   uma coluna de exclusão ali permitiria apagar a prova).

## Tasks / Subtasks

- [x] **Task 1 — O Comentário precisa de identidade pública** (AC: #2)
  - [x] `id` no tipo `Comentario` do domínio e no `comentarioSchema`
  - [x] Conferir que o `id` não vira caminho de leitura: `ver_chamado`
        continua sendo o único jeito de chegar a um Comentário
- [x] **Task 2 — Excluir Comentário** (AC: #1, #2, #4)
  - [x] `excluir_comentario` no vocabulário do Log (`ACOES`)
  - [x] Port `excluirComentarioComAuditoria` + adapter transacional
  - [x] Command com autorização e o gargalo de visibilidade do Chamado
  - [x] Tool MCP **com confirmação** (AD-7)
- [x] **Task 3 — `users.deleted_at`** (AC: #1, #3)
  - [x] Migration `0014`: coluna + índice parcial
  - [x] O `UNIQUE` de `email` **não** pode virar parcial — ver Dev Notes
- [x] **Task 4 — O Usuário excluído deixa de existir para o sistema** (AC: #3)
  - [x] `buscarUsuarioPorEmail`, `buscarSessaoPorHash` e `buscarTokenMcpPorHash`
        filtram excluído
  - [x] **Um teste por caminho, com os outros desligados** — a redundância que
        protege também esconde
- [x] **Task 5 — Excluir Usuário** (AC: #1, #3, #4)
  - [x] Auditar uma ação que **não é sobre um Chamado** — ver a decisão nas
        Dev Notes
  - [x] Command, autorização e tool com confirmação
  - [x] O que acontece com Chamado do excluído e Chamado atribuído a ele
- [x] **Task 6 — A tool que faltava para o Chamado** (AC: #4)
  - [x] `excluir_chamado` **com confirmação** — a 1.7 escreveu que "a 4.3
        decide se e como ela aparece"
- [x] **Task 7 — Testes e mutação** (AC: #1..#5)
  - [x] **Sondas ANTES** — ver a lista nas Dev Notes
  - [x] `scratchpad/mutacoes-43.py`, **com a conferência prévia de alvos** que a
        4.2 introduziu
  - [x] Conferir `git status` depois de rodar mutação
- [x] **Task 8 — Registrar** (AC: —)
  - [x] PRD (FR-23 completo); prompt do loop rearmado no PR `docs:` seguinte

## Dev Notes

### O que JÁ existe, verificado no código em 2026-08-19

| Peça | Estado |
| --- | --- |
| `tickets.deleted_at` | ✅ migration 0006 (1.7), com índice parcial |
| `comments.deleted_at` | ✅ migration 0006; `filtrarComentarios` já o respeita |
| `excluir-chamado.ts` | ✅ command completo, com autorização e auditoria |
| `excluir_chamado` no `ACOES` | ✅ |
| **Tool MCP de exclusão** | ❌ **nenhuma** — o command não tem porta de entrada |
| **Command de excluir Comentário** | ❌ a coluna existe e nada a escreve |
| **`users.deleted_at`** | ❌ **o buraco da FR-23** |

### Duas coisas bloqueiam antes de qualquer código, e nenhuma está nas ACs

**1. O Comentário não tem identidade pública.** `Comentario` (em
`visibilidade.ts`) tem autor, corpo, `internal`, `criadoEm` e `excluidoEm` —
**não tem `id`**. O `comentarioSchema` de `ver_chamado` também não. Ou seja:
**não existe hoje um jeito de dizer qual Comentário excluir.**

**Decisão (por recomendação): expor o `id` da linha**, no domínio e no contrato.

A alternativa — um ordinal ("o 3º comentário") — é pior e vale entender por quê:
o ordinal **muda quando alguém exclui outro Comentário**, então "exclua o 3º"
apagaria o errado numa corrida. Um `id` opaco e estável é o que a operação pede.

Isto **não** contradiz o AD-4. O AD-4 diz que o Número do Chamado vem da
sequence e nunca do chamador — quem gera continua sendo a persistência. O que
muda é só que ele passa a ser **legível**, do mesmo jeito que o `number` já é.
`NovoComentario` continua **sem `id`** de propósito.

**2. `audit_entries.ticket_number` é `NOT NULL`.** Excluir um **Usuário** não é
sobre um Chamado — não há número a informar. O Log, como está, não consegue
registrar a ação.

**Decisão (por recomendação): tornar `ticket_number` nulo**, e não criar uma
segunda tabela de auditoria.

Por quê: o Log é **um** por decisão do projeto (FR-22, AD-3) — "o que aconteceu
neste sistema" é uma pergunta só. Duas tabelas exigiriam que toda leitura futura
soubesse consultar as duas, e a que fosse esquecida viraria o buraco. O custo é
real e precisa ser tratado na implementação: o histórico (1.8) filtra por
`ticket_number` e **não pode passar a devolver entradas sem Chamado** para quem
pede o histórico de um Chamado — o `WHERE` por igualdade já as exclui
naturalmente, mas **escreva o teste que prova isso**, porque é o tipo de
regressão que só aparece meses depois.

O índice `audit_entries_ticket_number_idx` continua servindo; nulos não entram
em índice B-tree por padrão, o que é exatamente o desejado.

### Quem pode excluir o quê, e o que cada exclusão significa

| Entidade | Capacidade | Por quê |
| --- | --- | --- |
| Chamado | `excluiChamado` (já existe, Agente) | 1.7 |
| Comentário | **`excluiComentario`** (nova, Agente) | ver abaixo |
| Usuário | **`excluiUsuario`** (nova, Agente) | ver abaixo |

**Capacidades separadas, e não reuso de `excluiChamado`.** É o mesmo raciocínio
que separou `atribuiChamado` de `recebeAtribuicao` (2.3) e `fechaOuCancela` de
`reabre` (2.6): hoje coincidem porque só há um papel de atendimento, e a
coincidência esconde que são decisões diferentes. "Pode apagar um comentário do
time" e "pode desligar o acesso de uma pessoa" não são a mesma pergunta — e
quando existir um papel de Gestor, a diferença aparece de uma vez.

**O autor do Comentário pode excluir o próprio?** **Decisão: não, nesta story.**
O Solicitante comenta (2.1) mas não exclui: um Comentário já lido pelo Agente faz
parte do registro do atendimento. Se isso mudar, é decisão de produto nova —
registre, não invente.

**Excluir Usuário é a ação mais destrutiva do sistema**, porque ela é a única que
**tira o acesso de uma pessoa**. Trate-a como tal.

### O Usuário excluído: onde ele precisa deixar de existir

Verificado no código — `users` é lido em **cinco** lugares, e **três** deles são
o mesmo repositório:

| Onde | Arquivo | O que acontece se não filtrar |
| --- | --- | --- |
| Pedir link de login | `platform/auth/autenticacao.ts:65` | o excluído recebe link novo |
| Consumir link de login | `platform/auth/autenticacao.ts:110` | link emitido antes vira sessão |
| Sessão já aberta | `identity-repository.ts:105` (`innerJoin` com `users`) | **a sessão de 8 h continua valendo** |
| Token MCP | `identity-repository.ts:85` (`innerJoin` com `users`) | o agente autônomo dele continua agindo |
| Atribuir Chamado | `commands/atribuir-chamado.ts:77` | trabalho vai para quem não atende mais |
| Intake de e-mail | `commands/abrir-chamado-por-email.ts:93` | o e-mail dele ainda abre Chamado |

**Todos passam por `buscarUsuarioPorEmail` ou por um `innerJoin` com `users`** —
então filtrar `deleted_at IS NULL` **nos três métodos do
`identity-repository`** fecha os seis caminhos de uma vez.

**E é exatamente por isso que o teste precisa de cuidado.** A 3.1 e a 4.2 já
ensinaram: **a redundância que protege também esconde**. Um teste que crie o
Usuário excluído e tente logar passa mesmo que só uma das camadas filtre.
**Escreva um teste por caminho**, e faça cada um exercitar a sua camada —
sessão já aberta é diferente de link novo, que é diferente de token MCP.

A escolha de guardar o papel em `users` e não em `sessions` foi da 1.3, e o
comentário no schema diz o porquê: "para que rebaixamento e remoção valham
imediatamente em vez de esperar a sessão expirar". **Esta story é o dia em que
essa decisão é cobrada.**

### O que NÃO acontece quando um Usuário é excluído

- **Os Chamados dele permanecem.** Excluir a pessoa não apaga o histórico do
  trabalho — é o oposto do que a FR-23 quer.
- **O `requester` continua sendo o e-mail dele.** Não anonimize: o Log e o
  Chamado passariam a mentir sobre quem pediu o quê.
- **O Chamado atribuído a ele NÃO é redistribuído automaticamente.**
  Redistribuir é decisão de operação, não consequência de exclusão — e um
  `UPDATE` em massa disparado por uma exclusão é exatamente o tipo de efeito
  colateral invisível que o AD-2 existe para evitar. **Registre a consequência:**
  um Chamado pode ficar com Dono que não atende mais, e quem descobre isso é a
  Fila. Se a story quiser tratar, o caminho honesto é **relatar na saída** quais
  Chamados ficaram órfãos, não mexer neles.
- **As credenciais dele não são apagadas** (`sessions`, `login_links`,
  `mcp_tokens`). Elas param de funcionar porque o `innerJoin` deixa de casar —
  e apagá-las seria exclusão física, que é o que esta story proíbe.

### O AD-7 volta a valer, e a 1.7 escreveu isso com todas as letras

> *"A exclusão **é** irreversível na prática enquanto não houver restauração
> (Story 4.3). No dia em que a 4.3 expuser a exclusão por alguma superfície, o
> AD-7 passa a valer — está anotado aqui para que essa decisão não seja tomada
> por omissão."* — Story 1.7, Dev Agent Record

Esta story expõe **três** exclusões por tool. **As três exigem confirmação.** O
mecanismo inteiro já existe da 2.6 e **não precisa ser reinventado**:
`confirmacoes` com token emitido pelo servidor, escopo por
**ação + chamado + identidade**, uso único e expiração.

**Atenção ao escopo do token:** ele foi desenhado com `ticket_number`. Excluir
Comentário e Usuário **não são sobre um Chamado**. Decida como escopar sem
enfraquecer a garantia — o que o token precisa amarrar é **o objeto exato** da
ação, e um token de "excluir usuário X" que sirva para excluir o usuário Y é
pior que não ter token. O mesmo raciocínio da coluna `acao` na migration 0010:
"sem ela, uma confirmação de 'cancelar #1042' fecharia #1042".

### Restauração e retenção: as duas dívidas que a 1.7 deixou

A 1.7 registrou: **"não há restauração"** (um Chamado excluído por engano só
volta por SQL manual) e **"nenhuma política de retenção"** (excluídos ficam para
sempre).

**Decisão (por recomendação): nenhuma das duas entra nesta story, e as duas
ficam registradas no PRD — não no Dev Agent Record.**

Restaurar é **capacidade de produto nova**, com pergunta própria ("quem pode
restaurar, e o que acontece se o Chamado mudou desde então?"); enfiá-la aqui
faria uma story de infraestrutura decidir política de operação. E é justamente
por não haver restauração que o AD-7 se aplica — as duas decisões são coerentes
entre si.

Retenção é decisão de **negócio e conformidade** (quanto tempo o dado de uma
pessoa desligada pode ficar?), não de código.

### As sondas — escreva ANTES (a 4.2 registrou seis ocorrências)

- **A exclusão de Comentário só é provada por um teste que leia a thread
  DEPOIS.** Contar linhas afetadas não distingue "marcou" de "marcou o errado";
  e o `UPDATE` precisa casar `id` **e** `ticket_number`, senão excluir o
  comentário #7 do Chamado #1042 apaga o #7 de outro Chamado.
- **A sessão já aberta é a única sonda que prova a remoção imediata.** Um teste
  que só faça login novo passa mesmo com a sessão antiga válida para sempre.
- **O Log precisa de asserção sobre o que ficou gravado, não sobre a contagem.**
  Exclusão de Usuário com `ticket_number` nulo é o primeiro registro do projeto
  sem Chamado: prove que ele **existe** e que **não aparece** no histórico de
  nenhum Chamado.
- **Confirmação: o teste tem de provar que a ação NÃO acontece sem o token.**
  A 2.6 já tem o padrão — a primeira fase devolve `ConfirmationRequired` e
  **nada é escrito**.

### Mutações obrigatórias

`scratchpad/mutacoes-43.py`, **com a conferência prévia de alvos** que a 4.2
introduziu (ela pega alvo evaporado em 1 s em vez de 40 min). E **confira
`git status` depois de rodar**: script morto no meio deixa o repositório mutado.

| Mutação | Deve reprovar |
| --- | --- |
| Exclusão vira `DELETE` físico | AC #1 |
| `UPDATE` do Comentário sem casar `ticket_number` | AC #2 |
| Comentário excluído volta a aparecer na thread | AC #2 |
| Exclusão sem registro no Log | AC #1 |
| `deleted_at` de `users` ignorado na sessão já aberta | AC #3 |
| ... ignorado no token MCP | AC #3 |
| ... ignorado no link de login | AC #3 |
| ... ignorado na atribuição | AC #3 |
| ... ignorado no intake de e-mail | AC #3 |
| Excluir sem confirmação passa a funcionar | AC #4 |
| Confirmação de um objeto serve para outro | AC #4 |
| Chamado do Usuário excluído some | AC #3 |
| `audit_entries` ganha `deleted_at` | AC #5 |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Restaurar o que foi excluído | capacidade de produto nova; registrada no PRD |
| Política de retenção | decisão de negócio/conformidade; registrada no PRD |
| Redistribuir Chamado de Agente excluído | operação, não consequência de exclusão |
| Excluir o próprio Comentário (Solicitante) | decisão de produto; registrada |
| Anonimizar dado de quem saiu | é outra coisa: LGPD ≠ soft-delete |

### Regressões a não causar

- **`audit_entries` não ganha soft-delete.** É append-only (FR-22), e a 1.7
  registrou o motivo: quem apagasse o rastro teria o rastro do apagamento
  apagado junto.
- **O `UNIQUE` de `users.email` NÃO vira parcial.** Seria a saída óbvia para
  "recadastrar quem saiu", e é uma armadilha: com `UNIQUE ... WHERE deleted_at
  IS NULL`, o mesmo e-mail passaria a existir duas vezes, e **`buscarSessaoPorHash`
  casa por e-mail**, não por id — a sessão do usuário antigo passaria a resolver
  para o novo. Recadastrar é problema de outra story.
- **`filtrarComentarios`, `visivelPara` e `escopoDeLeitura` não mudam.** O
  Comentário já sai da thread quando `excluidoEm` não é nulo.
- **O intake de e-mail (1.9) não pode passar a lançar** por causa de remetente
  excluído: hoje ele **recusa e registra `aviso`** quando o remetente é
  desconhecido, e um Usuário excluído é o mesmo caso — não é erro.

### References

- [Source: epics.md#Story 4.3]
- [Source: prd.md#FR-23] — exclusões lógicas, nunca físicas
- [Source: 1-7-*.md] — a base do soft-delete, e as cinco dívidas endereçadas a esta story
- [Source: 2-6-*.md] — o mecanismo de confirmação (AD-7) pronto
- [Source: 1-3-*.md] — o papel vive em `users` para que remoção valha imediatamente
- [Source: 4-2-*.md] — capacidade que nenhuma AC pediu; sondas por camada
- [Source: ARCHITECTURE-SPINE.md#AD-3] — escrita e auditoria na mesma transação
- [Source: ARCHITECTURE-SPINE.md#AD-7] — confirmação de ação irreversível
- [Source: ARCHITECTURE-SPINE.md#AD-8] — autorização no domínio

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Code, loop Ralph)

### Debug Log References

- `scratchpad/mutacoes-43.py` — **37 mutações, 37 reprovadas** (saída em `scratchpad/mutacoes-43.out`); a conferência prévia de alvos, herdada da 4.2, acusou zero ausentes
- `pnpm test` — 953 testes verdes; `typecheck`, `lint` e `arch` limpos
- Integração contra o Postgres real: `excluir-comentario.test.ts` (12),
  `usuario-excluido.test.ts` (9), `excluir-usuario.test.ts` (17)

### Completion Notes List

**Duas coisas bloqueavam antes de qualquer código, e nenhuma estava nas ACs.**

A primeira: **o Comentário não tinha identidade pública.** O contrato de
`ver_chamado` devolvia autor, corpo, `internal` e data — não havia como dizer
*qual* Comentário excluir. Expus o `id` da linha. A alternativa (um ordinal,
"o 3º comentário") é pior de um jeito específico: ele **muda quando alguém
exclui outro**, então "exclua o 3º" apagaria o errado numa corrida. Não
contradiz o AD-4 — quem gera continua sendo a persistência, o valor só passou a
ser legível, como o `number` do Chamado já era; `NovoComentario` segue sem `id`.

A segunda: **`audit_entries.ticket_number` era `NOT NULL`.** Excluir um Usuário
não é sobre um Chamado. Tornei a coluna nula em vez de criar uma segunda tabela
de auditoria, e o motivo é estrutural: o Log é **um** por decisão do projeto
(FR-22), e com duas tabelas toda leitura futura teria de consultar as duas — a
esquecida viraria o buraco. O custo tem teste próprio: uma entrada sem Chamado
**não pode** vazar para o histórico de Chamado nenhum. O `WHERE` por igualdade
já a exclui, mas "já exclui" é afirmação, e afirmação não é teste (4.2).

**O escopo do token de confirmação precisou ser generalizado.** A Story 2.6
amarrou o token a `ticket_number + ação + identidade`, e a migration 0010
registrou por quê: "sem ela, uma confirmação de 'cancelar #1042' fecharia
#1042". Nem Comentário nem Usuário são Chamados. O escopo virou
`AlvoDeConfirmacao` — um tipo do **domínio**, com `alvoDoChamado`,
`alvoDoComentario` e `alvoDoUsuario`, para que ninguém escreva o prefixo à mão
(duas strings montadas em pontos diferentes é exatamente como dois lugares
divergem).

O alvo do Comentário carrega o **par** Chamado/Comentário, e não só o `id`. A
razão é a mesma que faz o `UPDATE` casar os dois: **um alvo mais frouxo que a
autorização é um buraco com cara de guardrail.** Um token `comentario:7`
serviria para o Comentário 7 de qualquer Chamado.

**As três camadas do Usuário excluído foram provadas independentes — de
propósito.** `users.deleted_at` é lida por três métodos do
`identity-repository`, e por eles passam seis caminhos. A forma preguiçosa de
testar (criar o Usuário, excluir, tentar logar) ficaria verde com **uma** camada
filtrando. Desliguei cada uma separadamente e conferi que as outras não a
encobrem: **cada camada desligada reprova sozinha**, duas asserções cada.

A sonda que mais importa é a **sessão já aberta**: um teste que só faça login
novo passa mesmo com a sessão antiga valendo para sempre. É o dia em que a
decisão da Story 1.3 foi cobrada — o papel foi guardado em `users` e não em
`sessions` "para que rebaixamento e remoção valham imediatamente em vez de
esperar a sessão expirar".

**O AD-7 entrou junto com as tools, não depois.** A Story 1.7 escreveu com todas
as letras que "no dia em que a 4.3 expuser a exclusão por alguma superfície, o
AD-7 passa a valer — está anotado aqui para que essa decisão não seja tomada por
omissão". Esta story expôs três tools de exclusão; as três exigem confirmação, e
`excluir_chamado` — cujo command existia desde a 1.7 sem porta de entrada —
ganhou a exigência na mesma mudança que a expôs.

**Uma decisão que a story não pediu: ninguém exclui a si mesmo.** Derrubaria a
própria sessão no meio da operação, e o sistema poderia ficar sem nenhum Agente.
Não é regra de negócio sofisticada — é o guardrail contra o único erro
irrecuperável aqui.

**O relatório em vez do `UPDATE` em massa.** Excluir um Agente deixa Chamados
não encerrados com Dono que não atende mais. Redistribuir automaticamente seria
o efeito colateral invisível que o AD-2 evita — e escolher o novo Dono é decisão
de operação. A saída **conta e avisa**; quem excluiu redistribui com
`atribuir_chamado`.

**As três mutações que sobreviveram, e o que cada uma significou.** Nunca é o
mesmo diagnóstico, e tratá-las como se fosse é o erro:

1. **"Excluir Usuário já excluído registra de novo" — era defeito real.**
   Sobreviveu porque o command chama `buscarUsuarioPorEmail` antes, e o filtro
   dele fazia o já-excluído nunca chegar ao adapter. **O gargalo do command
   mascarava o defeito do adapter** — oitava aparição desse padrão no projeto.
   O port é público: o adapter HTTP da Fase 1.5 pode chamá-lo sem command
   nenhum na frente, e a garantia tem de estar nele. O teste novo chama o
   repositório direto, e a mutação passou a reprovar 2 testes.

2. **"Trocar `excluiComentario` por `excluiChamado`" — não é matável.** As duas
   capacidades têm hoje a mesma política (`['agente']`); a separação existe por
   uma razão **futura** (quando houver Gestor). Um teste que a "cobrisse"
   compararia a tabela consigo mesma.

3. **"Distinguir inexistente de já-excluído" — não é matável, e por um bom
   motivo.** Os dois convergem no **mesmo ramo por construção**:
   `buscarUsuarioPorEmail` filtra o excluído, então ele chega como `null`,
   idêntico a inexistente. Não existe defeito que os separe sem antes desligar
   aquele filtro — que tem mutação própria e morre. **A garantia é estrutural,
   e isso é mais forte que um teste**, porque não depende de ninguém lembrar de
   escrevê-lo.

As duas não-matáveis saíram do script com o porquê no cabeçalho, seguindo o
critério que a 4.2 estabeleceu: sobrevivente por ausência de efeito é sintoma de
**mutação mal formulada**, não de teste faltando.

**O achado do `claude-review` (PR #81), e o buraco maior que estava ao lado.**
Ele apontou que o `solicitar_confirmacao` grava `ticket_number`, `de` e `para` —
e que para `excluir_usuario` os três são nulos. Consequência: um pedido de
exclusão que **nunca se confirma** (o token expira, ou quem decide diz não)
deixa no Log uma tentativa que não diz **quem** esteve perto de ser excluído.
É a ação mais destrutiva do sistema, e é o caso em que nada mais ficou
registrado — porque a exclusão não aconteceu.

Ao conferir o entorno, achei um segundo, que ele não mencionou e é pior: a
**execução** de `excluir_comentario` gravava o Chamado, mas não **qual**
Comentário. O Log dizia que alguém apagou algo daquela thread, sem dizer o quê —
e o corpo continua no banco justamente para que a exclusão seja auditável.

Os dois foram corrigidos com uma coluna `alvo` em `audit_entries`, guardando o
mesmo `AlvoDeConfirmacao` que já amarra o escopo do token: **um vocabulário só**
para "o objeto exato", em vez de um segundo com a mesma ideia. Ela é nula onde
`ticket_number` já identifica o objeto — guardar o mesmo dado duas vezes são
duas chances de divergir.

As duas sondas: a **tentativa não concluída** (pedido registrado, os três campos
antigos nulos, alvo presente, nada excluído) e o **pareamento** entre pedido e
execução pelo mesmo alvo — que é a pergunta que um auditor faz sobre uma ação
com human-in-the-loop.

**O segundo achado do PR #81, e a lacuna estrutural que ele expôs.**
`excluirChamadoOutputSchema` declarava `numero`; o command devolve `number` —
como todos os outros contratos de saída do projeto. O schema é publicado como
`outputSchema` da tool, então **toda chamada bem-sucedida produzia um
`structuredContent` que não batia com o contrato**, e o campo prometido vinha
sempre vazio.

O que interessa é **por que nenhum teste pegou**: os testes de command não
passam pelo `registerTool`, e os do adapter comparavam a saída com um literal
escrito à mão — que repetia o mesmo erro. Os dois lados concordavam entre si e
discordavam do contrato.

A correção do campo é de uma linha; a que vale é o teste novo, que **parseia o
que cada handler devolve com o schema que a tool publica**. Ele fecha a classe
inteira — divergência de nome, tipo errado, campo faltando —, sem depender de
alguém lembrar de conferir os dois lados. Confirmei que morde: reintroduzindo o
`numero`, ele reprova.

**A armadilha que a migration documenta:** o `UNIQUE` de `users.email` **não**
virou parcial. Seria a saída óbvia para recadastrar quem saiu, e quebraria a
autenticação de um jeito silencioso — `buscarSessaoPorHash` casa
`sessions.email` com `users.email`, **não com um id**, então a sessão do usuário
antigo passaria a resolver para o novo, herdando o papel dele.

### File List

**Novos**
- `src/domain/alvo-de-confirmacao.ts`
- `src/application/contracts/excluir.ts`
- `src/application/commands/excluir-comentario.ts`
- `src/application/commands/excluir-usuario.ts`
- `src/adapters/persistence/excluir-comentario.test.ts`
- `src/adapters/persistence/excluir-usuario.test.ts`
- `src/adapters/persistence/usuario-excluido.test.ts`
- `drizzle/migrations/0014_soft_delete_completo.sql`
- `drizzle/migrations/0015_alvo_no_log.sql`
- `scratchpad/mutacoes-43.py`

**Alterados**
- `drizzle/schema.ts` (`users.deletedAt`, `audit_entries.ticketNumber` nulo, `confirmacoes.alvo`)
- `src/domain/visibilidade.ts` (`Comentario.id`), `src/domain/papeis.ts`, `src/domain/auditoria.ts`, `src/domain/errors.ts`
- `src/application/ports/identity-repository.ts`, `src/application/ports/ticket-repository.ts`, `src/application/ports/confirmacao-repository.ts`
- `src/application/commands/excluir-chamado.ts` (AD-7), `src/application/commands/acao-irreversivel.ts` (alvo)
- `src/application/contracts/ver-chamado.ts`, `src/application/queries/ver-chamado.ts`
- `src/platform/confirmacao/confirmacao-de-acao.ts`
- `src/adapters/persistence/identity-repository.ts`, `src/adapters/persistence/ticket-repository.ts`, `src/adapters/persistence/confirmacao-repository.ts`
- `src/adapters/mcp/server.ts` (três tools)
- `_bmad-output/planning-artifacts/prds/prd-ServiceDesk-2026-08-08/prd.md` (FR-23 completo)
- Testes ajustados ao `id` do Comentário, ao novo escopo do token e à confirmação obrigatória

## Change Log

| Data | Evento |
|---|---|
| 2026-08-20 | Implementada: `id` do Comentário exposto, exclusão de Comentário e de Usuário, `users.deleted_at` filtrado nas três camadas do repositório de identidade, `audit_entries.ticket_number` nulo, escopo do token generalizado para `AlvoDeConfirmacao`, três tools de exclusão com AD-7, FR-23 completo no PRD |
| 2026-08-19 | Story criada. Decidido por recomendação: `id` do Comentário exposto no contrato (ordinal seria instável sob exclusão concorrente); `audit_entries.ticket_number` vira nulo em vez de segunda tabela de auditoria; capacidades `excluiComentario` e `excluiUsuario` separadas; as três tools de exclusão exigem confirmação (AD-7, dívida da 1.7); restauração e retenção ficam fora e vão para o PRD; Chamado de Usuário excluído permanece e não é redistribuído |
