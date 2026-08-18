---
baseline_commit: a70142c
---

# Story 2.6: Ações irreversíveis com confirmação

Status: review

## Story

As a Agente operando via IA,
I want que Fechar/Cancelar/Reabrir exijam confirmação explícita,
so that a IA não execute ações destrutivas sozinha.

## Acceptance Criteria

1. **Given** as tools `fechar_chamado` / `cancelar_chamado` / `reabrir_chamado`
   **When** a IA chama uma delas **sem** confirmação
   **Then** o domínio devolve `ConfirmationRequired` e **nada muda** — nem
   Status, nem versão, nem o Chamado (FR-15, FR-17, AD-7).

2. **Given** a confirmação explícita obtida na primeira chamada
   **When** a tool é chamada de novo com o sinal de confirmação
   **Then** a ação executa, incrementa a versão e é auditada (AD-3, AD-10)
   **And** Reabrir volta o Status para `em_andamento` **registrando o motivo**.

3. **Given** um sinal de confirmação que **não** foi emitido para aquela ação,
   aquele Chamado e aquela identidade — ou que já foi usado, ou que expirou
   **When** a ação é pedida com ele
   **Then** a resposta é a mesma de "sem confirmação": `ConfirmationRequired`,
   e nada muda. Confirmação **não** é reutilizável.

4. **Given** um Solicitante, ou uma transição que não é irreversível
   **When** a ação é pedida
   **Then** ele recebe `SemPermissao` / `TransicaoInvalida` **sem** que
   confirmação nenhuma seja emitida — não se emite crachá para quem não entra.

5. **Given** o Log de auditoria
   **When** uma ação irreversível é pedida e depois confirmada
   **Then** as **duas** etapas aparecem no histórico, com autor, origem e
   instante — é o que permite ver que a IA confirmou sozinha em 200 ms.

6. **Given** `mudar_status`
   **When** alguém tenta fechar, cancelar ou reabrir por ela
   **Then** continua recusando (a porta dos fundos que a 2.2 fechou permanece
   fechada, agora com as ações dedicadas existindo de verdade).

## Tasks / Subtasks

