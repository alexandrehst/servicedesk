import { describe, expect, it } from 'vitest'
import { ehDomainError } from './errors.js'
import { ehStatusEmAberto, STATUS, STATUS_ENCERRADOS } from './ticket.js'
import { TRANSICOES } from './transicoes.js'
import { embrulharBruto, type QuemPergunta, resumoVisivelPara } from './visibilidade.js'

/**
 * O resumo da Fila (Story 3.3, FR-10).
 *
 * Duas coisas se provam aqui: o que conta como CARGA, e a verificacao que
 * substitui a segunda camada do AD-8 — porque um resumo nao tem itens para
 * `filaVisivelPara` filtrar.
 */

const bruno: QuemPergunta = { identity: 'bruno@empresa.com', role: 'agente' }
const marina: QuemPergunta = { identity: 'marina@empresa.com', role: 'solicitante' }

const contadores = {
  porStatus: { aberto: 3, em_andamento: 1, resolvido: 0, fechado: 0, cancelado: 0 },
  porCategoria: { hardware: 4, software: 0, rede: 0, acesso: 0, nao_classificado: 0 },
  porDono: { 'bruno@empresa.com': 1 },
  semDono: 3,
}

describe('o que conta como carga (AC #3)', () => {
  it('fechado e cancelado sao os encerrados', () => {
    expect(STATUS_ENCERRADOS).toEqual(['fechado', 'cancelado'])
  })

  it.each(['aberto', 'em_andamento', 'resolvido'] as const)('%s esta em aberto', (status) => {
    expect(ehStatusEmAberto(status)).toBe(true)
  })

  it.each(['fechado', 'cancelado'] as const)('%s nao esta em aberto', (status) => {
    expect(ehStatusEmAberto(status)).toBe(false)
  })

  /**
   * A lista e DECLARADA, nao derivada — mas precisa concordar com a maquina de
   * estados. Encerrado e exatamente quem nao tem transicao COMUM de saida: so
   * se sai dele reabrindo, e reabrir exige confirmacao (2.6).
   *
   * Se alguem acrescentar um Status terminal e esquecer o resumo, este teste
   * reprova — que e o unico jeito de as duas listas nao divergirem em silencio.
   */
  it('encerrado e exatamente quem nao tem transicao comum de saida', () => {
    const semSaida = STATUS.filter((s) => TRANSICOES[s].length === 0)

    expect([...STATUS_ENCERRADOS].sort()).toEqual([...semSaida].sort())
  })
})

describe('a verificacao que substitui a segunda camada (AC #2)', () => {
  /**
   * Nas 3.1 e 3.2 o dominio reaplicava `podeVerTicket` sobre os itens. Um
   * resumo NAO tem itens: se o `WHERE` estiver errado, os numeros saem errados
   * e nada os corrige. E o erro e mudo — `{ aberto: 47 }` parece certo tanto
   * para quem tem 47 quanto para quem deveria ver 3.
   *
   * O que o dominio pode conferir nao sao os dados: e a PERGUNTA que os
   * produziu.
   */
  it('aceita quando o escopo usado e o de quem pergunta', () => {
    const bruto = embrulharBruto({ escopo: { tipo: 'todos' as const }, contadores })

    expect(resumoVisivelPara(bruno, bruto).contadores).toEqual(contadores)
  })

  it('aceita o escopo restrito do proprio Solicitante', () => {
    const bruto = embrulharBruto({
      escopo: { tipo: 'apenasDe' as const, requester: 'marina@empresa.com' },
      contadores,
    })

    expect(resumoVisivelPara(marina, bruto).contadores).toEqual(contadores)
  })

  /** O caso que motiva tudo: numeros da base inteira devolvidos a quem so pode ver os seus. */
  it('RECUSA resumo montado com escopo mais amplo que o da pessoa', () => {
    const bruto = embrulharBruto({ escopo: { tipo: 'todos' as const }, contadores })

    let capturado: unknown
    try {
      resumoVisivelPara(marina, bruto)
    } catch (erro) {
      capturado = erro
    }

    expect(ehDomainError(capturado) && capturado.code).toBe('EscopoDivergente')
  })

  it('RECUSA resumo montado para outra identidade', () => {
    const bruto = embrulharBruto({
      escopo: { tipo: 'apenasDe' as const, requester: 'carlos@empresa.com' },
      contadores,
    })

    let capturado: unknown
    try {
      resumoVisivelPara(marina, bruto)
    } catch (erro) {
      capturado = erro
    }

    expect(ehDomainError(capturado) && capturado.code).toBe('EscopoDivergente')
  })

  /** Escopo restrito devolvido a um Agente tambem diverge — menos dado do que ele pediu. */
  it('RECUSA escopo restrito quando quem pergunta ve tudo', () => {
    const bruto = embrulharBruto({
      escopo: { tipo: 'apenasDe' as const, requester: 'bruno@empresa.com' },
      contadores,
    })

    let capturado: unknown
    try {
      resumoVisivelPara(bruno, bruto)
    } catch (erro) {
      capturado = erro
    }

    expect(ehDomainError(capturado) && capturado.code).toBe('EscopoDivergente')
  })
})
