import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Sem arquivos de teste o run deve falhar, nunca passar em silencio.
    passWithNoTests: false,

    // Os testes de integracao dividem UM Postgres e truncam tabelas no
    // beforeEach. Rodando em paralelo, um arquivo limpa a base do outro no meio
    // da execucao — falha intermitente, o pior tipo. A Story 1.2 contornou
    // juntando tudo num arquivo so, o que para de escalar assim que dois
    // assuntos diferentes precisam das mesmas tabelas (foi o caso na 1.4).
    // A suite inteira leva ~1s; serializar por arquivo custa pouco e elimina
    // uma classe inteira de flakiness.
    fileParallelism: false,

    coverage: {
      provider: 'v8',

      // CRITICO: sem `include`, o provider v8 so contabiliza arquivos que
      // algum teste importou — um modulo nunca importado ficaria fora da
      // media e o gate mediria apenas o que ja e testado. Com `include`,
      // arquivo sem teste entra com 0% e puxa a media para baixo.
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts'],

      // ATENCAO: dentro de `coverage` a chave e `reporter` (SINGULAR).
      // `reporters` (plural) e a opcao de reporters de teste; usada aqui ela
      // e descartada sem aviso e o Vitest cai no default (text/html/clover/json),
      // sem gerar lcov nem json-summary. Falha silenciosa — ver Debug Log.
      //
      // `lcov` alimenta o scanner do SonarCloud (Story 0.7).
      // `json-summary` + `json` alimentam o comentario de cobertura no PR.
      reporter: ['text', 'lcov', 'json-summary', 'json'],
      reportsDirectory: './coverage',

      // Limite inicial 80% (QUALITY-GATE secao 3). Global, nao por arquivo:
      // um arquivo com 0% pode passar se os outros compensarem. Limitacao
      // conhecida, aceita no MVP.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
