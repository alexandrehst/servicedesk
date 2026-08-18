import { describe, expect, it } from 'vitest'
import { duracaoLegivel } from './duracao.js'

/**
 * O "tempo total" que o e-mail de resolucao anuncia (Story 2.5, FR-18).
 *
 * Funcao pura no dominio, e nao no adapter de e-mail, porque a frase precisa
 * ser a MESMA em todo ponto de entrada: se o adapter a montasse, a UI da Fase
 * 1.5 escreveria a sua e o mesmo Chamado teria dois "tempo total" diferentes.
 */

const de = new Date('2026-08-18T09:00:00Z')
const depois = (ms: number): Date => new Date(de.getTime() + ms)

const SEGUNDO = 1000
const MINUTO = 60 * SEGUNDO
const HORA = 60 * MINUTO
const DIA = 24 * HORA

describe('duracaoLegivel', () => {
  it.each([
    [30 * SEGUNDO, 'menos de um minuto'],
    [MINUTO, '1 minuto'],
    [12 * MINUTO, '12 minutos'],
    [59 * MINUTO + 59 * SEGUNDO, '59 minutos'],
    [HORA, '1 hora'],
    [3 * HORA, '3 horas'],
    [23 * HORA + 59 * MINUTO, '23 horas'],
    [DIA, '1 dia'],
    [2 * DIA + 3 * HORA, '2 dias'],
  ])('%i ms vira "%s"', (ms, esperado) => {
    expect(duracaoLegivel(de, depois(ms))).toBe(esperado)
  })

  /**
   * Granularidade UNICA e arredondada para BAIXO. "2 dias, 3 horas e 14
   * minutos" e precisao que ninguem usa num e-mail — e arredondar para cima
   * anunciaria um dia que nao passou.
   */
  it('arredonda para baixo, nao para cima', () => {
    expect(duracaoLegivel(de, depois(DIA + 23 * HORA))).toBe('1 dia')
    expect(duracaoLegivel(de, depois(HORA + 59 * MINUTO))).toBe('1 hora')
  })

  /**
   * O caso degenerado tem duas causas reais — relogio da maquina andando para
   * tras e Chamado criado no mesmo instante em que foi resolvido (teste, seed).
   * Nenhuma delas pode virar "-1 minutos" no corpo do e-mail.
   */
  it.each([
    [0, 'mesmo instante'],
    [-MINUTO, 'relogio para tras'],
    [-5 * DIA, 'muito para tras'],
  ])('%i ms (%s) vira "menos de um minuto"', (ms) => {
    expect(duracaoLegivel(de, depois(ms))).toBe('menos de um minuto')
  })
})
