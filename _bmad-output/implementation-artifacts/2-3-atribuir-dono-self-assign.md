---
baseline_commit: e2cf0b2
---

# Story 2.3: Atribuir Dono / self-assign

Status: review

## Story

As a Agente,
I want atribuir um Chamado a mim ou a outro Agente via `atribuir_chamado`,
so that todo Chamado tenha um Dono claro.

## Acceptance Criteria

1. **Given** um Chamado sem Dono
   **When** a IA chama `atribuir_chamado(numero, versao, agente?)`
   **Then** o Dono é definido — e **omitir `agente` é self-assign**
   **And** a reatribuição registra **Dono anterior e novo** no Log, nas colunas
   `de`/`para` da Story 2.2 (FR-5, AD-3).

2. **Given** um destinatário que **não é Agente** — Solicitante, ou e-mail que
   não está no cadastro
   **When** a atribuição é pedida
   **Then** é recusada: um Chamado atribuído a quem não atende não tem Dono,
   tem um nome.

3. **Given** um Chamado que já tem Dono
   **When** ele é atribuído ao **mesmo** Agente
   **Then** é recusado — não é mudança, e encheria o Log de evento que não
   aconteceu (mesmo raciocínio da auto-transição da 2.2).

4. **Given** dois Agentes atribuindo o mesmo Chamado
   **When** o segundo usa versão desatualizada
   **Then** recebe `Conflict` e **nada** muda (AD-10).

5. **Given** um Chamado com Dono
   **When** qualquer um o lê
   **Then** o Dono **aparece** — hoje a leitura devolve `null` sempre, porque o
   adapter o hardcoda (dívida herdada da 1.1, ver Dev Notes).

## Tasks / Subtasks

