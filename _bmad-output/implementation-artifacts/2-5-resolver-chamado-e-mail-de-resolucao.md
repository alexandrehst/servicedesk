---
baseline_commit: cd9453e
---

# Story 2.5: Resolver Chamado + e-mail de resolução

Status: review

## Story

As a Agente,
I want marcar um Chamado como Resolvido,
so that o Solicitante saiba que foi atendido.

## Acceptance Criteria

1. **Given** um Chamado em andamento
   **When** o Agente o Resolve
   **Then** o Status vai para `resolvido` e um e-mail de resolução é enviado
   ao Solicitante (FR-7, FR-18)
   **And** o e-mail traz **quem resolveu** e o **tempo total** entre a abertura
   e a resolução.

2. **Given** um Chamado que voltou para `em_andamento` depois de resolvido
   **When** ele é Resolvido de novo
   **Then** um **novo** e-mail de resolução é disparado — a re-resolução
   re-notifica, e nada guarda "já avisei".

3. **Given** uma transição que **não** é para `resolvido`
   **When** ela acontece
   **Then** nenhum e-mail é enviado — o Solicitante recebe e-mail na abertura e
   na resolução, e só (FR-18: "apenas abertura e resolução no MVP, sem ruído").

4. **Given** uma versão desatualizada (`Conflict`) ou um Chamado excluído entre
   a leitura e a escrita
   **When** a resolução é pedida
   **Then** **nenhum e-mail sai** — escrita que não aconteceu não notifica
   ninguém, pelo mesmo raciocínio da auditoria na 1.7.

5. **Given** o servidor SMTP fora do ar
   **When** a resolução é gravada
   **Then** a mudança de Status **permanece** e a falha vira registro
   estruturado no logger — não propaga e não é engolida (spine §Notificação).

## Tasks / Subtasks

