import { describe, expect, it } from 'vitest'
import { ehDomainError } from './errors.js'
import { LIMIAR_DE_SEMELHANCA, textoParaSugestao } from './semelhanca.js'

/**
 * O limiar de semelhanca (Story 3.5, FR-12).
 *
 * Numero pequeno, decisao grande: e ele que separa "ja abrimos isso" de ruido
 * que ensina a IA a ignorar a sugestao.
 */

const erroDe = (fn: () => unknown): Error => {
  try {
    fn()
  } catch (erro) {
    if (ehDomainError(erro)) return erro
    throw erro
  }
  throw new Error('Esperava erro de dominio, mas a chamada passou.')
}

describe('o limiar', () => {
  /**
   * 0.3 e tambem o padrao do `pg_trgm`, e a coincidencia e deliberada: o
   * operador `%` filtra pelo threshold da SESSAO, e manter os dois iguais evita
   * que o resultado dependa do estado da conexao que o pool entregar.
   */
  it('e 0.3, o mesmo padrao do pg_trgm', () => {
    expect(LIMIAR_DE_SEMELHANCA).toBe(0.3)
  })

  it('esta entre 0 e 1', () => {
    expect(LIMIAR_DE_SEMELHANCA).toBeGreaterThan(0)
    expect(LIMIAR_DE_SEMELHANCA).toBeLessThan(1)
  })
})

describe('o texto da sugestao', () => {
  it('perde espaco em volta', () => {
    expect(textoParaSugestao('  VPN nao conecta  ')).toBe('VPN nao conecta')
  })

  /**
   * Texto vazio compararia contra nada e devolveria o que o banco achasse
   * primeiro — uma sugestao arbitraria e apresentada como "parecida".
   */
  it.each(['', '   ', '\n'])('recusa %j', (texto) => {
    const erro = erroDe(() => textoParaSugestao(texto))

    expect(ehDomainError(erro) && erro.code).toBe('TermoObrigatorio')
  })

  /**
   * Texto muito curto nao tem trigramas suficientes para "parecer" com nada de
   * forma util: "vpn" tem um trigrama so, e casaria com qualquer titulo que o
   * contenha, sem semelhanca real.
   */
  it('recusa texto curto demais para ter semelhanca', () => {
    const erro = erroDe(() => textoParaSugestao('ab'))

    expect(ehDomainError(erro) && erro.code).toBe('TermoObrigatorio')
  })

  it('aceita a partir de tres caracteres, que e o tamanho de um trigrama', () => {
    expect(textoParaSugestao('vpn')).toBe('vpn')
  })
})