- [x] **Task 1 — Migration `0010`** (AC: #2, #3, #5)
  - [x] Tabela `confirmacoes`: `ticket_number`, `acao`, `identity`,
        `token_hash UNIQUE`, `expira_em`, `usado_em`, `criado_em`
  - [x] `audit_entries.motivo text` (nulo — só Reabrir preenche)
  - [x] Asserção contra o catálogo do banco, provando os dois lados
- [x] **Task 2 — Domínio** (AC: #1, #2, #4)
  - [x] `ConfirmationRequired` em `DomainErrorCode`
  - [x] `ACOES_IRREVERSIVEIS` em `domain/acoes-irreversiveis.ts`: o mapa
        `acao -> destino` derivado de `TRANSICOES_COM_CONFIRMACAO`
  - [x] Capacidades `fechaOuCancela` e `reabre` na matriz
  - [x] Ações `fechar_chamado`, `cancelar_chamado`, `reabrir_chamado` e
        `solicitar_confirmacao` em `ACOES`
  - [x] **A exigência do motivo vive no domínio**, não só no Zod (AD-7)
- [x] **Task 3 — Port e adapter da confirmação** (AC: #2, #3)
  - [x] `ConfirmacaoRepository`: `criarConfirmacao` e `consumirConfirmacao`
  - [x] O consumo é **atômico** (`UPDATE ... WHERE usado_em IS NULL AND
        expira_em > now()`), como o link de login da 1.3
- [x] **Task 4 — Um command, não três** (AC: #1..#5)
  - [x] `application/commands/acao-irreversivel.ts`, parametrizado pela ação
  - [x] Ordem: visibilidade → autorização → transição → confirmação → mutação
  - [x] **Usa** `conflitoOuSumico` e o `mutarCampoComAuditoria` do repositório
- [x] **Task 5 — Três tools MCP** (AC: #1, #2, #6)
  - [x] `fechar_chamado`, `cancelar_chamado`, `reabrir_chamado` — **usando**
        `criarHandler`
  - [x] `mudar_status` intocado; o teste de não-sobreposição continua verde
- [x] **Task 6 — Testes** (AC: #1..#6)
  - [x] Recusa antes do caminho feliz; confirmação de outra ação, expirada e
        reusada, contra o Postgres real
  - [x] **Verificar por mutação** — `scratchpad/mutacoes-26.py`, com tabela no
        Dev Agent Record. **Obrigatório:** remover a checagem de confirmação e
        confirmar que um teste reprova
- [x] **Task 7 — Registrar** (AC: —)
  - [x] PRD (FR-7, FR-15, FR-17) e spine (AD-7 sai de "declarado" para
        "implementado")
  - [ ] Fim do épico: `epic-2: done`, `RESUME.md` e prompt do loop (PR `docs:`
        separado, depois do merge)

## Dev Notes

### A decisão desta story: o sinal de confirmação é um TOKEN, não um booleano

O AD-7 diz o que precisa existir — *"os commands só executam com um sinal de
confirmação explícito no input; a exigência vive no domínio"* — e não diz o que
o sinal **é**. Essa é a decisão a tomar, e ela define se o guardrail funciona.

**Decisão (por delegação): confirmação em duas fases, com token emitido pelo
servidor.**

```
1ª chamada  fechar_chamado(numero, versao)
            → ConfirmationRequired + token cru + o que ele autoriza
            → nada muda, e o PEDIDO vai ao Log

2ª chamada  fechar_chamado(numero, versao, confirmacao: <token>)
            → executa, audita, incrementa a versão
            → o token queima (uso único)
```

**Por que não `confirmar: true`.** Um booleano no input é um campo que *quem
chama preenche*. Uma IA que recebe "preciso de `confirmar: true`" preenche na
tentativa seguinte — sozinha, em 200 ms — e o guardrail nunca dispara. O AD-7
existe justamente para impedir *"o caminho MCP pular o human-in-the-loop"*: um
sinal que o próprio chamador fabrica não impede nada. É o mesmo raciocínio que
levou `versao` a ser obrigatória na 2.2 — versão opcional com default "a
última" seria concorrência otimista que não protege ninguém.

**O que o token compra:** a execução exige um valor que **o servidor emitiu**,
para **aquele Chamado**, **aquela ação** e **aquela identidade**, com prazo
curto e uso único. Ele não é derivável, não é reutilizável, e a emissão fica
registrada — o que torna o intervalo entre pedido e confirmação uma **evidência
auditável**.

**Seja honesto sobre o limite.** Nenhum protocolo do lado do servidor prova que
um humano confirmou: a IA pode encadear as duas chamadas. O que esta story
garante é (a) nada muda sem o sinal, (b) o sinal existe como **fato no banco**,
não como campo preenchido por quem pede, e (c) as duas etapas ficam no Log.
Escreva isso em "Não provado" — o human-in-the-loop de verdade acontece no
cliente MCP, e ele está fora do nosso alcance.

### Reuse o mecanismo de token da 1.3 — inteiro

`platform/auth/token.ts` já tem `gerarToken` (32 bytes) e `hashToken`
(SHA-256 sem salt, com o porquê registrado). As regras da 1.3 valem aqui sem
adaptação:

- o **token cru existe uma vez**, na resposta do `ConfirmationRequired`;
- o banco guarda **hash**;
- o consumo é atômico no `UPDATE`, e não ler-depois-marcar — dois pedidos
  simultâneos com o mesmo token disputam a linha e só um casa (foi o mesmo
  raciocínio do consumo do link de login e do soft-delete da 1.7).

**Prazo: 5 minutos.** Não são os 15 do login nem os 7 dias do link de acesso.
A pergunta que fixa o número é *"quanto tempo é razoável entre a IA perguntar e
o humano responder na mesma conversa?"* — e uma janela longa transforma
confirmação em algo que fica pendurado, disponível para ser usado depois que o
contexto mudou. Decida, e registre.

**Resposta cega para os três casos** (não emitido, expirado, já usado):
`ConfirmationRequired`, a mesma de "não mandou nada". Distinguir "seu token
expirou" de "esse token não existe" só ensina a sondar — é a decisão da 1.3
(`CredencialInvalida`) e da 2.3 (`AtribuicaoInvalida`), pela terceira vez.

### Um command, não três

Fechar, cancelar e reabrir são **a mesma coisa**: uma transição de
`TRANSICOES_COM_CONFIRMACAO` que exige confirmação. Três commands copiados
seriam a duplicação que o Sonar reprovou no PR #50 com 9% — e três chances de
uma delas esquecer uma garantia.

Escreva **um** `acaoIrreversivel({ repositorio, confirmacoes, ... })(acao)` e
três tools finas sobre ele. O que varia entre as três é: o destino
(`fechado`/`cancelado`/`em_andamento`), a capacidade (`fechaOuCancela` /
`reabre`) e o motivo (só Reabrir). Tudo isso é **dado**, não código.

O mapa `acao -> { destino, capacidade, exigeMotivo }` vive no **domínio**
(`domain/acoes-irreversiveis.ts`), derivado de `TRANSICOES_COM_CONFIRMACAO`, e
não no adapter — pelo mesmo motivo do AD-5: se o MCP tivesse o mapa, o HTTP
poderia divergir. Um teste garante que **toda** transição declarada em
`TRANSICOES_COM_CONFIRMACAO` tem ação dedicada aqui: transição irreversível sem
caminho de execução é guardrail que trancou a porta e perdeu a chave.

### A ordem das checagens, e por que cada troca dela é um vazamento

```
buscarPorNumero → visivelPara       → TicketNaoEncontrado
                → pode(capacidade)  → SemPermissao
                → exigeConfirmacao  → TransicaoInvalida
                → motivo (Reabrir)  → MotivoObrigatorio
                → confirmação?      → emite + audita + ConfirmationRequired
                → consumir (atômico)→ ConfirmationRequired se não casou
                → mutar + auditar   → Conflict / TicketNaoEncontrado
```

- **`visivelPara` primeiro**, como em toda mutação do épico: quem não vê o
  Chamado recebe `TicketNaoEncontrado`; quem vê mas não pode agir recebe
  `SemPermissao`.
- **Autorizar antes de emitir confirmação** (AC #4). Emitir um token para quem
  não pode agir vaza duas coisas: que o Chamado existe naquele estado, e que a
  ação seria válida. É o mesmo raciocínio de "autorizar antes de validar o
  valor" da 2.4, um degrau acima.
- **Validar a transição antes de emitir**, pelo mesmo motivo: `fechar` um
  Chamado `aberto` não é irreversível, é inválido — e emitir confirmação para
  ela ensinaria a máquina de estados a quem está sondando.
- **Consumir a confirmação ANTES do `UPDATE`.** Se a versão divergiu, o token
  **já queimou** e a IA precisa pedir de novo. Isso é deliberado, não descuido:
  o humano confirmou "fechar o Chamado **na versão 5**", e a versão mudou —
  reaproveitar a confirmação seria executá-la sobre um Chamado que já não é o
  que ele viu. Registre.

### O motivo da reabertura vai para o LOG, não para um Comentário

`audit_entries` ganha `motivo text` (nulo; só `reabrir_chamado` preenche).

Por que não Comentário: o Log é **append-only** (FR-22, e por isso não tem
soft-delete, decisão da 1.7), enquanto Comentário tem — o motivo de uma
reabertura viraria prova que alguém pode apagar. E ele é **metadado da ação**,
não conversa com o Solicitante: o par `de`/`para` diz o que mudou, o motivo diz
por quê.

Consequência a aceitar e registrar: o Solicitante **não** vê o motivo, porque
não vê o Log (1.8). Se um dia ele precisar saber, isso é uma decisão de produto
nova — e um Comentário público seria a forma, além do registro, nunca no lugar
dele.

**Não invente estrutura.** `de`/`para` continuam sendo o par (2.2), e `motivo`
é uma terceira coluna, não um `jsonb` — pelo motivo já registrado na migration
`0008`.

### Duas capacidades, não uma

`fechaOuCancela` e `reabre`, ambas `['agente']` hoje.

Separadas de propósito, como `atribuiChamado`/`recebeAtribuicao` na 2.3:
"encerrar" e "trazer de volta" são decisões diferentes que **hoje** coincidem
porque só existe um papel de atendimento. Um Gestor que reabre sem poder
cancelar — ou uma auditoria que nunca encerra — quebra a coincidência, e a
reutilização da capacidade errada só apareceria como Chamado encerrado por
quem não devia. Custa uma linha.

Fechar e cancelar ficam **juntas** porque a pergunta é a mesma ("pode encerrar
este Chamado?"); o que difere entre elas é só o estado final, e isso é dado.

### O pedido de confirmação é auditado (AC #5)

Ação `solicitar_confirmacao` em `ACOES`, com `de` = Status atual e `para` = o
pretendido.

Isso **não** contradiz "escrita que não aconteceu não vira auditoria" (1.7): a
exclusão que não afetou linha não aconteceu, mas o pedido de confirmação
**aconteceu** — um token foi emitido, e ele existe no banco. Sem esse registro,
o Log mostraria só o encerramento, e não haveria como distinguir "o humano
confirmou" de "a IA se auto-confirmou em 200 ms". Como o servidor não pode
impedir a segunda, registrar é o que sobra — e é exatamente o que o pilar
Auditável pede.

### Use os helpers do épico

| Use | Onde | O que carrega |
| --- | --- | --- |
| `mutarCampoComAuditoria` | `adapters/persistence/ticket-repository.ts` | `UPDATE` versionado + auditoria na mesma transação |
| `conflitoOuSumico` | `application/commands/mutacao-versionada.ts` | separa `Conflict` de `TicketNaoEncontrado` |
| `criarHandler` | `adapters/mcp/server.ts` | autenticar → limitar → executar → traduzir |
| `gerarToken` / `hashToken` | `platform/auth/token.ts` | 256 bits, hash no banco |

O `mutarCampoComAuditoria` precisará passar o `motivo` adiante — é o único
ponto em que ele muda, e **acrescente um parâmetro opcional**, não uma segunda
versão da função.

Esta story é maior que as anteriores do épico (a 2.4 custou 67 linhas, esta
custará algumas centenas) porque ela constrói o **AD-7 inteiro**: tabela,
domínio, port, adapter, command e três tools. Isso é esperado. O que **não** é
esperado: reescrever `db.transaction`, o `try/catch` de handler, ou um segundo
`UPDATE` versionado.

### Testes: onde cada garantia se prova

| Garantia | Onde | Por quê ali |
| --- | --- | --- |
| Mapa cobre `TRANSICOES_COM_CONFIRMACAO` | `domain/acoes-irreversiveis.test.ts` | é sobre os **dados**, como a auto-transição da 2.2 |
| Sem confirmação nada muda (AC #1) | command, com duble | recusa antes do caminho feliz |
| Token de outra ação / outro Chamado / outra identidade (AC #3) | **integração** | é o `WHERE` do consumo que garante, não um `if` |
| Uso único e expiração (AC #3) | **integração** | mesma razão — a garantia é do banco (1.3) |
| Duas etapas no Log (AC #5) | **integração** | precisa do histórico real |
| Confirmação queima mesmo com conflito | **integração** | depende da `version` andando |
| Nada emitido para quem não pode (AC #4) | command + integração | conta as linhas de `confirmacoes` |

### Mutações obrigatórias

Em `scratchpad/mutacoes-26.py`, **versionado e commitado**. Rode
`biome check --write` **antes** de escrever os alvos e ancore cada um em texto
único (as duas sobreviventes da 2.4 foram alvo ambíguo e alvo evaporado pelo
formatador).

| Mutação | Deve reprovar |
| --- | --- |
| **Remover a checagem de confirmação** (a que o AD-7 exige) | AC #1 |
| Aceitar confirmação de outra ação | AC #3 |
| Aceitar confirmação de outro Chamado | AC #3 |
| Aceitar confirmação de outra identidade | AC #3 |
| Não marcar `usado_em` (confirmação vira reutilizável) | AC #3 |
| Ignorar `expira_em` | AC #3 |
| Emitir confirmação antes de autorizar | AC #4 |
| Emitir confirmação para transição inválida | AC #4 |
| Não auditar o pedido de confirmação | AC #5 |
| Reabrir sem exigir motivo | AC #2 |
| Não gravar o motivo no Log | AC #2 |
| `mudar_status` volta a aceitar as irreversíveis | AC #6 |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| E-mail de fechamento/cancelamento | FR-18 é explícito: só abertura e resolução |
| Desfazer um encerramento sem ser por Reabrir | não existe |
| Confirmação para ações **não** irreversíveis | AD-7 é só sobre as três |
| Ligar o canal de notificação nos handlers MCP | story de bootstrap (topologia `Deferred`) |
| Expurgo de `confirmacoes` expiradas | dívida a registrar, como a do Log |

### Regressões a não causar

- **`mudar_status` não muda.** As três transições continuam recusadas por ela,
  com a mensagem que manda usar a ação dedicada — agora verdadeira. O teste de
  não-sobreposição das tabelas não pode ser tocado.
- **`TRANSICOES_COM_CONFIRMACAO` não muda.** Ela foi declarada na 2.2 com o
  conteúdo certo; esta story só a **executa**.
- O e-mail de resolução (2.5) não é afetado: `resolvido` continua saindo de
  `mudar_status`.

### References

- [Source: epics.md#Story 2.6]
- [Source: prd.md#FR-15] — sem o passo de confirmação, não altera estado
- [Source: prd.md#FR-17] — human-in-the-loop em ação irreversível via IA
- [Source: prd.md#FR-7] — Reabrir volta para "Em andamento" e registra o motivo
- [Source: ARCHITECTURE-SPINE.md#AD-7] — a exigência vive no domínio
- [Source: ARCHITECTURE-SPINE.md#AD-5] — as duas tabelas de transição
- [Source: 1-3-autenticacao-e-identidade.md] — token, hash, consumo atômico, resposta cega
- [Source: 2-2-mudar-status-maquina-de-estados.md] — a porta dos fundos que esta story finalmente abre pelo lado certo
- [Source: 2-5-resolver-chamado-e-mail-de-resolucao.md] — "escrita que não aconteceu não notifica", e o gap de wiring

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A decisao que definiu a story foi recusar o booleano.** O AD-7 diz que os
commands "so executam com um sinal de confirmacao explicito no input" e nao diz
o que o sinal e. Um `confirmar: true` teria custado tres linhas — e seria um
campo que QUEM CHAMA preenche: uma IA que le "preciso de confirmar: true"
preenche na tentativa seguinte, sozinha, e o guardrail nunca dispara. O token
emitido pelo servidor custou uma tabela, um port, um adapter e um servico, e e
a diferenca entre um guardrail e a decoracao de um.

**Um command para as tres acoes, e o mapa no dominio.** Fechar, cancelar e
reabrir sao a mesma transicao com destino diferente, entao o que varia
(`destino`, `capacidade`, `exigeMotivo`) virou DADO em
`domain/acoes-irreversiveis.ts`. Tres commands copiados seriam a duplicacao do
PR #50 multiplicada por tres — e tres chances de uma delas esquecer o consumo do
token.

**O teste que casou as duas tabelas encontrou o proprio proposito.** "Todo
destino de `TRANSICOES_COM_CONFIRMACAO` e alcancavel por alguma acao" e o que
impede o guardrail de trancar a porta e perder a chave: uma transicao declarada
irreversivel sem acao dedicada deixaria o Chamado preso num estado do qual
`mudar_status` recusa sair e nada mais consegue.

**Uma mutacao sobreviveu, e era teste fraco — nao codigo.** "Confirmacao serve
para qualquer ACAO" passou porque o teste usava um token de OUTRO Chamado: o
filtro de `ticket_number` barrava antes de o filtro de `acao` ser exercitado.
O caso certo precisa do MESMO Chamado e da MESMA identidade, com so a acao
diferente — e como nenhum estado aceita duas acoes irreversiveis ao mesmo
tempo, o caminho e emitir num estado e tentar usar em outro (pedir para
cancelar um Chamado em andamento, resolve-lo, tentar fechar com aquele token).
Depois da correcao, a mutacao reprova. **E o quarto modo de mutacao
sobrevivente do projeto** — depois de inocua (1.9, 2.1, 2.3), redundante (2.2) e
erro do script (2.4): aqui o alvo estava certo e o teste e que nao alcancava a
linha.

**Outro teste passou pelo motivo errado, e so o nome denunciou.** O caso
"versao divergente vira Conflict" movia o Status para bumpar a versao — o que
fazia a transicao deixar de ser valida, e a recusa vinha da maquina de estados
antes de o conflito existir. Trocado por `mudarPrioridade`, que move a versao
sem mexer no Status. **Quando um teste passa de primeira, confira que ele passou
pela razao que o nome anuncia.**

| Mutacao aplicada | Reprovou |
| --- | --- |
| **REMOVER a checagem de confirmacao (o AD-7 deixa de existir)** | 17 testes |
| Aceitar qualquer confirmacao (ignorar o consumo) | 8 testes |
| Emitir confirmacao ANTES de autorizar | 2 testes |
| Emitir confirmacao para transicao invalida | 4 testes |
| Pular o gargalo de visibilidade | 1 teste |
| Usar a versao do Chamado lido | 3 testes |
| Conflito vira sucesso silencioso | 3 testes |
| Confirmacao serve para qualquer ACAO | 1 teste |
| Confirmacao serve para qualquer CHAMADO | 1 teste |
| Confirmacao serve para qualquer IDENTIDADE | 1 teste |
| Confirmacao vira REUTILIZAVEL | 2 testes |
| Confirmacao nunca expira | 1 teste |
| Nao marcar a confirmacao como usada | 3 testes |
| Nao auditar o pedido de confirmacao | 1 teste |
| Reabrir deixa de exigir motivo | 8 testes |
| Motivo em branco passa a valer | 4 testes |
| Nao gravar o motivo no Log | 1 teste |
| Solicitante ganha permissao de encerrar | 2 testes |
| Reabrir usa a capacidade de encerrar | 2 testes |
| `mudar_status` volta a aceitar as irreversiveis | 3 testes |

### Completion Notes List

- **Task 1** — migration `0010`: tabela `confirmacoes` (escopo triplo, hash,
  uso unico, prazo) e `audit_entries.motivo`, com assercao contra o catalogo.
- **Task 2** — `ConfirmationRequired` e `MotivoObrigatorio`,
  `ACOES_IRREVERSIVEIS` no dominio, capacidades `fechaOuCancela` e `reabre`,
  quatro acoes novas em `ACOES`.
- **Task 3** — port, adapter e servico da confirmacao; consumo atomico com o
  escopo inteiro no `WHERE`.
- **Task 4** — **um** command parametrizado, com a ordem visibilidade →
  autorizacao → transicao → motivo → confirmacao → mutacao.
- **Task 5** — tres tools finas sobre o mesmo command; `mudar_status` intocado.
- **Task 6** — **647 testes** (eram 605), cobertura **98,56%**; 20 mutacoes,
  20 reprovacoes.
- **Task 7** — PRD (FR-7, FR-15, FR-17) e spine (AD-7 implementado).

**Nao provado — registrado em vez de deixado implicito:**

1. **Nenhum protocolo do lado do servidor prova que um HUMANO confirmou.** A IA
   pode encadear as duas chamadas em 200 ms. O que existe: nada muda sem um
   sinal que o SERVIDOR emitiu, o sinal e um fato no banco (nao um campo que
   quem chama preenche), e as duas etapas ficam no Log com seus instantes. O
   human-in-the-loop de verdade acontece no cliente MCP, fora do nosso alcance.
2. **`confirmacoes` cresce para sempre.** Nao ha expurgo de linhas expiradas ou
   usadas — mesma divida ja registrada para o Log de auditoria.
3. **O motivo da reabertura nao chega ao Solicitante.** Ele nao ve o Log (1.8).
   Se um dia precisar, e decisao de produto nova, e a forma seria um Comentario
   publico **alem** do registro — nunca no lugar dele.
4. **Ninguem monta o servidor MCP.** A divida de wiring registrada na 2.5 vale
   aqui tambem: `criarServidorMcp` agora exige `confirmacao` nas deps, e
   continua sem raiz de composicao que a forneca.
5. **`ver_chamado` nao expoe o motivo nem o historico de encerramentos.** Quem
   quiser saber por que um Chamado foi reaberto le o Log (1.8).

### File List

- `drizzle/migrations/0010_confirmacoes.sql` (novo) e `drizzle/schema.ts`
- `src/domain/acoes-irreversiveis.ts` + teste (novos)
- `src/domain/auditoria.ts`, `papeis.ts`, `errors.ts` (modificados)
- `src/application/ports/confirmacao-repository.ts` (novo)
- `src/application/ports/ticket-repository.ts` (modificado)
- `src/application/contracts/acao-irreversivel.ts` (novo)
- `src/application/commands/acao-irreversivel.ts` + teste (novos)
- `src/platform/confirmacao/confirmacao-de-acao.ts` (novo)
- `src/adapters/persistence/confirmacao-repository.ts` (novo)
- `src/adapters/persistence/ticket-repository.ts` (modificado — `motivo`)
- `src/adapters/persistence/acao-irreversivel.test.ts` (novo — integracao)
- `src/adapters/mcp/server.ts` + teste (modificados — tres tools)
- Dubles de teste (modificados)
- `scratchpad/mutacoes-26.py` (novo)
- `prd.md` (FR-7, FR-15, FR-17) e `ARCHITECTURE-SPINE.md` (AD-7)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-18 | Story criada; decidido por delegação que a confirmação é um token emitido pelo servidor (uso único, 5 min, escopo Chamado+ação+identidade), que o motivo da reabertura vai para `audit_entries.motivo` e que os três casos de confirmação inválida têm resposta cega |
| 2026-08-18 | Tasks 1–5: migration, domínio, port/adapter/serviço, um command e três tools |
| 2026-08-18 | Task 6: 647 testes, cobertura 98,56%; 20 mutações, 20 reprovações (uma sobreviveu na primeira rodada por teste fraco) |
| 2026-08-18 | Task 7: FR-7, FR-15 e FR-17 no PRD; AD-7 marcado como implementado na spine |
