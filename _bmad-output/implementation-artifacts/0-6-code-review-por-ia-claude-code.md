# Story 0.6: Code Review por IA (Claude Code)

Status: ready-for-dev

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

- [ ] **Task 1 — Reescrever o prompt** (AC: #2)
  - [ ] Substituir `/code-review:code-review ...` por prompt que nomeia os 4 pilares de julgamento
  - [ ] Incluir a lista de ADs da spine (AD-1 a AD-11) como referência de violação
  - [ ] Incluir **lista explícita do que NÃO revisar** — o que já é gateado por ferramenta
  - [ ] Instruir a citar arquivo e linha, e a **não comentar quando não houver achado** (silêncio é resultado válido)

- [ ] **Task 2 — Ajustar o workflow** (AC: #1, #4, #5)
  - [ ] Manter `name: claude-review` do job (vira required check na 0.7)
  - [ ] Manter `CLAUDE_CODE_OAUTH_TOKEN`
  - [ ] Avaliar `fetch-depth`: hoje é `1`; o review precisa do diff completo do PR
  - [ ] Remover os blocos comentados de exemplo deixados pelo `/install-github-app`
  - [ ] Considerar `claude_args` com `--allowedTools` restrito a leitura (o review não deve editar código)

- [ ] **Task 3 — Provar que o review aponta violação de pilar** (AC: #3)
  - [ ] Criar código que viola um pilar de julgamento **sem** violar nenhuma ferramenta:
        um handler que muta estado **sem registro de auditoria** (viola AD-3 e o pilar Auditável)
  - [ ] O arquivo precisa passar em `tsc`, Biome, cobertura (com teste), dependency-cruiser e Trivy — só o review por IA pode pegá-lo
  - [ ] Confirmar que o Claude comentou apontando a ausência de auditoria
  - [ ] Reverter
  - [ ] **Se o Claude não apontar:** registrar como resultado e ajustar o prompt; repetir no máximo 2 vezes. Se ainda assim não apontar, documentar a limitação em vez de forçar

- [ ] **Task 4 — Registrar a natureza do gate** (AC: #3)
  - [ ] Documentar no Dev Agent Record que este é o único gate **probabilístico** do épico
  - [ ] Registrar o que ele **não** garante, para a Story 0.7 não tratá-lo como determinístico

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

### Debug Log References

### Completion Notes List

### File List
