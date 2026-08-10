---
baseline_commit: db9f3a7
---

# Story 1.4: Papéis e autorização

Status: done

## Story

As a Solicitante,
I want ver apenas os meus Chamados e apenas Comentários Públicos,
so that a privacidade de terceiros seja preservada.

## Acceptance Criteria

1. **Given** dois papéis (Agente, Solicitante) e a autorização no domínio (AD-8)
   **When** um Solicitante chama `ver_chamado` de um Chamado que não é seu
   **Then** recebe erro (FR-2, FR-20) — o **mesmo** `TicketNaoEncontrado` de um
   Número inexistente, pela decisão da Story 1.2.

2. **Given** um Agente autenticado
   **When** ele consulta qualquer Chamado
   **Then** vê todos os Chamados e todos os Comentários (públicos e internos).

3. **Given** um usuário que autenticou de verdade (sessão do banco, papel vindo
   de `users`)
   **When** consulta o mesmo Chamado
   **Then** o resultado muda conforme o papel **do cadastro** — provado ponta a
   ponta, sem principal de configuração em lugar nenhum do caminho.

4. **Given** um caso de uso novo que leia Chamado
   **When** ele esquecer de aplicar a visibilidade
   **Then** **não compila**: o dado que sai do port não é utilizável antes de
   passar pela autorização do domínio.

5. **Given** o papel do principal
   **When** ele decide o que aparece
   **Then** a decisão vem de **uma** tabela de capacidades por papel, não de
   comparações `role === 'agente'` espalhadas.

## Tasks / Subtasks

