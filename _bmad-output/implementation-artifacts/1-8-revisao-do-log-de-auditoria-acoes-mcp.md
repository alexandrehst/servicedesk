---
baseline_commit: ade5a67
---

# Story 1.8: Revisão do Log de auditoria / ações MCP

Status: review

## Story

As a Agente/Gestor,
I want ver o histórico de ações de um Chamado, distinguindo origem e identidade,
so that eu enxergue o que a IA fez e detecte erro antes que vire incêndio.

## Acceptance Criteria

1. **Given** um Chamado com mudanças registradas no Log (AD-3, AD-9)
   **When** um Agente consulta o histórico
   **Then** vê cada ação com **autor, timestamp e `origin`** (`api|mcp`), em
   ordem cronológica, com datas em ISO 8601 UTC.

2. **Given** o histórico
   **When** o Agente filtra por `origin=mcp`
   **Then** vê apenas o que passou pela IA — é o recorte que torna ação
   destrutiva invisível revisável.

3. **Given** um Solicitante
   **When** ele pede o histórico de qualquer Chamado, **inclusive o próprio**
   **Then** é recusado: o Log expõe identidade de Agentes e o ritmo interno do
   time, que não é dele.

4. **Given** um Chamado que o consultante não pode ver — alheio, excluído ou
   inexistente
   **When** o histórico é pedido
   **Then** recebe `TicketNaoEncontrado`, o mesmo das Stories 1.2/1.4/1.7: a
   autorização passa pelo **mesmo gargalo** das outras leituras, não por uma
   checagem nova.

5. **Given** que o Log é append-only (FR-22)
   **When** o histórico é lido
   **Then** a leitura não altera estado nem grava auditoria de si mesma.

## Tasks / Subtasks

