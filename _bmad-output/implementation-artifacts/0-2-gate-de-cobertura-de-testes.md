---
baseline_commit: 3ff1ea78ea9b23cfdd35c5118313282a1d7cf538
---

# Story 0.2: Gate de cobertura de testes

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a construtor,
I want um limite mínimo de cobertura verificado no CI,
so that "ampla cobertura de testes" seja não-negociável (pilar Testado).

## Acceptance Criteria

1. **Given** a suíte Vitest com relatório de cobertura habilitado
   **When** a cobertura fica abaixo do limite de **80%**
   **Then** o job `test` **falha**.

2. **Given** um PR aberto
   **When** o CI conclui
   **Then** a tabela de cobertura aparece como comentário no PR.

3. **Given** o gate configurado
   **When** um módulo com função não coberta é introduzido deliberadamente
   **Then** o job `test` **falha por threshold** — provado por execução no CI, com o percentual no log.
   *(Mesma lógica da AC #2 da Story 0.1: verde não é evidência.)*

4. **Given** que `src/` hoje contém apenas `.gitkeep`
   **When** o gate roda no estado atual
   **Then** ele passa **por ausência de alvo**, não por mérito
   **And** esse fato está registrado no Debug Log, não escondido atrás de um check verde.

5. **Given** a Story 0.7 vai conectar o SonarCloud
   **When** esta story conclui
   **Then** existe um `coverage/lcov.info` gerado pelo CI, no formato que o scanner do Sonar consome.

## Tasks / Subtasks

- [ ] **Task 1 — Provider de cobertura** (AC: #1)
  - [ ] `pnpm add -D @vitest/coverage-v8@4.1.10` (versão **exata** — o pacote tem peer `vitest: 4.1.10`, sem faixa)
  - [ ] Script `test:coverage` → `vitest run --coverage`

- [ ] **Task 2 — Configurar cobertura no Vitest** (AC: #1, #2, #5)
  - [ ] `coverage.provider: 'v8'`
  - [ ] `coverage.include: ['src/**/*.ts']` — **obrigatório**: sem isso, arquivo nunca importado por teste não entra no cálculo e o gate vira decorativo
  - [ ] `coverage.exclude`: `**/*.test.ts`, `**/.gitkeep`
  - [ ] `coverage.reporters: ['text', 'lcov', 'json-summary', 'json']`
        (`lcov` → Sonar na 0.7; `json-summary` + `json` → action de comentário no PR)
  - [ ] `coverage.thresholds`: `lines`, `functions`, `branches`, `statements` = **80**
  - [ ] Acrescentar `coverage/` ao `.gitignore` se ainda não estiver (já está — **conferir, não duplicar**)

- [ ] **Task 3 — CI: rodar cobertura no job `test`** (AC: #1, #5)
  - [ ] Alterar o step do job `test` de `pnpm test` para `pnpm test:coverage`
  - [ ] **Não criar um quarto job.** Os nomes `lint`/`typecheck`/`test` viram required checks na 0.7; um nome novo agora é dívida
  - [ ] Publicar `coverage/` como artifact (`actions/upload-artifact@v4`), insumo da 0.7

- [ ] **Task 4 — Relatório visível no PR** (AC: #2)
  - [ ] Adicionar `davelosert/vitest-coverage-report-action@v2.12.2` ao job `test`
  - [ ] Conceder `pull-requests: write` **apenas ao job `test`**, não no `permissions` global do workflow
  - [ ] Condicionar o step a `if: github.event_name == 'pull_request'` (em push na `main` não há PR para comentar)

- [ ] **Task 5 — Provar que o gate reprova** (AC: #3)
  - [ ] Criar `src/domain/_prova-cobertura.ts` com uma função exportada **sem teste**
  - [ ] Confirmar localmente que `pnpm test:coverage` falha por threshold, anotando o percentual
  - [ ] Commitar **listando os arquivos explicitamente** (ver *Aprendizados da Story 0.1*), push, confirmar job `test` vermelho no CI
  - [ ] Reverter; registrar link do run e percentual nas Completion Notes

## Dev Notes

### O problema central desta story

`src/` contém apenas `.gitkeep`. **Não há código de produto para cobrir.** Portanto o gate de 80%, no estado atual, passa porque não existe alvo — exatamente o mesmo modo de falha que o SonarCloud exibiu no PR #2 ao aprovar com `0.0% Coverage on New Code`.

Isso **não** é motivo para adiar a story. É motivo para duas coisas:

1. **`coverage.include` é obrigatório.** Sem ele, o provider v8 só contabiliza arquivos que algum teste importou. Um módulo nunca importado ficaria fora da conta, e a cobertura mediria só o que já é testado — sempre alta, sempre inútil. Com `include`, arquivo não testado entra com 0% e puxa a média para baixo, que é o comportamento que faz o gate valer.
2. **A AC #3 exige prova com código real.** Um arquivo temporário com função não coberta demonstra que o threshold morde. Sem isso, a story entrega um número no config e nenhuma garantia.

A AC #4 existe para que o verde de hoje seja lido corretamente: o gate está **armado**, não **exercitado**. Ele passa a valer de fato na Story 1.1, quando o primeiro código de domínio chegar.

### Escopo — o que esta story NÃO faz

| Fora de escopo | Story dona |
|---|---|
| Conectar o SonarCloud, `sonar-project.properties`, job do scanner | **0.7** |
| Trivy, Gitleaks | 0.3 |
| dependency-cruiser | 0.4 |
| commitlint, template de PR | 0.5 |
| Prompt de review por IA | 0.6 |
| Required status checks | 0.7 |

O `lcov.info` é gerado aqui (AC #5) porque é insumo da 0.7 — mas **nenhuma configuração do Sonar entra nesta story**. `SonarSource/sonarqube-scan-action@v8.2.1` é a action que a 0.7 vai usar; anotado aqui só para poupar a pesquisa depois.

### Estado atual do repositório (pós-Story 0.1, merge `3ff1ea7`)

Existe e **não deve ser refeito**:

| Arquivo | Conteúdo relevante |
|---|---|
| `package.json` | `type: module`, `engines.node >=24`, scripts `lint`/`format`/`typecheck`/`test`, pnpm 10.32.1 |
| `vitest.config.ts` | `environment: 'node'`, `include: ['src/**/*.test.ts','tests/**/*.test.ts']`, `passWithNoTests: false` |
| `.github/workflows/ci.yml` | 3 jobs (`lint`, `typecheck`, `test`), `permissions: contents: read`, concurrency com cancel |
| `tsconfig.json` | strict, `nodenext`, `es2024`, `noEmit` |
| `biome.json` | `linter.rules.preset: 'recommended'`, `useIgnoreFile: true` |
| `tests/toolchain.test.ts` | 2 testes (Node ≥24, ES module) |
| `.gitignore` | já contém `coverage/` |

**`vitest.config.ts` é o único arquivo de config que esta story modifica.** O `ci.yml` recebe alterações pontuais no job `test` — não reescrever o arquivo.

### Aprendizados da Story 0.1 (aplicar, não repetir)

- **`git add -A` no commit de prova arrastou o story file** e o `git revert` seguinte apagou o Dev Agent Record junto com as violações. **Nesta story, o commit de prova deve listar os arquivos explicitamente.**
- **Fixar versões que têm peer estrito.** `@vitest/coverage-v8` declara `vitest: 4.1.10` exato. Usar `^4.1.10` pode resolver para uma minor incompatível.
- **Conferir depreciação após configurar.** Na 0.1, `linter.rules.recommended` do Biome passava no lint mesmo deprecado. Ler os avisos, não só o exit code.
- **A ordem das tasks importa.** Na 0.1, a Task 2 exigia validar o `typecheck` antes de existir qualquer `.ts`, o que era impossível (`TS18003`). Aqui, a Task 5 (prova) vem depois de tudo configurado, deliberadamente.
- **Padrão de evidência estabelecido:** commit que introduz violação → CI vermelho → commit de revert. O par fica no histórico do PR.

### Armadilhas conhecidas

- **`coverage.include` vs `test.include`.** São opções distintas. `test.include` diz onde estão os testes; `coverage.include` diz o que deve ser medido. Confundir as duas produz um gate que mede os próprios testes.
- **Threshold global vs por arquivo.** `coverage.thresholds` com números soltos aplica **global**. Um arquivo com 0% pode passar se os outros compensarem. Aceitável no MVP; registrar como limitação conhecida.
- **`permissions` do workflow.** Hoje é `contents: read` global. Elevar para `pull-requests: write` **no job**, não globalmente — o job `lint` não tem motivo para escrever em PR.
- **A action de comentário precisa de `json-summary` E `json`.** Só `lcov` não basta; ela lê o resumo JSON.
- **Em `push` na `main` não há PR.** O step de comentário precisa de `if`, senão falha o job na `main`.
- **`test:coverage` não substitui `test`.** Manter os dois scripts: `test` para iteração local rápida, `test:coverage` para o CI.

### Testing standards

- Nenhum teste novo de produto nesta story — não há produto. O `tests/toolchain.test.ts` continua sendo a suíte.
- O arquivo `_prova-cobertura.ts` da Task 5 é **temporário e revertido**; não deixa resíduo.
- A partir da Story 1.1, todo código em `src/` nasce com teste, sob pena de reprovar este gate.

### Project Structure Notes

Nenhum diretório novo. `coverage/` é gerado e ignorado pelo git.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 0.2] — user story e AC original
- [Source: _bmad-output/planning-artifacts/QUALITY-GATE.md#3] — "Cobertura ≥ 80% (falha o build abaixo disso) `[SUPOSIÇÃO: limite inicial 80%, ajustável]`"
- [Source: _bmad-output/planning-artifacts/QUALITY-GATE.md#1] — pilar 3, Testado
- [Source: ARCHITECTURE-SPINE.md#AD-11] — gateway de CI obrigatório
- [Source: _bmad-output/implementation-artifacts/0-1-toolchain-base-e-pipeline-de-ci.md#Debug Log References] — aprendizados aplicados acima

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
