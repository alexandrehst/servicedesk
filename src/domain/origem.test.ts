import { describe, expect, it } from 'vitest'
import { ORIGENS } from './origem.js'

/**
 * A lista de origens e o vocabulario do AD-9. Ela existe para o Log de
 * auditoria conseguir dizer POR ONDE a acao entrou — e a Story 1.8 fez a
 * revisao do Log depender disso para filtrar.
 */
describe('ORIGENS', () => {
  it('tem o canal de e-mail, distinto de api e de mcp (Story 1.9)', () => {
    expect(ORIGENS).toContain('email')
  })

  it.each(['api', 'mcp', 'email'])('mantem %s como origem conhecida', (origem) => {
    expect(ORIGENS).toContain(origem)
  })

  it('nao tem valor repetido — origem duplicada quebraria o filtro do historico', () => {
    expect(new Set(ORIGENS).size).toBe(ORIGENS.length)
  })
})
