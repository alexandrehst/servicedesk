---
baseline_commit: f5ff36a
---

# Story 2.2: Mudar Status (máquina de estados)

Status: review

## Story

As a Agente,
I want mudar o Status de um Chamado via `mudar_status`,
so that o estado reflita a realidade como fonte da verdade.

## Acceptance Criteria

1. **Given** a máquina de estados fechada definida no domínio (AD-5)
   **When** a IA chama `mudar_status(numero, novo_status, versao)`
   **Then** só transições válidas são aceitas; inválidas são rejeitadas pelo
   **domínio** com `TransicaoInvalida` (FR-4)
   **And** a mudança registra autor, origem, **e o par de/para** no Log (AD-3,
   AD-9).

2. **Given** dois Agentes editando o mesmo Chamado
   **When** o segundo salva com versão desatualizada
   **Then** o command rejeita com `Conflict` e **nada** é alterado
   (concorrência otimista, AD-10).

3. **Given** um Chamado que o autor não pode ver — alheio, excluído ou
   inexistente
   **When** ele tenta mudar o Status
   **Then** recebe `TicketNaoEncontrado`, pelo mesmo gargalo `visivelPara`.

4. **Given** um Solicitante
   **When** ele tenta mudar o Status do **próprio** Chamado
   **Then** recebe `SemPermissao`: mudar Status é atendimento, e ele não atende.

5. **Given** as transições **irreversíveis** (`fechado`, `cancelado`) e a
   reabertura
   **When** pedidas por `mudar_status`
   **Then** são recusadas — elas exigem confirmação explícita e têm ações
   dedicadas na Story 2.6 (AD-7). `mudar_status` **não** é uma porta dos fundos
   para elas.

## Tasks / Subtasks

