import { describe, expect, it } from 'vitest'
import {
  autenticarComLinkInputSchema,
  sessaoCriadaOutputSchema,
  solicitarLinkInputSchema,
  solicitarLinkOutputSchema,
} from './autenticacao.js'

/**
 * Os contratos sao a fonte unica (AD-6): o adapter HTTP do login vai derivar
 * daqui, e o que estes testes travam e o shape — o dia em que alguem afrouxar
 * uma validacao ou acrescentar um campo perigoso, um teste reprova.
 */

describe('solicitarLinkInputSchema', () => {
  it('aceita e-mail valido', () => {
    expect(solicitarLinkInputSchema.parse({ email: 'ana@empresa.com' })).toEqual({
      email: 'ana@empresa.com',
    })
  })

  it.each(['sem-arroba', '', 'ana@', '@empresa.com'])('recusa %j', (email) => {
    expect(solicitarLinkInputSchema.safeParse({ email }).success).toBe(false)
  })
})

describe('solicitarLinkOutputSchema', () => {
  it('nao tem campo que revele se o e-mail existe', () => {
    const campos = Object.keys(solicitarLinkOutputSchema.shape)

    // Um `encontrado: boolean` aqui destruiria o AC #3 sem que nenhum outro
    // teste percebesse.
    expect(campos).toEqual(['mensagem'])
  })
})

describe('autenticarComLinkInputSchema', () => {
  it('aceita token nao vazio', () => {
    expect(autenticarComLinkInputSchema.parse({ token: 'abc' })).toEqual({ token: 'abc' })
  })

  it('recusa token vazio', () => {
    expect(autenticarComLinkInputSchema.safeParse({ token: '' }).success).toBe(false)
  })

  it('nao aceita papel vindo do cliente', () => {
    const saida = autenticarComLinkInputSchema.parse({ token: 'abc', role: 'agente' })

    // Escalada de papel barrada pelo contrato: o campo extra e descartado, e
    // o papel so pode sair do cadastro.
    expect(saida).not.toHaveProperty('role')
  })
})

describe('sessaoCriadaOutputSchema', () => {
  const valida = {
    tokenDeSessao: 'token',
    identity: 'ana@empresa.com',
    role: 'agente',
    expiraEm: '2026-08-10T20:00:00.000Z',
  }

  it('aceita a saida da troca', () => {
    expect(sessaoCriadaOutputSchema.parse(valida)).toEqual(valida)
  })

  it('recusa papel fora dos dois do MVP', () => {
    expect(sessaoCriadaOutputSchema.safeParse({ ...valida, role: 'admin' }).success).toBe(false)
  })

  it('exige data ISO 8601', () => {
    expect(sessaoCriadaOutputSchema.safeParse({ ...valida, expiraEm: '10/08/2026' }).success).toBe(
      false,
    )
  })
})
