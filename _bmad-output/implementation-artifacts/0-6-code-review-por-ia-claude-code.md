# Story 0.6: Code Review por IA (Claude Code)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a construtor,
I want um review automático por IA a cada PR,
so that os pilares de julgamento (auditável, observável, escalável, performático) sejam cobertos além das ferramentas.

## Acceptance Criteria

1. **Given** a action `anthropics/claude-code-action` instalada e autenticada pela assinatura Claude
   **When** um PR é aberto
   **Then** o Claude analisa o diff e posta comentários de review.

2. **Given** o prompt do workflow
   **When** ele é inspecionado
   **Then** direciona o review aos **4 pilares de julgamento** — auditável, observável, escalável, performático — e a violações dos **ADs da spine**
   **And** instrui explicitamente a **não** duplicar o que as ferramentas já gateiam (`tsc`, Biome, Vitest, cobertura, dependency-cruiser, Trivy, Gitleaks, commitlint).

3. **Given** um PR com violação de pilar de julgamento que **nenhuma ferramenta detecta**
   **When** o review roda
   **Then** o Claude aponta a violação em comentário.
   *(Ver **Natureza probatória** abaixo: este é o único gate não-determinístico do épico.)*

4. **Given** a autenticação
   **When** o workflow roda
   **Then** usa `CLAUDE_CODE_OAUTH_TOKEN` (assinatura), sem consumo de créditos de API.

5. **Given** o check no PR
   **When** ele aparece
   **Then** mantém o nome `claude-review`, apto a virar *required status check* na Story 0.7.

## Tasks / Subtasks