- [x] **Task 1 — Domínio: a máquina de estados** (AC: #1, #5)
  - [x] `TRANSICOES: Record<Status, readonly Status[]>` em `domain/ticket.ts` —
        a tabela do AD-5, definida **uma vez**
  - [x] `transicaoValida(de, para)` e `TransicaoInvalida` em `DomainErrorCode`
  - [x] Separar as transições que **exigem confirmação** (2.6) das comuns —
        ver Dev Notes; `mudar_status` só executa as comuns
- [x] **Task 2 — Domínio: a versão** (AC: #2)
  - [x] `version` em `Ticket` (não em `NovoTicket`: só existe depois de
        persistir, como `number` e `excluidoEm`)
  - [x] `Conflict` em `DomainErrorCode`
- [x] **Task 3 — Migration e schema** (AC: #1, #2)
  - [x] `0008_status_e_versao.sql`: `tickets.version integer NOT NULL DEFAULT 1`
        e `audit_entries.de`/`audit_entries.para` (`text`, nulos)
  - [x] Asserção contra o **catálogo do banco** nos testes, provando os dois
        lados (padrão da 1.7)
- [x] **Task 4 — Port e adapter** (AC: #1, #2)
  - [x] `mudarStatusComAuditoria(numero, novo, autor, esperada)` — `UPDATE ...
        WHERE number = $n AND version = $esperada AND deleted_at IS NULL
        RETURNING`, incremento de `version`, e a auditoria na mesma transação
  - [x] Devolve o que aconteceu: mudou, ou não havia linha que casasse
  - [x] `buscarHistoricoBruto` passa a trazer `de`/`para`
- [x] **Task 5 — Command handler** (AC: #1..#5)
  - [x] `commands/mudar-status.ts`: `buscarPorNumero` → `visivelPara` →
        `pode('mudaStatus')` → `transicaoValida` → repositório
  - [x] Capacidade `mudaStatus` na matriz — só Agente
  - [x] Ação `mudar_status` em `ACOES` (`domain/auditoria.ts`)
- [x] **Task 6 — Contrato e tool MCP** (AC: #1, #2)
  - [x] `contracts/mudar-status.ts` com `versao` **obrigatória** (AD-6)
  - [x] `ver_chamado` e o histórico passam a expor `versao` e `de`/`para`
  - [x] Tool `mudar_status`, com `autenticar()` **e** `limitarChamadas()`
- [x] **Task 7 — Testes** (AC: #1..#5)
  - [x] Recusa antes do caminho feliz; matriz de transições exaustiva
  - [x] **Conflito real contra o Postgres**, com `Promise.all` — não simulado
  - [x] Integração: `de`/`para` aparecem no histórico da 1.8
  - [x] **Verificar por mutação** — script em `scratchpad/mutacoes-22.py`
- [x] **Task 8 — Registrar as decisões** (AC: —)
  - [x] PRD (FR-4), spine (AD-5, AD-10) e o Log de "de/para"

## Dev Notes

### Esta story constrói o AD-10, que existia só no papel desde o início

A 2.1 refinou o AD-10 (escrita aditiva não versiona) e deixou o **mecanismo**
para cá. Nada dele existe: não há `version`, não há `updated_at`, não há
`Conflict`. E o que a 2.2 escolher vale para 2.3, 2.4, 2.5 e 2.6.

**Decisão (por delegação): coluna `version integer NOT NULL DEFAULT 1`**,
incrementada a cada mutação de campo.

Por que não `updated_at`: a lição da 1.8 é que a mutação e sua auditoria saem
na **mesma transação**, então timestamps iguais são o caso comum, não a
exceção. Um relógio com resolução de milissegundos usado como versão perde
exatamente onde precisaria distinguir.

**O ponto não é a coluna — é o `UPDATE` condicional:**

```sql
UPDATE tickets SET status = $novo, version = version + 1
 WHERE number = $n AND version = $esperada AND deleted_at IS NULL
RETURNING version
```

Ler a versão, comparar em JavaScript e depois escrever seria três passos com
uma janela entre eles — e é exatamente a janela que o AD-10 existe para fechar.
A garantia é do **banco**, como no `consumirLinkDeLogin` (1.3) e no
`excluirComAuditoria` (1.7). Zero linhas afetadas significa: ou a versão mudou,
ou o Chamado foi excluído no meio do caminho.

Quando o `UPDATE` não casar, **releia** para distinguir os dois casos:
Chamado sumiu (`TicketNaoEncontrado`) ou versão divergiu (`Conflict`). Sem essa
releitura, um Chamado excluído por outro Agente viraria "conflito", e quem
chamou tentaria de novo para sempre.

**A versão entra no contrato** (AD-6): quem chama precisa informá-la, então a
tool MCP ganha um campo obrigatório. Isso é deliberado — versão opcional com
default "última" seria concorrência otimista que não protege ninguém.

### A dívida do Log que a 2.1 deixou aqui

`audit_entries` tem `acao`, `autor`, `origin`, `registrado_em`. Não há onde
guardar "de `aberto` para `em_andamento`" — e 2.3 (dono), 2.4 (prioridade) e
2.5 têm a mesma necessidade.

**Decisão (por delegação): duas colunas, `de` e `para` (`text`, nulos).**

Não `jsonb`: todas as mudanças do Epic 2 são de um **valor escalar** para
outro. Um `detalhe jsonb` aceitaria qualquer coisa — inclusive o corpo de um
Comentário, que a 2.1 deliberadamente manteve fora do Log — e o contrato de
saída do histórico teria que expor forma livre. Duas colunas de texto dizem
exatamente o que o Log guarda, e o schema Zod as tipa sem esforço.

Nulos porque nem toda ação tem par: `abrir_chamado` e `comentar_chamado` não
mudam valor nenhum. **Não invente** `de: 'nenhum'` para preencher.

Isso mexe no contrato de saída da 1.8 — `entradaDeHistoricoSchema` ganha dois
campos opcionais. Verifique que o histórico continua verde.

### A máquina de estados, e por que ela tem duas tabelas

O AD-5 pede uma máquina fechada definida **uma vez** no domínio. `STATUS` é só
uma lista hoje; `abrirTicket` só produz `'aberto'`.

**Decisão (por delegação) — as transições:**

| De | Para (via `mudar_status`) | Para (só com confirmação — Story 2.6) |
| --- | --- | --- |
| `aberto` | `em_andamento` | `cancelado` |
| `em_andamento` | `resolvido`, `aberto` | `cancelado` |
| `resolvido` | `em_andamento` | `fechado` |
| `fechado` | — | `em_andamento` (reabrir) |
| `cancelado` | — | `em_andamento` (reabrir) |

**Duas tabelas, e a separação é a AC #5.** A Story 2.6 exige confirmação
explícita para fechar, cancelar e reabrir (AD-7, FR-15, FR-17). Se
`mudar_status` aceitasse `fechado`, existiria uma porta dos fundos: a IA
fecharia o Chamado sem human-in-the-loop chamando a tool genérica. O guardrail
da 2.6 nasceria furado.

Então: `TRANSICOES` (o que `mudar_status` faz) e `TRANSICOES_COM_CONFIRMACAO`
(o que a 2.6 vai fazer). As duas no domínio, declaradas agora — a 2.6
implementa o caminho de execução da segunda.

`em_andamento → aberto` está em `mudar_status` de propósito: devolver um
Chamado à fila não é destrutivo e acontece quando o Agente percebe que não é
com ele. Não confundir com reabrir, que traz de volta algo **encerrado**.

### O padrão a copiar, e a ordem que não é estilo

`comentar-chamado.ts` (2.1) e `excluir-chamado.ts` (1.7):

```
buscarPorNumero → visivelPara → pode(capacidade) → dominio valida → repositorio
```

`visivelPara` **antes** de `pode`: quem não vê recebe `TicketNaoEncontrado`;
quem vê mas não pode agir recebe `SemPermissao`. E `visivelPara` já descarta
excluído (1.7) e alheio (1.4) — não reimplemente.

**A validação da transição vem depois da autorização.** Um Solicitante pedindo
transição inválida deve receber `SemPermissao`, não `TransicaoInvalida`: o
segundo revelaria a ele como a máquina funciona, e ele não tem o direito de
agir de qualquer forma.

### O adapter grava, não interpreta (achado do PR #46)

A ação vai a `ACOES` em `domain/auditoria.ts`, e o **command** resolve o par
`de`/`para` e o entrega pronto ao port. Se o adapter ramificar sobre estado de
negócio para decidir o que gravar, a decisão está no lugar errado — foi
exatamente o que o `claude-review` pegou na 2.1.

### O teste de conflito precisa ser real

Concorrência otimista testada com duble não prova nada: o duble concorda com
o que você programou. Use **`Promise.all` contra o Postgres**, duas mutações
com a mesma versão esperada, e prove que **uma** vence e a outra recebe
`Conflict` — e que o Chamado ficou com o valor da vencedora.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
| --- | --- |
| Fechar, cancelar, reabrir (execução) | 2.6 — aqui só as transições são declaradas |
| `ConfirmationRequired` e o AD-7 | 2.6 |
| E-mail ao resolver | 2.5 |
| Mudar Dono e Prioridade | 2.3 e 2.4 — mas as duas usam a `version` desta story |

### Armadilhas conhecidas

- **Cobertura por arquivo** (1.2), não o total.
- **Mutação sobrevivente pode ser inócua** — verifique que ela muda
  comportamento observável antes de "reforçar" o teste (1.9 e 2.1).
- **`await promessa.catch((e) => e as Error)` não devolve `Error`.**
- **Escrita que não aconteceu não vira auditoria** (1.7): se o `UPDATE` não
  afetou linha, não grave registro.
- **Verde curto do `claude-review` não é revisão** — 44s é silêncio, 4–5 min é
  revisão (medido no PR #46).

### References

- [Source: epics.md#Story 2.2]
- [Source: prd.md#FR-4] — Status de conjunto fechado
- [Source: ARCHITECTURE-SPINE.md#AD-5] — máquina de estados no domínio
- [Source: ARCHITECTURE-SPINE.md#AD-10] — concorrência otimista, e o refinamento da 2.1
- [Source: 2-1-comentar-chamado-publico-interno.md] — o adapter grava, não interpreta
- [Source: 1-7-soft-delete-base.md] — `UPDATE` condicional como garantia do banco

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**O teste de corrida ensinou algo que eu ia registrar errado.** Escrevi o teste
do AD-10 esperando que a perdedora recebesse `Conflict` — e ela recebeu
`TransicaoInvalida`. Não era bug: se a segunda mutação lê o Chamado **depois**
do commit da primeira, ela vê `em_andamento` e pedir `em_andamento` vira
auto-transição, que morre antes de chegar ao `UPDATE`. Se lê antes, morre no
`UPDATE` com `Conflict`.

Fixar `Conflict` ali seria **fixar o timing do banco**: passaria nesta máquina
e falharia numa mais lenta. O teste passou a provar a invariante que de fato
importa — **uma escrita só, versão anda uma vez** — e o `Conflict` determinístico
ficou num teste próprio (versão velha depois de mudança já aplicada). Rodei três
vezes seguidas para confirmar estabilidade.

**Duas mutações sobreviveram, e as duas apontavam coisas diferentes.**

A primeira era **redundância real**: a guarda `de !== para` em `transicaoValida`
nunca é alcançada, porque nenhuma tabela lista o próprio estado como destino.
Removê-la não mudava nada — e é exatamente isso que uma mutação sobrevivente
significa quando o código é inalcançável. A guarda saiu, e a invariante passou
para onde ela de fato mora: um teste sobre os **dados**, que reprova se alguém
escrever `aberto: ['aberto']`. Menos código, mesma garantia, e agora
exercitada.

A segunda era **lacuna de teste**: o `deleted_at IS NULL` no `UPDATE` protege a
janela entre a leitura do command e a escrita, e testá-lo pelo command não prova
nada — o `visivelPara` barra antes. O teste passou a chamar o **repositório
direto**, que é onde a garantia mora.

É a terceira story seguida em que uma mutação sobrevivente **não** era teste
fraco. O padrão está firme: verificar se ela muda comportamento observável antes
de mexer no teste.

**A ordem das checagens é uma decisão de segurança, não de estilo.** Autorização
vem **antes** da validação da transição: um Solicitante pedindo transição
inválida recebe `SemPermissao`, e não `TransicaoInvalida`. O segundo lhe
ensinaria como a máquina de estados funciona sem que ele tenha direito de agir —
e a mutação que inverte a ordem reprova 2 testes.

**Distinguir `Conflict` de `TicketNaoEncontrado` exigiu uma releitura.** Zero
linhas afetadas tem duas causas — versão divergiu, ou o Chamado foi excluído no
meio do caminho — e elas pedem ações **opostas** de quem chamou: releia-e-tente,
ou desista. Sem a releitura, um Chamado excluído viraria "conflito" e a IA
tentaria para sempre.

**Quinze mutações aplicadas, quinze reprovações** (script versionado em
`scratchpad/mutacoes-22.py`):

| Mutação aplicada | Reprovou |
| --- | --- |
| **Ignorar a versão esperada no `UPDATE`** (lost update) | 2 testes |
| Não incrementar a versão | 5 testes |
| Usar a versão do Chamado lido, e não a informada pelo chamador | 3 testes |
| Conflito vira sucesso silencioso | 4 testes |
| Aceitar qualquer transição | 4 testes |
| Auto-transição entra na tabela de dados | 2 testes |
| **`mudar_status` executa transição que exige confirmação** | 3 testes |
| Cancelar entra na tabela de transições comuns | 2 testes |
| Solicitante ganha permissão de mudar Status | 2 testes |
| Validar a transição antes de autorizar | 2 testes |
| Pular o gargalo de visibilidade | 2 testes |
| Não filtrar excluído no `UPDATE` | 2 testes |
| Gravar auditoria de mudança que não aconteceu | 2 testes |
| Não registrar o par de/para no Log | 2 testes |
| Esquecer o `limitarChamadas` no handler | 1 teste |

A primeira e a sétima são as que mais valem: uma prova que o AD-10 existe de
verdade, a outra que a porta dos fundos da 2.6 está fechada.

### Completion Notes List

- **Task 1** — `TRANSICOES` e `TRANSICOES_COM_CONFIRMACAO` em
  `domain/transicoes.ts`, com teste garantindo que **não se sobrepõem**.
- **Task 2** — `version` em `Ticket` (não em `NovoTicket`); `Conflict` e
  `TransicaoInvalida` em `DomainErrorCode`.
- **Task 3** — migration `0008`, com asserção contra o catálogo do banco
  provando os dois lados (coluna existe **e** tem a restrição esperada).
- **Task 4** — `UPDATE` condicional; auditoria na mesma transação; `de`/`para`
  chegam prontos do command.
- **Task 5** — command com a ordem `visivelPara` → `pode` → transição.
- **Task 6** — `versao` obrigatória no contrato; `ver_chamado` passou a
  expô-la (sem isso, nenhuma mutação seria possível).
- **Task 7** — **472 testes** (eram 400); cobertura **98,59%**.
- **Task 8** — AD-5 e AD-10 na spine, FR-4 no PRD, convenção do Log.

**Não provado — registrado em vez de deixado implícito:**

1. **O código de erro da perdedora numa corrida real não é determinístico.**
   `Conflict` ou `TransicaoInvalida`, conforme o instante da leitura. O que é
   garantido — e testado — é que só uma escrita acontece. Se um dia a
   distinção importar para quem chama, o caminho é o command reler antes de
   validar a transição, ao custo de uma query a mais.
2. **`TRANSICOES_COM_CONFIRMACAO` está declarada e sem caminho de execução.**
   A 2.6 a implementa. Hoje pedir `fechado` sempre falha, o que é o
   comportamento correto — mas significa que a tabela ainda não foi exercitada
   por um caso de sucesso.
3. **Nada impede comentar em Chamado `resolvido` ou `fechado`** (herdado da
   2.1). Agora que as transições existem, a decisão é possível — mas não está
   nas ACs desta story.
4. **Duas guardas defensivas seguem sem teste** em `ticket-repository.ts`
   (linhas 69 e 96, herdadas), e a conexão IMAP real (1.9).
5. **O `claude-review` foi mudo na primeira rodada:** verde em **36s**, zero
   comentários (`/pulls/48/comments` → 0). Pelo sinal medido na 2.1, revisão de
   verdade leva 4–5 minutos; menos de um minuto é silêncio. **Verde curto não é
   evidência de revisão** — o que sustenta esta story são os 472 testes e as 15
   mutações.

### File List

- `src/domain/transicoes.ts` + teste (novos — a máquina do AD-5)
- `src/domain/ticket.ts` (modificado — `version` em `Ticket`)
- `src/domain/errors.ts` (modificado — `TransicaoInvalida`, `Conflict`)
- `src/domain/papeis.ts` + teste (modificados — `mudaStatus`)
- `src/domain/auditoria.ts` (modificado — `mudar_status` em `ACOES`, `de`/`para`)
- `src/application/contracts/mudar-status.ts` (novo)
- `src/application/contracts/ver-chamado.ts` (modificado — expõe `versao`)
- `src/application/contracts/ver-historico.ts` (modificado — expõe `de`/`para`)
- `src/application/ports/ticket-repository.ts` (modificado)
- `src/application/commands/mudar-status.ts` + teste (novos)
- `src/application/queries/{ver-chamado,ver-historico}.ts` (modificados)
- `src/adapters/persistence/ticket-repository.ts` (modificado)
- `src/adapters/persistence/mudar-status.test.ts` (novo — integração)
- `src/adapters/mcp/server.ts` + teste (modificados — tool `mudar_status`)
- `drizzle/migrations/0008_status_e_versao.sql` e `drizzle/schema.ts`
- Dubles de teste (modificados — `version` e o método novo)
- `scratchpad/mutacoes-22.py` (novo)
- `prd.md` (FR-4) e `ARCHITECTURE-SPINE.md` (AD-5, AD-10, Conventions)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-11 | Story criada; três decisões por delegação: `version` como coluna, `de`/`para` no Log, e duas tabelas de transição (comum vs. com confirmação) |
| 2026-08-11 | Tasks 1–6: máquina de estados, versão, migration, command e tool |
| 2026-08-11 | Task 7: 472 testes, cobertura 98,59% |
| 2026-08-11 | Duas mutações sobreviveram: uma era redundância (guarda removida), outra lacuna real (teste no repositório). 15 de 15 reprovaram |
| 2026-08-11 | Task 8: AD-5 e AD-10 registrados na spine; FR-4 no PRD |
| 2026-08-11 | PR #48: nove checks verdes; `claude-review` mudo em 36s |
