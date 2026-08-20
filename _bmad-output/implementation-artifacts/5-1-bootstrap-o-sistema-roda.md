---
baseline_commit: 86a9eb7
---

# Story 5.1: Bootstrap — o sistema roda

Status: review

## Story

As a dono do projeto,
I want conectar o ServiceDesk a um cliente MCP e abrir um Chamado de verdade,
so that o que está verificado por testes passe a ser usável por pessoas.

## Por que esta story existe fora do MVP planejado

O MVP tem 973 testes verdes e **nenhum jeito de rodar**. Não há raiz de
composição: `criarServidorMcp` só é chamado pelos testes, e o `package.json` não
tem `start`.

A consequência já estava registrada desde o Epic 1, e cada épico a empurrou:
**os dois e-mails do FR-18 e o agendador do intake (1.9) estão prontos e
desligados**, porque não existe o lugar onde ligá-los.

Isso foi aceitável enquanto o objetivo era construir com verificação. Deixa de
ser agora: o corte do contrato exige **um mês de operação em paralelo**
(Story 4.4), e não se opera o que não sobe.

## Acceptance Criteria

1. **Given** as variáveis de ambiente configuradas
   **When** `pnpm start` roda
   **Then** o servidor MCP sobe por **stdio** e responde ao handshake de um
   cliente real.

2. **Given** o servidor conectado a um cliente MCP
   **When** uma tool é chamada
   **Then** ela executa contra o Postgres real, com autenticação, rate limit e
   auditoria — o caminho inteiro, não um atalho de desenvolvimento.

3. **Given** uma variável de ambiente obrigatória ausente
   **When** o processo inicia
   **Then** ele **falha imediatamente**, dizendo qual falta — nunca sobe pela
   metade.

4. **Given** um Chamado aberto ou resolvido
   **When** o canal de notificação está configurado
   **Then** o e-mail do FR-18 é enviado; **e quando não está**, o sistema
   funciona sem ele e **diz** que está desligado.

5. **Given** o intake por e-mail configurado
   **When** o agendador roda
   **Then** ele varre a caixa periodicamente, e uma varredura que falha **não
   derruba o servidor MCP**.

6. **Given** o `README`
   **When** alguém quer rodar pela primeira vez
   **Then** há o passo a passo, incluindo como conectar num cliente MCP.

## Tasks / Subtasks

