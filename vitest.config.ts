import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Sem arquivos de teste o run deve falhar, nunca passar em silencio.
    passWithNoTests: false,
  },
})