- [x] **Task 1 — Matriz de capacidades por papel** (AC: #2, #5)
  - [x] `src/domain/papeis.ts`: capacidades declaradas por papel
        (`veChamadoDeTerceiro`, `veComentarioInterno`)
  - [x] `switch` exaustivo com `never` no default — papel novo passa a ser erro
        de compilação em vez de cair silencioso no ramo "não é agente"
  - [x] `podeVerTicket` e `filtrarComentarios` passam a derivar da matriz

- [x] **Task 2 — Autorização estrutural, não disciplinar** (AC: #4)
  - [x] `Bruto<T>` em `src/domain/visibilidade.ts`, com símbolo **não exportado**
  - [x] `embrulharBruto` (usada pelo adapter) e `visivelPara` (única saída)
  - [x] Fora do módulo não existe caminho para ler o conteúdo sem passar por
        `visivelPara` — a garantia é do compilador, como o `NovoTicket` sem
        `number` fez pelo AD-4 na Story 1.1

- [x] **Task 3 — Port e adapter** (AC: #4)
  - [x] `buscarPorNumero` passa a devolver `Bruto<...> | null`
  - [x] O adapter embrulha o que leu; segue **sem** conhecer papel ou posse
  - [x] Nenhuma query filtra por papel no SQL (AD-8)

- [x] **Task 4 — Query handler** (AC: #1, #2)
  - [x] `ver-chamado.ts` usa `visivelPara`
  - [x] Chamado inexistente e Chamado alheio continuam devolvendo o mesmo erro

- [x] **Task 5 — Testes** (AC: #1..#5)
  - [x] **Papel errado antes do papel certo**
  - [x] Matriz papel × capacidade, exaustiva sobre `PAPEIS`
  - [x] **Integração ponta a ponta com identidade real**: dois usuários em
        `users`, sessões trocadas de verdade, `resolverPrincipal` alimentando
        `ver_chamado` — a mesma consulta muda de resultado conforme o cadastro
  - [x] Alheio e inexistente comparados **entre si**
  - [x] **Verificar por mutação** — tabela obrigatória no Dev Agent Record

- [x] **Task 6 — Registrar a divergência com o epics** (AC: #1)
  - [x] O epics pede "erro de autorização"; a 1.2 decidiu erro único. Escrever a
        decisão e o motivo no Dev Agent Record

## Dev Notes

### ⚠️ Leia isto antes de começar: metade desta story já existe

As ACs #1 e #2 vieram prontas das stories anteriores:

| O que a AC pede | Onde já está | Desde |
| --- | --- | --- |
| Solicitante não vê Chamado alheio | `podeVerTicket` em `domain/visibilidade.ts` | 1.2 |
| Solicitante não vê Comentário Interno | `filtrarComentarios`, mesmo arquivo | 1.2 |
| Agente vê tudo | as duas funções acima | 1.2 |
| O papel é real, vindo de `users` | `resolverPrincipal` em `platform/auth` | 1.3 |
| `requester` é a identidade autenticada, nunca a entrada | `abrir-chamado.ts` | 1.1 |

**Não reimplemente nada disso.** O que esta story acrescenta é o que ninguém
fez ainda:

1. **A ponta a ponta nunca foi provada.** Os testes da 1.2 usavam principal de
   duble. Depois da 1.3 existe autenticação real, e **nenhum teste liga as
   duas**: ninguém provou que o papel gravado em `users` chega ao domínio e
   muda o que a pessoa vê. É a AC #3.
2. **A autorização é disciplinar.** `ver-chamado.ts` chama `podeVerTicket`
   porque quem escreveu lembrou. O Epic 3 traz fila, busca, resumo e
   "parecidos" — quatro leituras novas, quatro oportunidades de esquecer. É a
   AC #4.
3. **A regra está espalhada em comparações soltas.** `role === 'agente'`
   aparece duas vezes hoje; a cada caso de uso vira mais uma. É a AC #5.

### O ponto sutil: tornar impossível o que hoje é lembrado

O projeto já fez isso duas vezes, e é o padrão a copiar:

- **Story 1.1** — `NovoTicket` não tem `number`. Gerar Número em código não
  compila (AD-4).
- **Story 1.2** — o handler de leitura não recebe nada que escreva. O FR-13 é
  garantia estrutural, não disciplina.

Agora a vez do AD-8. O port devolve `Bruto<{ticket, comentarios}>`, cujo
conteúdo só é alcançável por `visivelPara(quem, bruto)`. O símbolo que
embrulha **não é exportado**, então fora de `visibilidade.ts` não há como
desembrulhar — nem por descuido, nem por pressa.

Isso muda a assinatura do port, que é da Story 1.2 e está `done`. É evolução
esperada: a 1.2 entregou a regra, a 1.4 entrega a garantia.

### Erro de autorização: o epics pede uma coisa, a 1.2 decidiu outra

O epics escreve "recebe erro de autorização (FR-2, FR-20)". Seguir isso ao pé
da letra **quebraria** a AC #3 da Story 1.2: se o Chamado alheio dissesse "não
autorizado" e o inexistente "não encontrado", bastaria sondar Números — que são
sequenciais (AD-4) — para mapear a base.

Mantém-se o erro único `TicketNaoEncontrado`. A AC #1 acima já está redigida
assim, e a Task 6 manda registrar a decisão no Dev Agent Record em vez de
deixá-la implícita numa discrepância entre documentos.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
| --- | --- |
| Papéis além de `solicitante`/`agente` | fora do MVP (FR-20) |
| Autorização de **escrita** (mudar status, atribuir) | Epic 2 |
| Token escopado do cliente MCP e rate limit | 1.5 |
| Filtros de fila, busca e resumo | Epic 3 |
| Cadastro/edição de usuário e papel | fora do MVP — `users` é semeado |

### Armadilhas conhecidas

- **`noUncheckedIndexedAccess`**: acesso a índice pode ser `undefined`.
- **Cobertura por arquivo**, não a média: a 1.2 escondeu um arquivo em 72% atrás
  de 87,5% global, e a 1.3 quase repetiu com um contrato Zod em 0%.
- **Teste de visibilidade que insere só um Chamado não prova nada** — precisa de
  dois donos diferentes, senão "vê o próprio" e "vê qualquer um" dão o mesmo
  resultado.
- **`await promessa.catch((e) => e as Error)` não devolve `Error`** — usar o
  helper `erroDe` que estreita com `ehDomainError` e falha quando não há erro.
- **Verde do `claude-review` não é evidência de review** — no PR #31 ele
  executou duas vezes sem comentar nada. Conferir
  `gh api repos/alexandrehst/servicedesk/pulls/NN/comments --jq 'length'`.

### Ambiente

```bash
source ~/.nvm/nvm.sh && nvm use 24
export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
docker-compose up -d && pnpm db:migrate
```

### References

- [Source: epics.md#Story 1.4]
- [Source: prd.md#FR-2] — Solicitante vê só os próprios e só Comentários Públicos
- [Source: prd.md#FR-20] — dois papéis, sem matriz de permissões além disso
- [Source: ARCHITECTURE-SPINE.md#AD-8] — autorização aplicada no domínio
- [Source: 1-2-ver-um-chamado-via-mcp.md] — erro único e regra de visibilidade
- [Source: 1-3-autenticacao-e-identidade.md] — papel real vindo de `users`

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**O escopo do epics já estava implementado, e dizer isso foi o primeiro
trabalho da story.** As duas ACs originais — Solicitante não vê Chamado alheio,
Agente vê tudo — passavam desde a Story 1.2, e o papel real chegou na 1.3.
Marcar a story `done` só com isso seria verdade formal e mentira prática: o que
faltava não era a regra, era a **prova da costura** entre autenticação e
autorização, e a garantia de que a regra não pode ser esquecida. Daí as ACs #3,
#4 e #5, que não estavam no epics.

**O compilador encontrou os dubles no mesmo instante em que a AC #4 ficou
pronta.** Ao trocar o retorno do port para `ChamadoBruto`, o `tsc` reprovou
três lugares que devolviam o objeto cru — dois dubles de teste e o handler.
Não foi retrabalho: foi a AC #4 se provando sozinha, na primeira compilação
depois de existir. Um caso de uso futuro que esqueça a autorização recebe
exatamente o mesmo erro.

**A garantia estrutural precisava de uma prova que o gate verificasse.** Um
teste comum não consegue afirmar "isto não compila". A prova ficou num
`@ts-expect-error` sobre o acesso ao conteúdo bruto: se algum dia o embrulho
virar alcançável de fora do domínio, o erro esperado deixa de acontecer e o
`tsc` reprova com *"unused '@ts-expect-error' directive"*. O job `typecheck`
passa a ser o guardião da AC #4 — a mutação de tipo abaixo confirma isso.

**`filtrarComentarios` ficou aplicado duas vezes por um instante.** O handler
continuava filtrando depois de `visivelPara` já ter filtrado. Sem efeito
visível (a operação é idempotente), e por isso mesmo perigoso: é a mesma regra
em dois lugares, e dois lugares divergem. Removido do handler, que agora só
converte datas e monta a saída.

**Três definições de papel viraram uma.** `PAPEIS` no domínio, `z.enum` no
contrato e a coluna `papel` no banco eram listas independentes — nada reprovaria
se divergissem. O contrato passou a derivar de `PAPEIS`. O banco continua
solto por natureza, e é justamente por isso que o adapter usa
`papelSchema.parse` (Story 1.3) em vez de cast.

**O paralelismo do Vitest passou a ser um problema real.** A Story 1.2 anotou
que dois arquivos truncando as mesmas tabelas se atrapalham, e contornou
juntando tudo num arquivo. Isso deixou de escalar aqui: o teste ponta a ponta
precisa de `users`/`sessions` (do arquivo de identidade) **e** de
`tickets`/`comments` (do arquivo de Chamados). Em vez de fundir os três
assuntos num arquivo só, ficou `fileParallelism: false` no `vitest.config.ts`.
A suíte inteira leva ~2,7 s; o custo é irrelevante e elimina uma classe de
falha intermitente.

**`papeis.ts` apareceu com 71,42%** na primeira medição — o ramo `default` com
`never`, inalcançável por tipo. Coberto com um teste que força um papel
inválido por cast, que é como ele apareceria de verdade: uma linha corrompida
em `users`. O teste trava o comportamento que importa — **lançar**, não
devolver `false` silencioso, porque `false` faria a pessoa simplesmente não ver
o que deveria, sem ninguém entender por quê.

**Seis mutações aplicadas, seis reprovações** (script em
`scratchpad/mutacoes-14.py`):

| Mutação aplicada | Reprovou |
| --- | --- |
| Solicitante passa a ver Chamado de terceiro | 18 testes, incluindo os ponta a ponta |
| Agente perde `veComentarioInterno` | 7 testes |
| `podeVerTicket` ignora a posse | 9 testes |
| `visivelPara` devolve sem checar quem pergunta | 8 testes |
| `visivelPara` devolve a thread sem filtrar | 4 testes |
| **O `@ts-expect-error` fica sem erro para suprimir** | **`typecheck`**: `TS2578: Unused '@ts-expect-error' directive` |

A última é de tipo, não de teste: simula o vazamento virar compilável e
confirma que o gate `typecheck` — não um teste — reprova.

### Completion Notes List

- **Task 1** — `domain/papeis.ts` com `PAPEIS`, `Capacidade` e `pode()`. O
  `switch` é exaustivo com `never`: papel novo sem política vira erro de
  compilação, e papel corrompido em runtime lança.
- **Task 2** — `Bruto<T>` guardado atrás de um símbolo **não exportado**.
  Efeito colateral útil: o embrulho serializa como `{}`, então um
  `console.log` distraído não derrama a thread interna.
- **Task 3** — o port devolve `ChamadoBruto | null`; o adapter embrulha e segue
  sem conhecer papel ou posse. Nenhuma query filtra por papel no SQL.
- **Task 4** — o handler chama `visivelPara`, que devolve `null` tanto para
  alheio quanto para ausente. O erro único da 1.2 agora sai **por construção**,
  não porque o handler lembra de unificar os dois casos.
- **Task 5** — **134 testes** (eram 125). Sete deles são o fluxo real:
  magic link trocado, sessão resolvida, Chamado aberto com a identidade
  autenticada, consulta mudando de resultado conforme o papel do cadastro.
- **Task 6** — divergência com o epics registrada abaixo.

**Sobre a AC #1 e o texto do epics.** O epics pede "erro de autorização". Isso
**quebraria** a AC #3 da Story 1.2: um erro distinto para Chamado alheio
transformaria a tool num oráculo de existência sobre Números sequenciais
(AD-4). Mantido o `TicketNaoEncontrado` único, e o teste ponta a ponta compara
as duas mensagens **entre si**, com o Número normalizado. O Número não é
vazamento — quem perguntou já o conhecia; qualquer outra diferença seria.

**A prova mais forte desta story** é a que mostra o papel vindo do cadastro:
o mesmo token de sessão, o mesmo Chamado, e só uma linha de `users` mudando de
`solicitante` para `agente` — a consulta passa de erro a resultado completo. Se
o papel estivesse congelado na sessão (como estaria se a 1.3 tivesse guardado
`papel` em `sessions`), esse teste falharia.

**Não provado — registrado em vez de deixado implícito:**

1. **`ticket-repository.ts:37` segue descoberta** — o `throw` de INSERT sem
   retorno, herdado da Story 1.1. É a única linha sem teste do projeto
   (cobertura global 99,4%). Fora do escopo desta story.
2. **A autorização de escrita não existe.** Qualquer principal autenticado abre
   Chamado, o que está certo (Solicitante abre os seus). Mudar status, atribuir
   dono e comentar são do Epic 2, e a matriz de capacidades vai precisar
   crescer lá — o `switch` exaustivo garante que ninguém adicione papel sem
   decidir, mas não obriga ninguém a adicionar **capacidade**.
3. **`no-cross-adapter` continua não exercitado** por violação plantada, como o
   Epic 0 registrou.
4. **O `claude-review` segue sem contribuir.** No PR #33 ele passou verde em
   57 s com **zero** comentários (`/pulls/33/comments` vazio). É o terceiro PR
   consecutivo assim — #31 (duas execuções), #32 e #33. O que já era "nunca
   reprovou nada" (Story 0.6) virou "nem fala mais". Nas duas stories de
   fronteira de segurança do Epic 1, a 1.3 e esta, ele não apontou uma linha.
   Todo achado desta story saiu do compilador, das mutações ou de releitura
   própria.

### File List

- `src/domain/papeis.ts` + teste (novos)
- `src/domain/visibilidade.ts` + teste (modificados — `Bruto`, `visivelPara`, matriz)
- `src/application/ports/ticket-repository.ts` (modificado — `buscarPorNumero` devolve `ChamadoBruto`)
- `src/application/queries/ver-chamado.ts` + teste (modificados)
- `src/application/contracts/principal.ts` (modificado — `papelSchema` deriva de `PAPEIS`)
- `src/adapters/persistence/ticket-repository.ts` (modificado — embrulha o que leu)
- `src/adapters/persistence/visibilidade-com-identidade.test.ts` (novo — ponta a ponta)
- `src/adapters/mcp/server.test.ts` (modificado — duble embrulhado)
- `vitest.config.ts` (modificado — `fileParallelism: false`)
- `_bmad-output/implementation-artifacts/{1-4-...,sprint-status.yaml}` (modificados)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-10 | Story criada; escopo ajustado ao que as 1.1–1.3 já entregaram |
| 2026-08-10 | Task 1: matriz de capacidades por papel, com `switch` exaustivo |
| 2026-08-10 | Tasks 2–4: `Bruto`/`visivelPara`, port, adapter e handler |
| 2026-08-10 | `fileParallelism: false` — o ponta a ponta precisa de tabelas dos dois arquivos de integração |
| 2026-08-10 | Task 5: 134 testes; cobertura 99,4%, `papeis.ts` de 71% para 100% |
| 2026-08-10 | Seis mutações aplicadas e reprovadas, uma delas verificada pelo `typecheck` |
| 2026-08-10 | PR #33: nove checks verdes; `claude-review` mudo pelo terceiro PR seguido |
| 2026-08-10 | PR #33 mergeado. Story `done` |