- [x] **Task 1 — Pagar a dívida do `assignee`** (AC: #5)
  - [x] O adapter lê `linha.assignee` nos **três** lugares onde hoje escreve
        `assignee: null`
  - [x] Teste que prova a leitura do banco, não do literal
- [x] **Task 2 — Domínio** (AC: #2, #3)
  - [x] Capacidade `atribuiChamado` na matriz — só Agente
  - [x] Ação `atribuir_chamado` em `ACOES`
  - [x] `AtribuicaoInvalida` (ou reuso — ver Dev Notes) em `DomainErrorCode`
- [x] **Task 3 — Contrato** (AC: #1, #4)
  - [x] `contracts/atribuir-chamado.ts`: `numero`, `versao` obrigatória,
        `agente` **opcional** (ausente = self-assign)
- [x] **Task 4 — Port e adapter** (AC: #1, #4)
  - [x] `atribuirComAuditoria` com o **mesmo** `UPDATE` condicional da 2.2:
        `WHERE number = $n AND version = $esperada AND deleted_at IS NULL`
  - [x] `de`/`para` no Log: Dono anterior (pode ser nulo) e novo
- [x] **Task 5 — Command** (AC: #1..#4)
  - [x] `buscarPorNumero` → `visivelPara` → `pode` → valida destinatário →
        repositório
  - [x] Destinatário verificado no **cadastro** (`IdentityRepository`)
- [x] **Task 6 — Tool MCP** (AC: #1)
  - [x] `atribuir_chamado`, com `autenticar()` **e** `limitarChamadas()`
- [x] **Task 7 — Testes** (AC: #1..#5)
  - [x] Recusa antes do caminho feliz; self-assign; reatribuição
  - [x] Conflito real contra o Postgres
  - [x] `de`/`para` no histórico, com `de` nulo na primeira atribuição
  - [x] **Verificar por mutação** — `scratchpad/mutacoes-23.py`
- [x] **Task 8 — Registrar** (AC: —)
  - [x] PRD (FR-5) com as decisões

## Dev Notes

### A dívida que esta story tropeça: `assignee` nunca foi lido

A coluna `assignee` existe em `tickets` desde a Story 1.1. **Mas o adapter
devolve `assignee: null` fixo** — verificado em 2026-08-11, nos três pontos de
leitura (`criarComAuditoria`, `buscarPorNumero`, `buscarHistoricoBruto`).

Ninguém notou porque, até agora, nenhum Chamado tinha Dono: a 1.1 sempre criava
com `null` e nada atribuía. A partir desta story isso vira **bug visível** — o
Chamado teria Dono no banco e apareceria sem Dono na leitura.

**Pague a dívida na Task 1, antes de escrever a atribuição**, e prove com um
teste que lê do banco. Um teste que só verifica o retorno do command passaria
mesmo com o literal no lugar.

### O destinatário precisa existir e precisa ser Agente

A AC #2 é a que dá caráter à story. Atribuir um Chamado a um Solicitante, ou a
um e-mail que ninguém usa, produz um Chamado que **parece** ter Dono e não tem:
a fila mostraria o Chamado como atendido, e ninguém estaria atendendo.

O cadastro é a fonte — `IdentityRepository.buscarUsuarioPorEmail` (1.3). Duas
checagens, e as duas importam:

| Situação | Resultado |
| --- | --- |
| E-mail não está em `users` | recusa |
| Está, mas o papel é `solicitante` | recusa |

**Normalize o e-mail** com `normalizarEmail` do domínio (1.9) antes de buscar —
senão `Bruno@Empresa.com` e `bruno@empresa.com` viram duas pessoas.

**Decisão a tomar sobre o erro:** reusar `SemPermissao` seria errado (o
problema não é de quem chama, é do destinatário) e `TicketNaoEncontrado` seria
pior ainda. Prefira um código próprio — e **não** revele qual das duas causas
foi: "fulano não está cadastrado" e "fulano não é Agente" são a mesma resposta
para quem chama, e distinguir as duas transformaria a tool num verificador de
quem trabalha na empresa (o raciocínio da resposta cega da 1.3).

### Self-assign é a ausência do campo, não um valor especial

`agente` omitido significa "para mim". Não invente `agente: 'eu'` nem um booleano
`selfAssign` — o campo ausente já diz isso, e um valor mágico seria mais uma
string para validar.

Cuidado: **self-assign também passa pela verificação de papel**. Um Solicitante
não chega lá (a capacidade `atribuiChamado` o barra antes), mas a ordem das
checagens deve deixar isso explícito no teste.

### Reatribuir para o mesmo Dono é recusado

Mesmo raciocínio da auto-transição na 2.2: não é mudança, e gravaria no Log um
evento que não aconteceu. A comparação é sobre o **e-mail normalizado**.

### O AD-10 e o par `de`/`para` já existem — use, não reinvente

A 2.2 construiu os dois. Copie `mudarStatusComAuditoria`:

- `UPDATE ... WHERE number = $n AND version = $esperada AND deleted_at IS NULL`
- a versão esperada vem da **entrada**, nunca do Chamado lido
- zero linhas afetadas → **releia** para separar `Conflict` de
  `TicketNaoEncontrado`
- teste o `deleted_at IS NULL` chamando o **repositório direto** (pelo command
  não prova nada: `visivelPara` barra antes)

No Log, `de` é o Dono anterior e **pode ser nulo** — a primeira atribuição sai
de "sem Dono". Isso é exatamente o caso que a 2.2 previu ao deixar as colunas
nulas; **não** escreva `'nenhum'`.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Onde |
| --- | --- |
| Desatribuir (voltar a "sem Dono") | não está no FR-5; se aparecer, é story própria |
| Atribuir a Time em vez de pessoa | `team` é do PRD, não do MVP |
| Notificar o Agente atribuído | FR-18 cobre abertura e resolução |
| Mudar Status junto com a atribuição | 2.2 já tem `mudar_status` |

### Armadilhas conhecidas

- **Mutação sobrevivente pode ser redundância** (2.2) ou inócua (1.9, 2.1):
  verifique se ela muda comportamento observável antes de mexer no teste.
- **Cobertura por arquivo**, não o total.
- **Escrita que não aconteceu não vira auditoria** (1.7).
- **Verde curto do `claude-review` não é revisão** — menos de 1 min é silêncio
  (medido nos PRs #46 e #48).

### References

- [Source: epics.md#Story 2.3]
- [Source: prd.md#FR-5] — atribuição e Dono
- [Source: ARCHITECTURE-SPINE.md#AD-10] — concorrência otimista (2.2)
- [Source: 2-2-mudar-status-maquina-de-estados.md] — o padrão a copiar
- [Source: 1-3-autenticacao-e-identidade.md] — cadastro e resposta cega

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**A dívida do `assignee` era maior do que parecia.** O adapter devolvia
`assignee: null` fixo nas três leituras — mas o **tipo no domínio** também era
`readonly assignee: null`, literalmente. Enquanto a 1.1 só criava Chamado sem
Dono, o tipo estreito estava certo; ele virou mentira no instante em que a
atribuição existiu. O compilador cobrou nos dois lugares.

O teste que protege isso escreve **direto no banco** e lê pelo command. Um
teste que só olhasse o retorno do command passaria com o literal no lugar — e a
mutação que restaura o `null` reprova 8 testes.

**Separei `recebeAtribuicao` de `atribuiChamado`, e a diferença não é
acadêmica.** Escrevi primeiro reusando `atribuiChamado` para validar o
destinatário, e isso está errado: "pode distribuir trabalho" e "pode receber
trabalho" hoje coincidem só porque existe um único papel de atendimento. Um
Gestor que distribui sem atender — ou um papel de auditoria que nunca recebe —
quebraria a coincidência, e o sintoma seria Chamado atribuído a quem não
atende. A matriz obriga a declarar, então declarar as duas custou uma linha.

**A ordem das checagens protege o cadastro.** Autorização de quem chama vem
**antes** de olhar o destinatário: se fosse ao contrário, um Solicitante
descobriria pela mensagem de erro quem está cadastrado, e a tool viraria um
verificador de quadro de funcionários para qualquer usuário. A mutação que
inverte reprova 2 testes.

**Uma mutação sobreviveu, e era inócua — pela quarta vez no projeto.** Trocar
`para: usuario.email` por `para: destinatario` não mudava nada: a busca é exata
(`eq(users.email, email)`) e `users` guarda normalizado, então os dois valores
são **provadamente idênticos** hoje.

A escolha, porém, tem intenção — o valor gravado deve vir do **cadastro**, não
da entrada. Tornei isso observável com um teste que simula um cadastro
devolvendo grafia canônica diferente da chave buscada, que é o que aconteceria
com índice case-insensitive (`citext`) ou dado legado. A mutação passou a
reprovar.

**Dezessete mutações aplicadas, dezessete reprovações** (script versionado em
`scratchpad/mutacoes-23.py`):

| Mutação aplicada | Reprovou |
| --- | --- |
| **Voltar a hardcodar `assignee: null`** | 8 testes |
| Não verificar o destinatário no cadastro | 8 testes |
| Aceitar Solicitante como Dono | 5 testes |
| Gravar o e-mail da entrada, e não o do cadastro | 1 teste |
| Não normalizar o destinatário | 1 teste |
| Permitir reatribuir ao mesmo Dono | 4 testes |
| Comparar o Dono atual sem normalizar | 1 teste |
| Self-assign vira atribuição ao Solicitante | 3 testes |
| Solicitante ganha permissão de atribuir | 2 testes |
| Validar o destinatário antes de autorizar | 2 testes |
| Pular o gargalo de visibilidade | 1 teste |
| Ignorar a versão esperada no `UPDATE` | 2 testes |
| Não filtrar excluído no `UPDATE` | 1 teste |
| Usar a versão do Chamado lido | 3 testes |
| Conflito vira sucesso silencioso | 3 testes |
| Não registrar o Dono anterior no Log | 1 teste |
| Esquecer o `limitarChamadas` | 1 teste |

### Completion Notes List

- **Task 1** — dívida paga: `assignee` lido nas três leituras, e o tipo do
  domínio corrigido para `string | null`.
- **Task 2** — `atribuiChamado` e `recebeAtribuicao` (separadas);
  `atribuir_chamado` em `ACOES`; `AtribuicaoInvalida`.
- **Task 3** — `agente` opcional (ausente = self-assign), `versao` obrigatória.
- **Task 4** — mesmo `UPDATE` condicional da 2.2, com `de`/`para` no Log.
- **Task 5** — command com `Pick` do port (padrão da 1.9).
- **Task 6** — tool `atribuir_chamado`; `McpDeps` ganhou `identidades`.
- **Task 7** — **518 testes** (eram 472); cobertura **98,71%**.
- **Task 8** — FR-5 registrado no PRD.

**Não provado — registrado em vez de deixado implícito:**

1. **Não há como desatribuir** (voltar a "sem Dono"). O FR-5 não pede, e
   inventar semântica de remoção sem caso de uso seria especular. Se aparecer,
   é story própria — e `assignee` já aceita nulo no banco.
2. **Ninguém é notificado ao receber um Chamado.** FR-18 cobre abertura e
   resolução; um Agente descobre que virou Dono consultando.
3. **Nada impede atribuir Chamado `resolvido` ou `fechado`.** A máquina de
   estados (2.2) governa Status, não atribuição, e as ACs não pedem o
   cruzamento. Se a 2.5 ou a 2.6 quiserem barrar, o lugar é o command.
4. **Duas guardas defensivas seguem sem teste** em `ticket-repository.ts`
   (linhas 69 e 96, herdadas), e a conexão IMAP real (1.9).
5. **O `claude-review` ainda não se manifestou** nesta story no momento em que
   este registro foi escrito.

### File List

- `src/domain/ticket.ts` (modificado — `assignee: string | null`)
- `src/domain/papeis.ts` (modificado — `atribuiChamado`, `recebeAtribuicao`)
- `src/domain/auditoria.ts` (modificado — `atribuir_chamado`)
- `src/domain/errors.ts` (modificado — `AtribuicaoInvalida`)
- `src/application/contracts/atribuir-chamado.ts` (novo)
- `src/application/ports/ticket-repository.ts` (modificado)
- `src/application/commands/atribuir-chamado.ts` + teste (novos)
- `src/adapters/persistence/ticket-repository.ts` (modificado — dívida paga)
- `src/adapters/persistence/atribuicao.test.ts` (novo — integração)
- `src/adapters/mcp/server.ts` + teste (modificados — tool e `identidades`)
- Dubles de teste (modificados)
- `scratchpad/mutacoes-23.py` (novo)
- `prd.md` (FR-5)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-11 | Story criada; dívida do `assignee` hardcoded (herdada da 1.1) identificada e incluída no escopo |
| 2026-08-11 | Tasks 1–6: dívida do `assignee` paga, capacidades separadas, command e tool |
| 2026-08-11 | Task 7: 518 testes, cobertura 98,71% |
| 2026-08-11 | Uma mutação sobreviveu por ser inócua; tornada detectável. 17 de 17 reprovaram |
| 2026-08-11 | Task 8: FR-5 registrado no PRD |