- [x] **Task 1 — Reescrever o prompt** (AC: #2)
  - [x] Substituir `/code-review:code-review ...` por prompt que nomeia os 4 pilares de julgamento
  - [x] Incluir a lista de ADs da spine (AD-1 a AD-11) como referência de violação
  - [x] Incluir **lista explícita do que NÃO revisar** — o que já é gateado por ferramenta
  - [x] Instruir a citar arquivo e linha, e a **não comentar quando não houver achado** (silêncio é resultado válido)

- [x] **Task 2 — Ajustar o workflow** (AC: #1, #4, #5)
  - [x] Manter `name: claude-review` do job (vira required check na 0.7)
  - [x] Manter `CLAUDE_CODE_OAUTH_TOKEN`
  - [x] Avaliar `fetch-depth`: hoje é `1`; o review precisa do diff completo do PR
  - [x] Remover os blocos comentados de exemplo deixados pelo `/install-github-app`
  - [x] Considerar `claude_args` com `--allowedTools` restrito a leitura (o review não deve editar código)

- [x] **Task 3 — Provar que o review aponta violação de pilar** (AC: #3) — **executada; resultado negativo, documentado**
  - [x] Criar código que viola um pilar de julgamento **sem** violar nenhuma ferramenta:
        um handler que muta estado **sem registro de auditoria** (viola AD-3 e o pilar Auditável)
  - [x] O arquivo precisa passar em `tsc`, Biome, cobertura (com teste), dependency-cruiser e Trivy — só o review por IA pode pegá-lo
  - [x] Confirmar que o Claude comentou apontando a ausência de auditoria — **executado no PR #12; resultado NEGATIVO**, ver *Resultado da AC #3*
  - [x] Reverter
  - [x] **Se o Claude não apontar:** registrar como resultado e ajustar o prompt; repetir no máximo 2 vezes. Se ainda assim não apontar, documentar a limitação em vez de forçar — **duas tentativas feitas, limitação documentada**

- [x] **Task 4 — Registrar a natureza do gate** (AC: #3)
  - [x] Documentar no Dev Agent Record que este é o único gate **probabilístico** do épico
  - [x] Registrar o que ele **não** garante, para a Story 0.7 não tratá-lo como determinístico

## Dev Notes

### ⚠️ Natureza probatória — este gate é diferente de todos os outros

As stories 0.1–0.5 entregaram gates **determinísticos**: mesma entrada, mesmo resultado, sempre. A prova por violação deliberada é conclusiva neles.

Aqui não. O review por IA é **probabilístico**: o mesmo diff pode gerar comentários diferentes em execuções diferentes. Consequências para esta story:

- A AC #3 prova que o gate **é capaz** de apontar a violação, não que **sempre** apontará.
- Um review sem comentários **não** é evidência de código correto.
- A Story 0.7 **não pode** tratar `claude-review` como garantia de qualidade dos 4 pilares — apenas como reforço.

Isso está no próprio QUALITY-GATE §1: pilares "duros" (funcional, testado, seguro) têm gate determinístico; pilares "de julgamento" (auditável, observável, escalável, performático) são cobertos por ferramenta **+ IA**. A IA é a segunda camada, não a única.

**Registrar honestamente vale mais do que fingir determinismo.**

### O que já foi observado nas execuções deste repositório

O `claude-review` rodou em todos os PRs do Epic 0 e **nunca postou um comentário**:

| PR | Duração | Resultado |
|---|---|---|
| #2 | 49s | `No buffered inline comments` |
| #3 | 54s | idem |
| #4 | 5m37s | idem |
| #5 | 10m10s | idem |
| #9 | 1m7s | idem |
| #10 | 6m1s | idem |

Duas leituras possíveis, e é preciso distinguir:

1. **Não havia o que apontar** — plausível: os PRs eram configuração de CI e Markdown, com pouco código.
2. **O prompt está errado para este projeto** — o `/code-review:code-review` padrão caça **bugs de correção**, não os 4 pilares de julgamento nem violações de AD. É outro escopo.

A variação de duração (49s a 10m) sugere que ele *analisa* de verdade. O problema é **o que** ele analisa. Esta story corrige isso.

### Estado atual do workflow

`.github/workflows/claude-code-review.yml`, gerado pelo `/install-github-app` e **nunca customizado**:

```yaml
on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]

jobs:
  claude-review:
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          plugin_marketplaces: 'https://github.com/anthropics/claude-code.git'
          plugins: 'code-review@claude-code-plugins'
          prompt: '/code-review:code-review ${{ github.repository }}/pull/${{ github.event.pull_request.number }}'
```

Contém ainda vários blocos comentados de exemplo (filtro por autor, por paths) — ruído do gerador, remover.

**Nota sobre `types`:** este workflow tem `ready_for_review` mas **não** `edited` — e está correto assim. Diferente do `traceability` da Story 0.5, o review analisa o **diff**, não metadados do PR; editar título ou corpo não muda o que deve ser revisado.

### A action aceita prompt livre

Verificado na documentação oficial (`docs/usage.md`):

- `prompt` — *"Instructions for Claude. Can be a direct prompt or custom template for automation workflows."* Não precisa ser slash command.
- `claude_args` — repassa flags ao CLI, ex.: `--allowedTools Read,Grep --max-turns 10`.
- A action posta comentários inline automaticamente quando o Claude identifica problemas.

**Decisão a tomar na implementação:** manter o plugin `code-review@claude-code-plugins` (mecânica de inline comments já testada 6 vezes neste repo) e acrescentar direcionamento, **ou** trocar por prompt livre. Se o slash command ignorar instruções extras, ir para prompt livre. **Verificar no log qual prompt chegou ao Claude** — não assumir.

### Os 4 pilares de julgamento (QUALITY-GATE §1 e §3)

O prompt deve nomeá-los com o significado que têm **neste projeto**:

| Pilar | O que o review deve procurar |
|---|---|
| **Auditável** | Mutação sem registro de auditoria com autor+origem (AD-3, AD-9); mudança sem rastro a Story/FR |
| **Observável** | Erro engolido, log ausente onde importa, logging não estruturado |
| **Escalável** | Acoplamento que impeça evolução independente; lógica de negócio vazando para adapter (AD-1, AD-2) |
| **Performático** | N+1, loop caro, I/O desnecessário no caminho quente |

### O que o prompt deve mandar IGNORAR

Sem isso, o review gasta atenção repetindo o que já é determinístico — e ruído afoga sinal:

`tsc` (tipos) · Biome (estilo, format) · Vitest + cobertura ≥80% · dependency-cruiser (AD-1) · Trivy (CVEs) · Gitleaks (segredos) · commitlint (mensagens) · CodeQL (SAST)

### Armadilhas conhecidas

- **`fetch-depth: 1`** traz só o último commit. Confirmar se a action busca o diff via API (provável) ou via git local — no segundo caso, o review estaria vendo um diff incompleto **em todos os PRs até agora**.
- **`pull-requests: read`** nas permissions, mas a action posta comentários. Funciona porque ela troca OIDC por app token (visto nos logs: `App token successfully obtained`). **Não "corrigir" para `write` sem necessidade** — se funciona com read, menos privilégio é melhor.
- **Silêncio não é aprovação.** O prompt deve instruir a não inventar achados quando não houver — mas o Dev Agent Record precisa deixar claro que ausência de comentário ≠ código bom.
- **Custo de cota.** O review consome a cota da assinatura Claude (decisão registrada no QUALITY-GATE §4). Um run de 10 minutos não é grátis em cota. Se o volume de PRs crescer, reavaliar.
- **Nome do job.** `claude-review` vira required check na 0.7 — não renomear.

### Aprendizados das Stories 0.1–0.5 (aplicar)

- **Verificar o artefato, não o exit code.** Aqui: ler o **log do run** para confirmar qual prompt chegou ao Claude e o que ele produziu. Seis ferramentas já enganaram neste épico.
- **Isolar a prova.** O arquivo de violação precisa passar em todos os outros gates — senão não se sabe se o review pegou ou se foi outro job.
- **Provas de conteúdo de arquivo:** revert resolve. (Provas de mensagem de commit exigem reescrita de histórico — lição da 0.5, não se aplica aqui.)
- **Registrar o que não foi provado.** Na 0.4, duas regras ficaram declaradas mas não exercitadas, e isso está anotado.

### Testing standards

Nenhum teste de produto. O arquivo de violação da Task 3 vem **com teste** que o cobre 100%, para não disparar o gate de cobertura — padrão estabelecido na Story 0.4.

### Project Structure Notes

- `.github/workflows/claude-code-review.yml` (modificado — **não** criar arquivo novo)
- Nenhuma dependência npm nova

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 0.6] — user story e AC original
- [Source: QUALITY-GATE.md#4] — escopo do review por IA e decisão de autenticação
- [Source: QUALITY-GATE.md#1] — princípio: pilares duros por ferramenta, de julgamento por ferramenta + IA
- [Source: QUALITY-GATE.md#3] — mapa pilar → gate, coluna "Reforço por IA"
- [Source: ARCHITECTURE-SPINE.md#AD-3] — auditoria transacional com autor e origem
- [Source: ARCHITECTURE-SPINE.md#AD-9] — identidade e origem propagam até a auditoria
- [Source: ARCHITECTURE-SPINE.md#AD-11] — gateway de CI obrigatório
- [Source: 0-5-rastreabilidade-commits-e-prs.md#Debug Log References] — padrão de isolamento de prova

## Dev Agent Record

### Agent Model Used

claude-opus-5

### Debug Log References

**🔴 A action pula o review quando o próprio workflow é modificado — e conclui VERDE.**

Ao commitar a violação de pilar neste PR, o `claude-review` terminou em **8 segundos** (antes: 49s a 10m). O log:

```
##[warning]Skipping action due to workflow validation: Workflow validation failed.
The workflow file must exist and have identical content to the version on the
repository's default branch.
Exiting due to workflow validation skip
##[end-action id=claude-review.run;outcome=success;conclusion=success]
```

É uma **proteção de segurança legítima** da action: impede que um PR modifique o workflow de review para exfiltrar segredos. O problema não é a proteção, é o desfecho: `conclusion=success`. **O job fica verde sem ter revisado nada.**

**Implicação direta para a Story 0.7:** se `claude-review` virar *required status check*, qualquer PR que toque em `.github/workflows/claude-code-review.yml` satisfaz o check automaticamente. O gate existe, mas tem um buraco previsível — e é justamente nos PRs que mexem no próprio review que ele desliga. **Registrar como limitação conhecida na 0.7; não há como corrigir do nosso lado, é comportamento da action.**

**Consequência para esta story:** a AC #3 **não pôde ser provada neste PR**. O prompt novo só entra em vigor depois que ele chegar à `main`. A prova exige um PR separado que **não toque em workflow**.

**🟡 Os seis silêncios anteriores têm outra causa.** Verifiquei se os PRs #3, #4, #5, #9 e #10 tocaram em `claude-code-review.yml`: **nenhum tocou**. Ou seja, o review rodou de verdade neles e não achou nada — o que aponta para o prompt inadequado (ou ausência real de achado), não para o skip de validação. **São dois problemas distintos**, e confundi-los levaria a "corrigir" a coisa errada.

**🟢 `fetch-depth: 1` investigado e mantido.** Era minha suspeita para os silêncios. O log mostra que a action faz fetch próprio (`Restoring .claude, .mcp.json ... from origin/main (PR head is untrusted)`) e acessa o PR via MCP. Sem evidência de diff truncado, e é o default do gerador da Anthropic. **Não alterado** — não se conserta o que não está comprovadamente quebrado.

**🟢 `permissions: pull-requests: read` mantido.** Parece insuficiente para quem posta comentários, mas funciona: a action troca OIDC por app token (`App token successfully obtained`). Menos privilégio é melhor; elevar para `write` sem necessidade seria piorar.

**⚠️ Este é o único gate probabilístico do épico.** Os cinco anteriores são determinísticos: mesma entrada, mesmo resultado. Aqui o mesmo diff pode gerar comentários diferentes a cada execução. Portanto:

- A prova (quando feita) demonstrará que o gate **é capaz** de apontar, não que **sempre** apontará
- **Silêncio não é aprovação**
- A Story 0.7 **não pode** tratá-lo como garantia dos quatro pilares — é reforço, conforme QUALITY-GATE §1

### Completion Notes List

- **Task 1** — prompt reescrito: nomeia os quatro pilares com o significado que têm neste projeto, lista os onze ADs para citação por número, lista explicitamente o que **não** revisar (oito itens já gateados de forma determinística) e instrui a não comentar sem achado.
- **Task 2** — workflow limpo: removidos os blocos comentados de exemplo do `/install-github-app`; `claude_args: --allowedTools Read,Grep,Glob --max-turns 30` (o review aponta, não corrige); `name: claude-review`, `CLAUDE_CODE_OAUTH_TOKEN`, `permissions` e `fetch-depth` mantidos com justificativa. `types` sem `edited` de propósito — o review analisa o diff, e editar título ou corpo não muda o que revisar (diferente do `traceability` da Story 0.5).
- **Task 3** — **incompleta por impedimento técnico.** O arquivo de violação foi criado e validado localmente: passa em `lint=0`, `typecheck=0`, `arch=0` e cobertura **100% (2/2)** — isolamento confirmado, nenhuma ferramenta o detecta. Mas a verificação no CI é impossível neste PR (ver Debug Log). Revertido.
- **Task 4** — natureza probabilística do gate registrada acima, com as três consequências para a Story 0.7.

**AC #1** — satisfeita: a action roda e está autenticada (comprovado nos seis PRs anteriores).
**AC #2** — satisfeita: prompt inspecionável no arquivo, nomeia pilares e ADs, e lista o que ignorar.
**AC #3** — **NÃO satisfeita.** Requer PR separado após o merge deste.
**AC #4** — satisfeita: `CLAUDE_CODE_OAUTH_TOKEN`, sem `ANTHROPIC_API_KEY` (log confirma o campo vazio).
**AC #5** — satisfeita: job segue nomeado `claude-review`.

**Pendência explícita:** a story **não deve ir para `done`** antes de a AC #3 ser provada num PR que não toque em workflow. Marcá-la como concluída agora seria exatamente o tipo de falso verde que este épico existe para impedir.

### File List

- `.github/workflows/claude-code-review.yml` (modificado — prompt, `claude_args`, limpeza)
- `_bmad-output/implementation-artifacts/0-6-code-review-por-ia-claude-code.md` (modificado)
- `_bmad-output/implementation-artifacts/0-5-rastreabilidade-commits-e-prs.md` (modificado — status `done`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modificado)

## Change Log

| Data | Evento |
|---|---|
| 2026-08-08 | Tasks 1, 2 e 4: prompt reescrito para os 4 pilares, workflow limpo, natureza do gate registrada |
| 2026-08-08 | PR #11 aberto |
| 2026-08-08 | Prova da AC #3 bloqueada: a action pula o review quando o próprio workflow é modificado, concluindo verde |
| 2026-08-08 | Confirmado que os 6 silêncios anteriores têm outra causa — nenhum PR anterior tocou no workflow |
| 2026-08-08 | Prova revertida; AC #3 pendente de PR separado pós-merge |
| 2026-08-10 | Diagnostico: `permission_denials_count` revelou que as negacoes vinham do runtime, nao do GitHub |
| 2026-08-10 | Causa raiz: `mcp__github_inline_comment__create_inline_comment` faltava em `allowedTools` (PR #24) |
| 2026-08-10 | **AC #3 satisfeita**: dois comentarios inline no PR #23, um deles sobre violacao nao plantada. Story `done` |
| 2026-08-08 | PR #12 (prova isolada): review não comentou. Causa identificada — plugin removido e `allowedTools` restrito deixaram o revisor sem canal de saída |
| 2026-08-08 | PR #13 corrige: plugin restaurado, restrição removida |
| 2026-08-08 | PR #12 redisparado com plugin ativo: **ainda sem comentário**. AC #3 **NÃO satisfeita** — ver Resultado da AC #3 abaixo |

## Resultado da AC #3 — SATISFEITA `[2026-08-10]`

> **Este bloco foi reescrito.** A versão anterior concluía que o gate não
> apontava a violação. Era falso: a ferramenta de comentário não estava em
> `allowedTools`, e nenhuma saída jamais chegou ao PR. O texto original está
> preservado abaixo, em *Histórico da conclusão errada*, porque como uma
> conclusão equivocada se sustentou por quatro experimentos é a parte mais
> instrutiva desta story.

**Satisfeita.** Com `mcp__github_inline_comment__create_inline_comment`
permitido, o review postou **dois comentários inline** no PR #23
(run `31385030022`), sobre um arquivo com violações plantadas:

| Linha | Achado |
| --- | --- |
| 31 | `[AD-3]` mutação de estado sem registro de auditoria — citou `abrir-chamado.ts:30` e `ticket-repository.ts:21-45` como o padrão correto do repositório, e explicou a consequência: exposta por tool MCP ou rota HTTP, a mudança ficaria sem rastro |
| 28 | `[AD-2]` mutação fora do domínio — **achado NÃO plantado** —, notando que `novaPrioridade` aceita qualquer string, sem um `ehPrioridade` análogo ao `ehCategoria` de `domain/ticket.ts:22` |

O segundo comentário é o resultado mais significativo: encontrou uma violação
**que não fazia parte do experimento**, lendo o padrão que a Story 1.1
estabeleceu no repositório. Isso é exatamente o que se espera de um revisor
dos pilares de julgamento.

### A causa raiz, e por que demorou

O plugin `code-review` posta com `mcp__github_inline_comment__create_inline_comment`.
Essa ferramenta precisa estar em `allowedTools` — **omitir a flag não libera
tudo**: em execução não interativa, ferramenta que escreve é negada por padrão.

Três correções minhas, encadeadas, cada uma plausível e nenhuma suficiente:

| PR | O que fiz | Por que não resolveu |
| --- | --- | --- |
| #11 | `--allowedTools Read,Grep,Glob` | retirou justamente a ferramenta de comentar |
| #13 | removi a flag inteira | ausência de restrição ≠ permissão total |
| #22 | `pull-requests: write` | correto, mas insuficiente sozinho |
| #24 | ferramenta explícita em `allowedTools` | ✅ |

O sintoma estava no log o tempo todo: `permission_denials_count` — 4 no teste
de canal, **10** depois do PR #22. Foi o *aumento* que revelou que as negações
vinham do runtime do Claude Code, não do GitHub Actions.

**A lição:** durante quatro experimentos li "não comentou" como afirmação
sobre a capacidade do modelo, quando era afirmação sobre a minha configuração.
É o mesmo erro que este épico inteiro combate — *verificar o artefato, não o
exit code* — e eu não o apliquei à própria configuração do gate.

---

## Histórico da conclusão errada

*(Preservado como registro. As afirmações abaixo foram refutadas em 2026-08-10.)*

**~~Não satisfeita.~~** Registro completo, porque a conclusão muda o peso da Story 0.7.

### O experimento

`src/application/commands/_prova-sem-auditoria.ts` — command handler que muta o estado de um Chamado (prioridade) **sem gravar registro de auditoria**: sem principal, sem origem `api|mcp`, sem transação. Viola **AD-3**, **AD-9** e o pilar **Auditável** de forma direta.

Desenhado para ser invisível a toda a maquinaria determinística — e foi:

| Gate | Resultado |
|---|---|
| `typecheck` (tsc strict) | pass |
| `lint` (Biome) | pass |
| `test` (Vitest) | pass — **cobertura 100%** |
| `arch` (dependency-cruiser) | pass |
| `security-deps` / `security-secrets` | pass |

### Duas execuções, dois motivos diferentes

**Execução 1** (run `31287913106`) — `num_turns: 8`, `is_error: false`, `total_cost_usd: 0.202`, `No buffered inline comments`.
Causa: **erro de configuração meu no PR #11.** Removi o plugin `code-review@claude-code-plugins` e restringi `claude_args` a `--allowedTools Read,Grep,Glob`. O plugin é quem fornece a ferramenta de buffer que o step `post-buffered-inline-comments.ts` consome. O Claude analisou e **não tinha canal de saída**. Corrigido no PR #13.

**Execução 2** (run `31289868069`) — plugin carregado (`Successfully added marketplace: claude-code-plugins`), sem restrição de ferramentas, workflow **idêntico ao da `main`** (a action não se pulou), `num_turns: 6`, `is_error: false`, `total_cost_usd: 0.168`, `No buffered inline comments`.

Nesta segunda execução **não há erro de configuração**: o revisor tinha o prompt correto (confirmado no log), a ferramenta de comentar e o diff. Analisou, consumiu cota, e **escolheu não comentar** uma violação explícita de AD-3.

### O que isso significa — e o que não significa

**Não significa** que o review por IA seja inútil: ele não produziu falso positivo, obedeceu a instrução de não inventar achado, e este é um único caso.

**Significa** que ele **não é confiável como cobertura dos quatro pilares de julgamento**. A hipótese mais provável é que o arquivo, isolado e com nome `_prova-`, pareça exemplo ou stub descartável — sem os módulos vizinhos (repositório, port de auditoria) que dariam contexto de que ali *deveria* haver auditoria. Um PR real do Epic 1 teria esse contexto. Mas isso é hipótese, não evidência, e a evidência disponível é: **violação plantada, gate silencioso**.

### Consequências obrigatórias para a Story 0.7

1. `claude-review` **pode** virar required check — garante que o review roda —, mas **não** conta como cobertura dos pilares Auditável, Observável, Escalável e Performático.
2. O QUALITY-GATE §1 diz que os pilares de julgamento são cobertos por "ferramenta **+** review por IA". Hoje, para esses quatro pilares, **não há ferramenta e o reforço por IA falhou no único teste feito**. Eles estão efetivamente **descobertos**.
3. Isso eleva o peso da **revisão humana** dos PRs do Epic 1 — em especial nas stories que tocam auditoria (1.8) e no tracer bullet (1.1), que define o padrão copiado pelas demais.
4. **Retestar na Story 1.1**, com código real e contexto vizinho. Se o review apontar lá, revisar esta conclusão.

### Limitação adicional já conhecida

A action **pula o review e conclui `success`** quando o PR modifica o próprio `claude-code-review.yml` (documentado no Debug Log). Como required check, isso significa: todo PR que mexe no workflow de review satisfaz o check automaticamente. Sem correção possível do nosso lado.
