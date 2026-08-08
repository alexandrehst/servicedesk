import { describe, expect, it } from 'vitest'

/**
 * A spine fixa Node 24 como runtime (ARCHITECTURE-SPINE.md#Stack).
 * Este teste falha se o CI ou a maquina local resolverem outra major,
 * que e o modo de falha silencioso mais provavel: o job roda, tudo passa,
 * e o codigo foi checado contra um runtime diferente do de producao.
 */
describe('toolchain', () => {
  it('roda em Node 24 ou superior', () => {
    const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)

    expect(Number.isNaN(major)).toBe(false)
    expect(major).toBeGreaterThanOrEqual(24)
  })

  it('executa como ES module', () => {
    expect(typeof import.meta.url).toBe('string')
  })
})