- [x] **Task 1 — Domínio: entrada de auditoria e quem a vê** (AC: #1, #3, #4)
  - [x] `EntradaDeAuditoria` em `domain/auditoria.ts` (acao, autor, origin,
        registradoEm)
  - [x] Capacidade `veHistorico` na matriz de `papeis.ts` — só Agente
  - [x] `historicoVisivelPara(quem, bruto)` reusando `podeVerTicket`, que já
        descarta alheio (1.4) e excluído (1.7)

- [x] **Task 2 — Contrato Zod** (AC: #1, #2)
  - [x] `contracts/ver-historico.ts`: input (`numero`, `origem?`), output com
        datas ISO
  - [x] `origem` reusa `origemSchema` de `principal.ts` — não redeclarar

- [x] **Task 3 — Port e adapter** (AC: #1, #2, #5)
  - [x] `buscarHistoricoBruto(numero, origem?)` devolvendo `Bruto<...>`
  - [x] `ORDER BY registrado_em, id` explícito — sem ele a ordem é acaso (1.2)
  - [x] Filtro de `origem` no SQL: é **recorte de consulta**, não autorização
  - [x] Nenhuma escrita

- [x] **Task 4 — Query handler** (AC: #1..#5)
  - [x] `queries/ver-historico.ts`, convertendo datas para ISO
  - [x] Sem auditoria da própria leitura

- [x] **Task 5 — Testes** (AC: #1..#5)
  - [x] Papel errado antes do certo: Solicitante dono recusado
  - [x] Alheio, excluído e inexistente comparados **entre si**
  - [x] Integração: abrir + excluir gera duas entradas; o filtro `mcp` recorta
  - [x] `audit_entries` não ganha linha por causa da leitura
  - [x] **Verificar por mutação** — tabela no Dev Agent Record

- [x] **Task 6 — Decidir sobre a dívida do PR #35** (AC: —)
  - [x] Ações que não são de Chamado (login, emissão/revogação de token) não
        estão auditadas. Decidir **conscientemente** e registrar

## Dev Notes

### Esta é a primeira leitura nova depois do gargalo existir

A Story 1.2 escreveu a leitura de Chamado; a 1.4 transformou a autorização em
garantia estrutural; a 1.7 mostrou que o gargalo absorve requisito novo de
graça. Esta story é o teste de que o padrão se sustenta para uma leitura
**diferente**.

Concretamente: o histórico é de um Chamado, então **quem não pode ver o Chamado
não pode ver o histórico dele**. Isso não deve virar uma checagem nova — deve
sair de `podeVerTicket`, que já sabe sobre posse, papel e exclusão. Se você
estiver escrevendo `if (ticket.requester === ...)` aqui, parou no lugar errado.

Em cima disso vem uma segunda camada, essa sim nova: **ver o histórico exige
mais do que ver o Chamado**.

### Por que o Solicitante não vê o histórico nem do próprio Chamado

O Log guarda `autor` — a identidade de quem agiu. Um Solicitante lendo o
histórico do próprio Chamado veria quais Agentes mexeram nele, quando, e com
que frequência. Isso é o ritmo interno do time, não informação dele.

O epics diz "Agente/Gestor", e Gestor não é papel do MVP (FR-20 tem dois).
Decisão registrada: **só Agente**. Se um dia o Solicitante precisar de rastro,
o certo é uma visão própria — "seu Chamado foi atualizado" — e não o Log cru.

### A dívida que o review levantou no PR #35

`audit_entries.ticket_number` é obrigatório, então ações que não são de Chamado
— login, emissão e revogação de token de máquina — **não** têm registro.
Revogar um token é ação sensível e hoje só deixa rastro na própria coluna
`revogado_em`.

Esta story **não** resolve isso, e a decisão é consciente: tornar
`ticket_number` opcional mexe no AD-3 (que fala de "cada mudança de Chamado") e
transformaria o Log de negócio num log de segurança misturado. São duas coisas
com públicos e retenções diferentes. A recomendação registrada é uma tabela
separada quando houver necessidade — não alargar esta.

### Armadilhas conhecidas

- **`ORDER BY` explícito com desempate.** Sem ele o Postgres devolve na ordem
  física e o teste passa por acaso (Story 1.2). Inserir **fora de ordem** no
  teste.
- **Filtro de origem é recorte, não autorização** — pode ir ao SQL. O que não
  pode ir ao SQL é a decisão de quem enxerga (AD-8).
- **A leitura não pode auditar a si mesma**: o Log cresceria a cada consulta e
  a revisão viraria ruído.
- **Cobertura por arquivo.**
- **Verde do `claude-review` não é evidência** — conferir `/pulls/NN/comments`.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
| --- | --- |
| Tool MCP de histórico | FR-13/14 não a preveem; Epic 3 traz resources |
| Auditar login e token de máquina | registrado acima, com recomendação |
| Histórico global (todos os Chamados) | Epic 3 |
| Retenção/expurgo do Log | fora do MVP |

### References

- [Source: epics.md#Story 1.8]
- [Source: prd.md#FR-22] — Log append-only, distingue humano via IA
- [Source: ARCHITECTURE-SPINE.md#AD-9] — identidade e origem propagam à auditoria
- [Source: 1-4-papeis-e-autorizacao.md] — o gargalo de visibilidade
- [Source: 1-7-soft-delete-base.md] — excluído já sai pelo mesmo gargalo

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**O padrão do gargalo se sustentou para uma leitura diferente.** A autorização
do histórico são duas linhas: `podeVerTicket(quem, ticket)` — que já sabe sobre
posse (1.4) e exclusão (1.7) — mais `pode(quem.role, 'veHistorico')`. Nenhuma
comparação de `requester`, nenhum `deleted_at`, nenhuma regra reescrita. O teste
que prova isso melhor é o do **Chamado excluído**: esta leitura nasceu depois da
1.7 e já sabia recusá-lo, sem uma linha a respeito.

**A função ficou em `visibilidade.ts`, não em `auditoria.ts`, e isso foi
imposto pelo desenho — não por gosto.** A chave que abre o `Bruto` é um símbolo
**não exportado** daquele módulo. Um `historicoVisivelPara` em outro arquivo
precisaria de um `abrirBruto` público — e aí qualquer leitura poderia pular a
autorização, que é exatamente o que a Story 1.4 tornou impossível. `auditoria.ts`
ficou só com o tipo. **A garantia decidiu onde o código mora.**

**Duas listas viraram uma.** `Origem` estava declarada em
`application/contracts/principal.ts` como `z.enum(['api', 'mcp'])`, e o domínio
precisava dela para tipar a entrada do Log. Em vez de duplicar, criei
`domain/origem.ts` com `ORIGENS` e fiz o contrato derivar — o mesmo movimento
que a 1.4 fez com `PAPEIS`. Origem é conceito de **negócio** (é ela que separa
"humano via IA" de chamada nativa, AD-9), não de transporte; o lugar dela é o
domínio.

**Filtro de origem no SQL, autorização no domínio.** A distinção é a linha que
o AD-8 traça: `origem` é **recorte de consulta** — o usuário pediu um pedaço —
e pode descer ao banco. Quem enxerga é decisão de negócio e fica no domínio; se
descesse, MCP e HTTP poderiam divergir no que escondem. Há teste provando que
pedir um recorte **não** contorna a autorização.

**O teste de ordem cronológica insere fora de ordem**, com uma entrada de 2020
chegando por último — como aconteceria numa importação ou correção manual. Em
ordem, ele passaria pela ordem física do heap mesmo sem `ORDER BY`, e a mutação
confirmou: removendo o `ORDER BY`, esse é o único teste que reprova.

**A leitura não audita a si mesma**, e há teste contando linhas antes e depois.
Auditar a consulta faria o Log crescer a cada revisão — e quem procurasse o que
a IA fez encontraria, sobretudo, gente procurando o que a IA fez.

**Seis mutações aplicadas, seis reprovações** (script em
`scratchpad/mutacoes-18.py`):

| Mutação aplicada | Reprovou |
| --- | --- |
| Solicitante ganha acesso ao histórico | 3 testes |
| Histórico ignora `veHistorico` | 3 testes |
| Histórico ignora a visibilidade do Chamado | `Chamado excluido nao tem historico visivel` |
| Remover o `ORDER BY` | `a ordem e cronologica` |
| Ignorar o filtro de origem | 2 testes do recorte |
| Datas cruas em vez de ISO | `a saida casa com o contrato` |

A terceira e a quarta são as que valem: elas provam que as **duas** camadas de
autorização estão de fato ativas, e que a ordem não é acaso.

### Completion Notes List

- **Task 1** — `EntradaDeAuditoria` em `domain/auditoria.ts`; a decisão de
  visibilidade em `visibilidade.ts`, pelo motivo acima.
- **Task 2** — contrato com `origem` opcional derivando de `origemSchema`.
- **Task 3** — `ORDER BY registrado_em, id`. O desempate por `id` não é
  paranoia: a exclusão e sua auditoria saem na **mesma transação**, então dois
  registros com o mesmo instante são o caso comum, não a exceção.
- **Task 4** — handler converte para ISO 8601 UTC e não escreve nada.
- **Task 5** — **248 testes** (eram 235). 13 de integração para esta story.
- **Task 6** — a dívida do PR #35 foi decidida, não resolvida: ver abaixo.

**A decisão sobre a dívida do PR #35 (auditoria de login e token).** Ações que
não são de Chamado seguem **fora** do Log, deliberadamente. `ticket_number` é
obrigatório em `audit_entries`, e torná-lo opcional teria dois efeitos ruins:
enfraquece o AD-3 (que fala de "cada mudança de Chamado" e hoje é verificável
pelo tipo) e mistura log de negócio com log de segurança — que têm públicos,
retenções e permissões diferentes. Um Agente pode ver o histórico de um
Chamado; ninguém deveria ver, na mesma consulta, tentativas de login de
terceiros. **Recomendação registrada:** tabela separada quando houver
necessidade real. Registrado no PRD (FR-22).

**Não provado — registrado em vez de deixado implícito:**

1. **Não há tool MCP nem rota para o histórico.** FR-13/FR-14 não a preveem, e
   o Epic 3 traz os MCP Resources — é lá que a superfície aparece. O caso de
   uso existe e está testado; falta quem o chame.
2. **"Gestor" não é papel do MVP.** O epics diz "Agente/Gestor"; FR-20 tem dois
   papéis. O histórico ficou com o Agente. Quando Gestor existir, é uma linha
   na matriz de `papeis.ts`.
3. **Nenhuma paginação.** Um Chamado com milhares de ações devolve tudo. Na
   escala do MVP (~200–400 Chamados/mês) não é problema; o Epic 3, que traz
   listagens, é o lugar de resolver.
4. **Retenção do Log continua ausente** — o Log cresce para sempre, junto com
   as tabelas de credencial que acumulam desde a 1.3.

### File List

- `src/domain/origem.ts` (novo — `ORIGENS`, antes duplicado no contrato)
- `src/domain/auditoria.ts` (novo — `EntradaDeAuditoria`)
- `src/domain/visibilidade.ts` (modificado — `historicoVisivelPara`)
- `src/domain/papeis.ts` + teste (modificados — capacidade `veHistorico`)
- `src/application/contracts/principal.ts` (modificado — `origemSchema` deriva de `ORIGENS`)
- `src/application/contracts/ver-historico.ts` (novo)
- `src/application/ports/ticket-repository.ts` (modificado — `buscarHistoricoBruto`)
- `src/application/queries/ver-historico.ts` (novo)
- `src/adapters/persistence/ticket-repository.ts` (modificado — leitura do Log)
- `src/adapters/persistence/historico.test.ts` (novo — integração)
- Dubles de teste em `adapters/mcp` e `application/{commands,queries}` (modificados)
- `_bmad-output/planning-artifacts/prds/.../prd.md` e `.../ARCHITECTURE-SPINE.md` (modificados)
- `_bmad-output/implementation-artifacts/{1-8-...,sprint-status.yaml}` (modificados)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-10 | Story criada; decisão sobre quem vê o histórico tomada por recomendação delegada |
| 2026-08-10 | Tasks 1–2: `ORIGENS` movido para o domínio; `historicoVisivelPara` no módulo que tem a chave |
| 2026-08-10 | Tasks 3–4: leitura com `ORDER BY` e desempate, filtro de origem no SQL |
| 2026-08-10 | Task 5: 248 testes; cobertura 99,65% |
| 2026-08-10 | Seis mutações aplicadas e reprovadas |
| 2026-08-10 | Task 6: dívida do PR #35 decidida (tabela separada, se houver necessidade) e registrada no PRD |