- [x] **Task 1 — Config validada na borda** (AC: #3)
  - [x] `src/bootstrap/config.ts` com schema Zod (AD-6)
  - [x] Obrigatórias × opcionais **declaradas**, com o que cada ausência desliga
- [x] **Task 2 — A raiz de composição** (AC: #2, #4)
  - [x] `src/bootstrap/montar.ts`: monta repositórios, auth, rate limit,
        logger, confirmação e o canal de notificação
  - [x] **Sem lógica de negócio** — só fiação (AD-1)
- [x] **Task 3 — O entrypoint** (AC: #1)
  - [x] `src/bootstrap/servidor-mcp.ts` + `pnpm start`
  - [x] Encerramento limpo (SIGINT/SIGTERM fecham o pool)
- [x] **Task 4 — Ligar os e-mails do FR-18** (AC: #4)
  - [x] `abrirChamado` e a resolução recebem o canal quando configurado
- [x] **Task 5 — O agendador do intake** (AC: #5)
  - [x] Laço com intervalo; falha de varredura **registra e continua**
- [x] **Task 6 — Testes** (AC: #1..#5)
  - [x] Config: ausência obrigatória falha; opcional ausente desliga o recurso
  - [x] Montagem: as tools existem e o principal carrega `origin: 'mcp'`
  - [x] Agendador: uma varredura que lança **não** para o laço
  - [x] `scratchpad/mutacoes-51.py`, com conferência prévia de alvos
- [x] **Task 7 — README e registro** (AC: #6)
  - [x] Passo a passo e exemplo de configuração de cliente MCP
  - [x] `RESUME.md`: a dívida deixa de existir

## Dev Notes

### O que já existe, e por isso esta story é fiação e não construção

Verificado no código em 2026-08-20 — **todas as peças estão prontas**:

| Peça | Onde |
| --- | --- |
| `criarServidorMcp(deps)` | `adapters/mcp/server.ts` |
| `criarTicketRepository`, `criarIdentityRepository`, `criarRateLimitRepository`, `criarConfirmacaoRepository`, `criarTicketAccessRepository` | `adapters/persistence/` |
| `resolverPrincipal`, `resolverPrincipalDeTokenMcp` | `platform/auth/autenticacao.ts` |
| `criarLimitador` | `platform/limites/rate-limit.ts` |
| `criarLogger` | `platform/logging/logger.ts` — **já escreve em `stderr`**, decidido na 1.6 exatamente porque "o transporte MCP padrão é stdio, e o `stdout` carrega o protocolo" |
| `emitirConfirmacao`, `consumirConfirmacao` | `platform/confirmacao/confirmacao-de-acao.ts` |
| `criarNotificadorPorEmail`, `transporterSmtp` | `adapters/email/smtp.ts` |
| `criarCaixaImap`, `conectarPorImap` | `adapters/email/imap.ts` |
| `criarVarredura` | `adapters/email/varredura.ts` |
| Transporte stdio | `@modelcontextprotocol/server/stdio` |

**Não escreva regra nova.** Se algo parecer faltar, é sinal de que a fiação está
errada — não de que falta código de negócio.

### A autenticação é a decisão que molda o entrypoint

`McpDeps.autenticar` é `() => Promise<Omit<Principal, 'origin'>>` — sem
parâmetro. O comentário no tipo explica: ela é chamada **a cada tool**, não uma
vez na montagem, porque "uma conexão MCP dura horas, e resolver uma única vez
faria a sessão de 8 horas valer para sempre depois de aberta".

Mas de onde vem a credencial num transporte stdio? **Não há cabeçalho HTTP.**

**Decisão (por recomendação): a credencial vem de variável de ambiente
(`SERVICEDESK_MCP_TOKEN`), e é resolvida a CADA chamada** com
`resolverPrincipalDeTokenMcp`. Assim:

- o processo é de **uma identidade** — o token de máquina do cliente MCP
  (Story 1.5), que tem identidade própria em `users` e papel próprio (AD-9);
- **revogar o token derruba o acesso na chamada seguinte**, sem reiniciar nada,
  porque a resolução vai ao banco toda vez. A Story 4.3 fez o `innerJoin` com
  `users` justamente para isso valer imediatamente;
- ler o token uma vez na montagem e guardá-lo em memória **não** é atalho
  aceitável: seria a sessão eterna que o comentário do tipo proíbe.

**Registre a consequência:** um processo = uma identidade. Duas pessoas usando o
mesmo servidor stdio agem como o mesmo bot no Log. Para identidade por pessoa é
preciso transporte com sessão (HTTP), que é outra story — e a topologia de
deploy segue `Deferred`.

### Config: falhar alto, e dizer o que desliga

O padrão do projeto é falhar alto quando o estado é impossível (`pode()` com
papel desconhecido, `papelSchema.parse`). A config segue: **schema Zod validado
na borda**, e o processo morre com mensagem clara se faltar obrigatória.

| Variável | Obrigatória? | O que a ausência causa |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | não sobe |
| `SERVICEDESK_MCP_TOKEN` | ✅ | não sobe |
| `SMTP_*`, `EMAIL_REMETENTE`, `BASE_URL` | ❌ | **e-mails do FR-18 desligados**, e o log **avisa** |
| `IMAP_*` | ❌ | **intake desligado**, e o log **avisa** |
| `INTAKE_INTERVALO_MS` | ❌ | padrão 60 s |

**Opcional ausente não pode ser silencioso.** Um intake desligado e um intake
quebrado se parecem: a Story 1.9 registrou isso (`aviso` existe no `Logger`
porque "silêncio não é opção — uma recusa invisível faz um intake quebrado
parecer um intake sem demanda"). No boot, registre **o que ficou desligado**.

### O agendador não pode derrubar o servidor

`criarVarredura` já garante que **uma mensagem ruim não derruba o lote**. Falta
a camada de cima: **uma varredura inteira que falhe** — IMAP fora do ar, credencial
expirada — não pode matar o processo que serve as tools.

**Decisão: `setInterval` com `catch` que registra e segue.** E não `setTimeout`
recursivo com backoff: complexidade que ninguém pediu, e uma caixa fora do ar
por uma hora é um problema de operação, não de retry sofisticado.

**Cuidado:** duas varreduras concorrentes processariam a mesma mensagem duas
vezes. O `UNIQUE` de `email_intake` (1.9) impede o Chamado duplicado — mas gerar
a corrida de propósito é desperdício. **Guarde um sinal de "varredura em
andamento" e pule o tique se ainda estiver rodando.**

### Encerramento limpo

`SIGINT`/`SIGTERM` devem fechar o pool do Postgres e parar o agendador. Sem
isso, cada reinício deixa conexões penduradas até o timeout do servidor — e em
desenvolvimento, com reinícios frequentes, o pool acaba.

### O que testar, e o que NÃO testar

**Testar:** a config (obrigatória ausente falha; opcional ausente desliga e
avisa), a montagem (as tools esperadas existem; o principal carrega
`origin: 'mcp'`), e o agendador (varredura que lança não para o laço).

**Não testar:** que o stdio funciona — isso é a biblioteca. O teste seria um
duble do transporte confirmando que `connect` foi chamado, o que não prova nada
(a lição da 4.2: um duble prova o contrato que você imaginou).

**Sondas:**

- **config**: o teste precisa provar que o processo **não sobe**, não que
  "lança em algum lugar";
- **desligado ≠ quebrado**: sem SMTP, abrir Chamado **funciona** e há registro
  de que o e-mail está desligado. Se o teste só verificar que não lançou,
  passaria com o e-mail sumindo em silêncio;
- **agendador**: a segunda varredura acontece **depois** de a primeira lançar.
  Um teste que só verifique "não lançou" passa com o laço morto.

### Mutações obrigatórias

`scratchpad/mutacoes-51.py`, com a conferência prévia de alvos (4.2). Confira
`git status` depois de rodar.

| Mutação | Deve reprovar |
| --- | --- |
| Config obrigatória ausente passa a subir com valor vazio | AC #3 |
| Recurso opcional desligado deixa de ser registrado | AC #4 |
| `autenticar` resolve uma vez e guarda em memória | AC #2 |
| Falha de varredura para o agendador | AC #5 |
| O agendador dispara varreduras concorrentes | — |
| O principal deixa de carregar `origin: 'mcp'` | AC #2 |

### Escopo — o que esta story NÃO faz

| Fora | Por quê |
| --- | --- |
| Transporte HTTP | exige decidir a topologia de deploy (`Deferred` na spine) |
| Identidade por pessoa no MCP | depende do transporte com sessão |
| Dockerfile / deploy | mesma dependência |
| Adapter HTTP da API | o MVP é MCP-first; a origem `api` existe no Log e nada a produz |
| Migrations automáticas no boot | `pnpm db:migrate` é explícito, e assim continua — migration rodando sozinha em produção é como se perde uma base |

### Regressões a não causar

- **Nenhuma mudança em `application` ou `domain`.** Se precisar, a fiação está
  errada.
- **O logger continua em `stderr`.** Uma linha em `stdout` corrompe o protocolo.
- **`criarServidorMcp` não muda de assinatura.** Os 973 testes montam `McpDeps`
  à mão, e é assim que devem continuar montando.

### References

- [Source: 1-5-*.md] — token de máquina com identidade própria (AD-9)
- [Source: 1-6-*.md] — o logger em `stderr`, decidido por causa do stdio
- [Source: 1-9-*.md] — `criarVarredura`, e `aviso` porque silêncio não é opção
- [Source: 4-3-*.md] — revogação vale imediatamente por causa do `innerJoin`
- [Source: 4-4-*.md] — o mês em paralelo exige o sistema no ar
- [Source: ARCHITECTURE-SPINE.md] — topologia de deploy `Deferred`

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Code)

### Debug Log References

- `pnpm test` — **995 testes verdes** (eram 973); `typecheck`, `lint`, `arch` e
  `build` limpos
- **Verificado a mão contra um cliente MCP real**, falando JSON-RPC por stdio:
  handshake, `tools/list` com 18 tools, e o ciclo completo de um Chamado

### Completion Notes List

**O sistema roda.** Foi verificado de ponta a ponta, não só por testes:

```
HANDSHAKE: {'name': 'servicedesk', 'version': '0.1.0'}
TOOLS (18): abrir_chamado, atribuir_chamado, buscar_chamados, cancelar_chamado,
            chamados_parecidos, comentar_chamado, excluir_chamado,
            excluir_comentario, excluir_usuario, exportar_csv, fechar_chamado,
            importar_csv, mudar_prioridade, mudar_status, reabrir_chamado,
            relatorio_de_operacao, resumo_fila, ver_chamado
ABRIR    : Chamado #1001 aberto (aberto).
COMENTAR : Comentario interno adicionado ao Chamado #1001.
STATUS   : Chamado #1001: aberto -> em_andamento (versao 2).
ATRIBUIR : Chamado #1001 atribuido a bot@empresa.com (versao 3).
STATUS   : Chamado #1001: em_andamento -> resolvido (versao 4).
FECHAR   : [ConfirmationRequired] ... e IRREVERSIVEL e exige confirmacao humana
FECHAR ok: Chamado #1001: resolvido -> fechado (versao 5).
RELATORIO: mediana 0.0h, media 0.0h (1 Chamado). 100% das acoes vieram pelo MCP.
```

E o Log, no banco, conta a história inteira — incluindo o `solicitar_confirmacao`
**antes** do `fechar_chamado`, que é a evidência de human-in-the-loop que o AD-7
existe para deixar.

### A decisão central: a credencial é resolvida a CADA chamada

`McpDeps.autenticar` não recebe parâmetro e é chamado por tool. Num transporte
stdio não há cabeçalho, então a credencial vem do ambiente — e a tentação óbvia
seria resolvê-la uma vez na montagem e guardar o principal.

**Seria exatamente a sessão eterna que o comentário do tipo proíbe:** "uma
conexão MCP dura horas, e resolver uma única vez faria a sessão de 8 horas valer
para sempre depois de aberta".

Indo ao banco toda vez, **revogar o token derruba o acesso na chamada seguinte**,
sem reiniciar nada — e há teste que prova, revogando no banco entre duas
chamadas. A Story 4.3 fez o `innerJoin` com `users` justamente para que remoção
valesse imediatamente; esta story é onde isso passa a ter efeito prático.

**Consequência registrada:** um processo = uma identidade. Duas pessoas no mesmo
servidor stdio agem como o mesmo bot no Log (AD-9). Identidade por pessoa exige
transporte com sessão, e isso depende da topologia de deploy.

### Bloco de configuração vem inteiro ou não vem

`SMTP_HOST` sem `SMTP_PASS` é o caso perigoso: alguém **tentou** configurar
e-mail. Tratar como "desligado" esconderia o erro de digitação, e o operador só
descobriria quando percebesse que nenhum e-mail chegou. Tratar como fatal
derrubaria o servidor por um recurso opcional.

**Decisão: lança, com o nome do que falta.** Ninguém preenche metade das
credenciais de propósito.

E `SMTP` sem `BASE_URL` também não passa — seria um e-mail que chega e não leva
a lugar nenhum.

### Desligado e quebrado se parecem, então o boot avisa

`recursosDesligados` existe por causa de uma lição da Story 1.9, que criou
`aviso` no `Logger` com esta justificativa: "silêncio não é opção — uma recusa
invisível faz um intake quebrado parecer um intake sem demanda".

O mesmo vale no boot. Sem SMTP, o log diz **o que** ficou desligado e **o que
isso significa** ("abertura e resolução não serão notificadas"), não só que está
nulo. E há teste: verificar que o canal é `undefined` passaria com o e-mail
sumindo em silêncio; a sonda confere que o aviso existe.

### O agendador não pode derrubar o servidor

`criarVarredura` (1.9) já garantia que uma mensagem ruim não derruba o lote.
Faltava a camada de cima: uma **varredura inteira** que falhe — IMAP fora do ar,
credencial expirada — não pode matar o processo que serve as tools.

A sonda que importa: a **segunda** varredura acontece **depois** de a primeira
lançar. Um teste que só verificasse "não lançou" passaria com o laço morto.

Há também guarda contra varredura concorrente. O `UNIQUE` de `email_intake`
impediria o Chamado duplicado, mas provocar a corrida de propósito é
desperdício, e encheria o log de "duplicado" que não diz nada sobre o mundo.

### Duas coisas que a fiação revelou no código existente

**1. `resolverPrincipal` exigia um `notificador` que não usa.** O tipo
`AutenticacaoDeps` era compartilhado com o envio de link de login. A raiz de
composição teria de inventar um notificador falso só para satisfazer o tipo — e
peça falsa é exatamente o que alguém um dia usa de verdade por engano. Passou a
receber `Pick<AutenticacaoDeps, 'repositorio' | 'agora'>`, o mesmo padrão que os
commands já usam ("declarar isso deixa óbvio o que ele **não** faz").

**2. `McpDeps` não tinha por onde receber o canal de notificação.** Era a razão
mecânica de os e-mails do FR-18 estarem desligados: `criarHandlerAbrirChamado`
montava o command sem ele. Campo opcional novo, e os handlers repassam quando
existe.

**Nenhuma mudança em `application` ou `domain`.** As duas acima são `platform` e
`adapters` — e a segunda é literalmente a fiação que faltava.

### Sem dependência nova

`tsx` seria mais direto em desenvolvimento, mas dependência nova exige aprovação
neste projeto. `tsconfig.build.json` + `tsc` (que já estava aqui) resolvem, e
compilar antes de rodar tem vantagem própria em produção: **erro de tipo aparece
no build, não na primeira chamada de tool.**

### File List

**Novos**
- `src/bootstrap/config.ts` e `config.test.ts`
- `src/bootstrap/montar.ts` e `montar.test.ts`
- `src/bootstrap/agendador.ts` e `agendador.test.ts`
- `src/bootstrap/servidor-mcp.ts`
- `tsconfig.build.json`
- `README.md`

**Alterados**
- `package.json` (`start`, `build`)
- `src/adapters/mcp/server.ts` (`McpDeps.notificacao`, repassado aos handlers)
- `src/platform/auth/autenticacao.ts` (`ResolucaoDeps`)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-20 | Story criada. Decidido por recomendação: credencial do MCP por variável de ambiente resolvida a CADA chamada (nunca guardada em memória, senão vira a sessão eterna que o tipo proíbe); config validada por Zod na borda com falha alta; opcional ausente **desliga e avisa**, porque desligado e quebrado se parecem; agendador com `setInterval` + `catch` e guarda contra varredura concorrente |