- [x] **Task 1 — Duração legível no domínio** (AC: #1)
  - [x] `duracaoLegivel(de: Date, ate: Date): string` em `domain/duracao.ts`,
        função pura, sem I/O
  - [x] Teste de tabela: minutos, horas, dias, virada de unidade e o caso
        degenerado (`ate <= de`)
- [x] **Task 2 — Port de notificação** (AC: #1)
  - [x] `ChamadoResolvido` e `enviarChamadoResolvido` em
        `application/ports/notificador-de-chamado.ts`
  - [x] O port recebe `duracao` **já em texto**: quem calcula é o command, para
        que MCP e HTTP produzam a mesma frase
- [x] **Task 3 — Extrair o canal de notificação** (AC: #1, #5)
  - [x] `application/commands/notificacao-de-chamado.ts` com o bloco
        `criarLink → montarUrl → enviar → catch/log` que hoje só existe em
        `abrir-chamado.ts`
  - [x] `abrir-chamado.ts` passa a **usar** o helper (a 1.6 continua passando,
        sem mudança de comportamento)
- [x] **Task 4 — O command notifica ao resolver** (AC: #1, #2, #3, #4, #5)
  - [x] `notificacao?` opcional em `MudarStatusDeps`, no molde de
        `AbrirChamadoDeps`
  - [x] Notificar **depois** do `mudarStatusComAuditoria` e **somente** quando
        ele devolveu linha e `para === 'resolvido'`
  - [x] `agora()` injetado — o tempo total é `criadoEm → agora()`
- [x] **Task 5 — Adapter de e-mail** (AC: #1)
  - [x] `enviarChamadoResolvido` em `adapters/email/smtp.ts`, com Número no
        assunto (é por ele que a pessoa acha o e-mail)
  - [x] Teste pelo `jsonTransport`, conferindo destinatário, assunto, quem
        resolveu, tempo total e link
- [x] **Task 6 — Testes** (AC: #1..#5)
  - [x] Recusa e não-envio **antes** do caminho feliz
  - [x] Ciclo `em_andamento → resolvido → em_andamento → resolvido` com **dois**
        e-mails (AC #2), contra o Postgres real
  - [x] **Verificar por mutação** — `scratchpad/mutacoes-25.py`, com tabela no
        Dev Agent Record
- [x] **Task 7 — Registrar** (AC: —)
  - [x] FR-7/FR-18 no PRD e AD-5 na spine: **resolver continua sendo
        `mudar_status`**, e a notificação é consequência da transição
  - [ ] `RESUME.md` e o prompt do loop (PR `docs:` separado, depois do merge)

## Dev Notes

### A decisão desta story: resolver **não** ganha tool dedicada

O caminho `em_andamento → resolvido` **já existe** em `TRANSICOES`
(`domain/transicoes.ts`, Story 2.2) e já é executável por `mudar_status` hoje.
A pergunta desta story não é "como resolver", é **onde o e-mail entra**.

**Decisão (por delegação): a resolução continua sendo `mudar_status`, e o envio
do e-mail é consequência da transição, dentro do command `mudarStatus`.**

O que sustenta:

- **O PRD já descreve assim.** UJ-1: *"ele resolve e pede 'marca como resolvido
  e avisa o solicitante'. A IA executa `mudar_status` e o e-mail de resolução
  dispara."* Uma tool nova contrariaria o roteiro que o épico realiza.
- **Um caminho só é o que torna impossível resolver sem notificar.** Se
  existisse `resolver_chamado` **e** `mudar_status` aceitasse `resolvido`,
  haveria duas portas e uma delas não avisaria ninguém. Fechar a segunda porta
  exigiria uma terceira tabela de transições — muito mecanismo para não ganhar
  garantia nenhuma.
- **AD-2 já dá a herança.** O command é o único caminho de escrita, então o
  adapter HTTP e a UI da Fase 1.5 herdam a notificação de graça. Isso é o mesmo
  raciocínio do AD-7 na 2.6: a exigência vive **abaixo** do adapter.

**Consequências, e nenhuma delas é acidente:**

| Não vai existir | Por quê |
| --- | --- |
| Capacidade `resolveChamado` | `mudaStatus` já responde a pergunta: declarar que o problema acabou é atendimento, e é a mesma decisão da 2.2 |
| Ação `resolver_chamado` em `ACOES` | o Log grava `mudar_status` com o par `em_andamento`/`resolvido`, que **é** a informação; um rótulo novo criaria duas formas de registrar a mesma coisa |
| Tool MCP nova | `mudar_status` já a executa |
| Migration | nada de novo para guardar (ver abaixo) |

Isso contraria a expectativa registrada no prompt do loop (que previa
capacidade `resolve` e tool dedicada). A expectativa foi escrita antes de a 2.2
existir; hoje a transição já está na tabela comum, e movê-la de lá seria
desfazer uma decisão testada para reconstruí-la em outro lugar. Registre a
mudança de rumo no PRD, na spine e no prompt.

### Nada de coluna `resolved_at`

O instante da resolução **já está** no Log: `audit_entries` grava
`registradoEm` com o par `de`/`para` desde a 2.2. Uma coluna nova seria uma
segunda fonte da verdade sobre o mesmo fato, e as duas poderiam divergir na
primeira correção manual.

O e-mail precisa do instante **agora**, no momento do envio, e é isso que o
relógio injetado dá. Se o Epic 3 quiser "tempo médio de resolução", ele lê o
Log — que é append-only (FR-22) e já tem tudo.

### O tempo total: relógio injetado, como em todo o resto

`agora: () => Date` é o padrão do projeto (`platform/auth/autenticacao.ts`,
`platform/acesso/link-de-acesso.ts`, `platform/limites/rate-limit.ts`). Sem ele
o teste do tempo total mediria o relógio da máquina de CI.

O cálculo é `ticket.criadoEm → agora()`, e não "o instante que o Postgres
gravou": a diferença entre os dois é o tempo de uma transação, e inventar uma
releitura só para obtê-lo custaria uma ida ao banco por um dado que ninguém vai
conferir. Registre isso — é aproximação deliberada, não descuido.

**`duracaoLegivel` vive no domínio** porque a frase é a mesma para todo ponto de
entrada. Se o adapter de e-mail a montasse, a UI da Fase 1.5 escreveria a sua,
e o mesmo Chamado teria dois "tempo total" ligeiramente diferentes. É o mesmo
raciocínio de `normalizarEmail` (1.9) e `ORIGENS` (1.8): conceito de negócio
duplicado sobe para o domínio.

Sugestão de forma (decida e registre): granularidade única e arredondada para
baixo — `"12 minutos"`, `"3 horas"`, `"2 dias"` — porque "2 dias, 3 horas e 14
minutos" é precisão que ninguém usa num e-mail. Menos de um minuto vira
`"menos de um minuto"`, e o caso degenerado (`ate <= de`, relógio andando para
trás) cai nele em vez de imprimir número negativo.

### Quem resolveu vai no e-mail — e isso é uma exceção consciente

A Story 1.8 escondeu o **Log** do Solicitante justamente porque ele expõe
identidade de Agentes e o ritmo do time. Aqui a AC pede o contrário: o e-mail
diz quem resolveu.

Não é contradição, e a diferença importa: o Log expõe **todas** as identidades e
**todos** os tempos, de todos os Chamados que a pessoa alcança; o e-mail expõe
**um** Agente, no **próprio** Chamado dela, e é a informação de que ela precisa
para saber a quem responder. Registre a decisão — quem revisar vai reparar na
tensão com a 1.8.

Use `autor.identity` (AD-9), nunca o Dono (`assignee`): quem resolveu é quem
executou a ação, e os dois podem ser pessoas diferentes.

### O link: mesma mecânica da abertura

O e-mail de resolução leva o mesmo magic link de acesso ao Chamado da 1.6 —
escopo de um Chamado, 7 dias, reutilizável (`platform/acesso/link-de-acesso.ts`).
FR-18 diz que o e-mail contém "Número, Status e link"; não há motivo para o de
resolução ser o único sem meio de conferir o que foi feito.

Cada resolução emite um link novo. É o comportamento já existente de
`criarLinkDeAcesso`, e o custo é uma linha em `ticket_access`.

### O que NÃO pode acontecer: e-mail antes da escrita

A ordem é **gravar, depois notificar** — e a notificação só acontece se o
`UPDATE` afetou linha:

```ts
const resultado = await repositorio.mudarStatusComAuditoria({...})
if (resultado === null) {
  return conflitoOuSumico(repositorio, input.numero, autor)   // sem e-mail
}
if (para === 'resolvido' && notificacao !== undefined) { ... }
```

Notificar antes, ou sem checar `resultado`, avisaria o Solicitante de uma
resolução que perdeu o conflito e **não aconteceu**. É a lição da 1.7 ("escrita
que não aconteceu não vira auditoria") aplicada ao e-mail — e é a mutação mais
importante desta story (AC #4).

E o envio fica **fora** da transação, depois do commit (spine §Notificação,
decisão da 1.6): dentro dela, o SMTP prenderia a linha do Chamado e desfaria a
resolução se falhasse.

### Extraia o canal antes que o Sonar reprove

`abrir-chamado.ts` tem hoje `notificarAbertura`: `criarLink` → `montarUrl` →
`enviar` → `catch` + `logger.erro`. A resolução faz exatamente o mesmo, com
outra mensagem. Copiar são ~20 linhas duplicadas em código novo, e o gate do
Sonar reprova acima de 3% — foi o que aconteceu no PR #50, e a extração deixou
as mutações **mais fortes**, não só o gate verde.

Extraia para `application/commands/notificacao-de-chamado.ts` o que é comum, e
deixe fora o que difere (a mensagem). O que o helper precisa garantir, e que uma
cópia perderia:

- a falha **não propaga** — a escrita já aconteceu e desfazê-la não é opção;
- a falha **não some** — vira `logger.erro` estruturado (pilar Observável);
- **nada de token, link ou corpo no log** (AD-9): qual Chamado, para quem, e o
  que o transporte disse.

Se `abrir-chamado.ts` não ficar mais curto depois da extração, ela foi feita no
lugar errado.

### Use os helpers do épico — a story deve ser curta

| Use | Onde | O que carrega |
| --- | --- | --- |
| `mudarStatusComAuditoria` | `adapters/persistence/ticket-repository.ts` | já existe; **não** crie método novo |
| `conflitoOuSumico` | `application/commands/mutacao-versionada.ts` | separa `Conflict` de `TicketNaoEncontrado` |
| `criarHandler` | `adapters/mcp/server.ts` | autenticar → limitar → executar |

A 2.4 custou **67 linhas de produção** por usar os três. Esta muda menos ainda
no caminho de escrita (nenhuma coluna, nenhum método de repositório, nenhuma
tool): o que ela acrescenta é o port, a duração, o canal extraído e o ramo de
notificação. **Se você estiver escrevendo `db.transaction`, um `try/catch` de
handler ou um segundo `UPDATE`, parou no lugar errado.**

### Testes: onde cada garantia se prova

| Garantia | Onde testar | Por quê aqui |
| --- | --- | --- |
| Duração legível | `domain/duracao.test.ts` | função pura, tabela de casos |
| Notifica só ao resolver (AC #1, #3) | teste do command, com duble de notificador | é regra de negócio, não de transporte |
| Conflito não notifica (AC #4) | teste do command, com repositório devolvendo `null` | o duble é o único jeito de forçar o `null` sem corrida |
| Re-resolução re-notifica (AC #2) | **integração** com Postgres real | o ciclo depende de `version` andando de verdade |
| Falha de SMTP não propaga (AC #5) | teste do command, notificador que lança | prova o `catch` **e** o log |
| Formato do e-mail | `adapters/email/smtp.test.ts` com `jsonTransport` | monta a mensagem sem servidor (padrão da 1.6) |

**Não teste o conteúdo do e-mail pelo command** — ele passa dados ao port; quem
monta texto é o adapter. Teste que inspeciona efeito pela própria biblioteca
costuma mentir (lição da 1.6).

### Mutações que esta story precisa reprovar

Vão em `scratchpad/mutacoes-25.py`, **versionado e commitado** (a 1.8 citou um
script que nunca foi versionado e a prova sumiu). Rode `biome check --write`
**antes** de escrever os alvos, e ancore cada um em algo único — as duas
mutações sobreviventes da 2.4 foram alvo ambíguo e alvo evaporado pelo
formatador, não código fraco.

| Mutação | Deve reprovar |
| --- | --- |
| Notificar em **qualquer** transição, não só `resolvido` | AC #3 |
| **Não** notificar ao resolver | AC #1 |
| Notificar **antes** de checar `resultado === null` | AC #4 |
| Mandar `assignee` em vez de `autor.identity` como "quem resolveu" | AC #1 |
| Propagar o erro do notificador (remover o `catch`) | AC #5 |
| Engolir o erro sem logar (`catch {}` vazio) | AC #5 |
| Guardar "já notifiquei" e pular a segunda resolução | AC #2 |
| `duracaoLegivel` arredondando para cima / devolvendo negativo | Task 1 |

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Fechar, cancelar, reabrir (e a confirmação do AD-7) | Story 2.6 |
| E-mail de qualquer outro evento (comentário, atribuição, prioridade) | FR-18 é explícito: só abertura e resolução |
| Notificar o **Agente** de alguma coisa | não está no MVP |
| Tempo médio de resolução / SLA | Epic 3 e Fase 1.5+ |
| Portal onde o link abre | Fase 1.5 |

### Regressões a não causar

- `abrir-chamado.ts` muda de forma (usa o helper) mas **não** de comportamento:
  os testes da 1.6 devem passar sem edição. Se você precisou mexer neles, a
  extração mudou semântica.
- `mudarStatus` sem `notificacao` continua funcionando — o parâmetro é opcional
  pelo mesmo motivo da 1.6: há caminhos (testes, futuros scripts) sem para quem
  avisar, e torná-lo obrigatório viraria acoplamento.
- `mudar_status` continua recusando `resolvido → fechado` e as demais
  irreversíveis (`exigeConfirmacao`). O teste de não-sobreposição das tabelas
  não pode ser tocado.

### References

- [Source: epics.md#Story 2.5]
- [Source: prd.md#FR-7] — Resolver, e as irreversíveis que ficam na 2.6
- [Source: prd.md#FR-18] — só abertura e resolução; Número, Status e link
- [Source: prd.md#UJ-1] — "a IA executa `mudar_status` e o e-mail dispara"
- [Source: ARCHITECTURE-SPINE.md#AD-5] — as duas tabelas de transição
- [Source: ARCHITECTURE-SPINE.md#AD-10] — versão conferida no `UPDATE`
- [Source: ARCHITECTURE-SPINE.md#Notificação] — e-mail fora da transação, falha não engolida
- [Source: 1-6-e-mail-de-abertura.md] — magic link de 7 dias, `jsonTransport`
- [Source: 2-2-mudar-status-maquina-de-estados.md] — `mudarStatusComAuditoria`, `conflitoOuSumico`
- [Source: 2-4-mudar-prioridade.md] — o preço de usar os helpers, e o alvo de mutação

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A story nao criou mutacao de campo nova, e isso foi a decisao central.**
Resolver ja era uma transicao de `TRANSICOES` (2.2), executavel por
`mudar_status`. O que faltava era o e-mail — e a pergunta real era *onde ele
entra*. Uma tool `resolver_chamado` teria custado tabela nova de transicoes,
capacidade, acao de Log, contrato, command e handler, para criar **duas portas
para o mesmo estado**, uma delas sem notificacao. Custo de producao final:
**63 linhas** (duracao 43 + canal 20, fora comentarios), mais o ramo de tres
linhas no command.

**A extracao veio antes do Sonar, e nao depois.** `abrir-chamado.ts` ja tinha o
bloco `criarLink -> montarUrl -> enviar -> catch/log`; copia-lo seriam vinte
linhas duplicadas em codigo novo — exatamente o que reprovou o PR #50 com 9%.
`notificarComLink` deixou os dois commands com **so a mensagem**, e o efeito
apareceu nas mutacoes: "falha de e-mail propaga" reprova **7 testes** e "catch
vazio" reprova **5**, porque agora ha um unico lugar onde esses erros sao
possiveis. O `abrir-chamado.ts` ficou menor, e os testes da 1.6 passaram sem
uma linha editada.

**O teste de integracao mediu o relogio errado na primeira tentativa.** O
`criadoEm` vem do `defaultNow()` do Postgres, entao o "tempo total" saiu como
"13 minutos" — a distancia entre o horario da suite e o `agora()` fixo. A
correcao foi **fixar `criado_em` direto no banco** e ler pelo command: alem de
determinismo, e a licao do `assignee` (2.3) aplicada de novo — o teste agora
prova que a duracao sai do banco, e nao de um literal.

**Quinze mutacoes, quinze reprovacoes** (`scratchpad/mutacoes-25.py`). Duas
merecem nota:

- **"Notificar antes de saber se o UPDATE casou"** reprova 10 testes. E a
  licao da 1.7 ("escrita que nao aconteceu nao vira auditoria") aplicada ao
  e-mail: avisar o Solicitante de uma resolucao que perdeu o conflito seria
  mentira, e um `Conflict` e um caso que acontece de verdade.
- **"Guardar 'ja avisei'"** reprova 9. Foi escrita porque a otimizacao parece
  razoavel — e destruiria a AC #2.

| Mutacao aplicada | Reprovou |
| --- | --- |
| Notificar em QUALQUER transicao, nao so na resolucao | 9 testes |
| NAO notificar ao resolver | 11 testes |
| Notificar ANTES de saber se o UPDATE casou | 10 testes |
| Guardar "ja avisei" e nao re-notificar a re-resolucao | 9 testes |
| Quem resolveu vira o Dono, e nao quem executou | 1 teste |
| Mandar o e-mail para quem resolveu, e nao para o Solicitante | 3 testes |
| Medir o tempo total do instante da leitura | 2 testes |
| Falha de e-mail PROPAGA e derruba a resolucao | 7 testes |
| Falha de e-mail engolida sem log (catch vazio) | 5 testes |
| Token do link vaza para o log da falha | 4 testes |
| Duracao arredondada para CIMA (dias) | 3 testes |
| Duracao negativa vira numero | 4 testes |
| Duracao arredondada para cima (horas) | 3 testes |
| E-mail de resolucao sem quem resolveu | 1 teste |
| E-mail de resolucao sem o tempo total | 1 teste |

### Completion Notes List

- **Task 1** — `duracaoLegivel` em `domain/duracao.ts`: granularidade unica,
  arredondada para baixo, e `"menos de um minuto"` para o caso degenerado.
- **Task 2** — `ChamadoResolvido` e `enviarChamadoResolvido` no port, com a
  duracao ja em texto.
- **Task 3** — `notificarComLink` extraido; `abrir-chamado.ts` passou a usa-lo
  sem mudanca de comportamento.
- **Task 4** — o command notifica **depois** da escrita, so quando ela casou e
  so quando o destino e `resolvido`; `agora()` injetado.
- **Task 5** — e-mail de resolucao no adapter SMTP, com Numero no assunto (mesmo
  formato do de abertura) e o convite a responder, que e o unico caminho de
  volta que o Solicitante tem (intake da 1.9).
- **Task 6** — **588 testes** (eram 551), cobertura **98,75%**; 15 mutacoes,
  15 reprovacoes.
- **Task 7** — FR-7 e FR-18 no PRD, AD-5 na spine.

**Nao provado — registrado em vez de deixado implicito:**

1. **O "tempo total" e aproximado por decisao.** Ele mede `criadoEm ->
   agora()`, e nao o instante que o Postgres gravou a resolucao. A diferenca e
   o tempo de uma transacao; obter o instante exato custaria uma releitura por
   um dado que ninguem confere.
2. **Nenhum e-mail chega de verdade, e o canal nao esta LIGADO.** Duas coisas
   distintas, as duas herdadas da 1.6 e apontadas pelo `claude-review` no PR
   #58:
   - nao ha credencial SMTP neste ambiente — o que os testes provam e que a
     mensagem e montada e aceita pelo Nodemailer (`jsonTransport`);
   - **`criarHandlerMudarStatus` monta `mudarStatus({ repositorio })` sem
     `notificacao`**, exatamente como `criarHandlerAbrirChamado` faz desde a
     1.6. Enquanto nao existir raiz de composicao, o e-mail desta story **nao
     dispara em producao** — e ligar so a resolucao criaria a assimetria de o
     MCP notificar a resolucao e nao a abertura.

   Nao ha story de bootstrap no backlog: a **topologia de deploy segue
   `Deferred`** na spine, e e ela que decide quem monta o servidor MCP, com
   quais credenciais e com qual `baseUrl`. Quando essa story existir, o wiring
   dos dois e-mails (e do agendador do intake da 1.9, pronto e desligado) e
   trabalho dela.
3. **O link do e-mail nao abre nada.** O portal e Fase 1.5;
   `resolverAcessoAoChamado` existe e e testado, mas nenhum adapter o serve.
4. **A resolucao nao muda mais nada no Chamado.** Nao ha `resolved_at`, nao ha
   SLA, e nada impede um Chamado ficar `resolvido` para sempre — fechar e a
   2.6.
5. **`enviarChamadoAberto` e `enviarChamadoResolvido` sao o port inteiro.**
   Se um terceiro evento precisar notificar, a decisao de FR-18 ("apenas
   abertura e resolucao, sem ruido") precisa ser revisitada antes.

### File List

- `src/domain/duracao.ts` + `src/domain/duracao.test.ts` (novos)
- `src/application/ports/notificador-de-chamado.ts` (modificado — `ChamadoResolvido`)
- `src/application/commands/notificacao-de-chamado.ts` (novo — canal extraido)
- `src/application/commands/abrir-chamado.ts` (modificado — usa o canal)
- `src/application/commands/mudar-status.ts` (modificado — notifica ao resolver)
- `src/application/commands/mudar-status.test.ts` (modificado)
- `src/adapters/email/smtp.ts` + `smtp.test.ts` (modificados)
- `src/adapters/persistence/resolucao-de-chamado.test.ts` (novo — integracao)
- `src/adapters/persistence/notificacao-de-abertura.test.ts` (modificado — dubles)
- `scratchpad/mutacoes-25.py` (novo)
- `_bmad-output/planning-artifacts/prds/.../prd.md` (FR-7, FR-18)
- `_bmad-output/planning-artifacts/architecture/.../ARCHITECTURE-SPINE.md` (AD-5)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Data | Evento |
|---|---|
| 2026-08-18 | Story criada; decidido por delegação que resolver continua em `mudar_status` (sem tool, capacidade, ação de Log ou migration novas) e que o instante da resolução não vira coluna |
| 2026-08-18 | Tasks 1–5: `duracaoLegivel`, port, canal extraído, notificação no command e e-mail no adapter |
| 2026-08-18 | Task 6: 588 testes, cobertura 98,75%; 15 mutações, 15 reprovações |
| 2026-08-18 | Task 7: FR-7 e FR-18 no PRD, AD-5 na spine |
