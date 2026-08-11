import { describe, expect, it } from 'vitest'
import { STATUS, type Status } from './ticket.js'
import {
  exigeConfirmacao,
  TRANSICOES,
  TRANSICOES_COM_CONFIRMACAO,
  transicaoValida,
} from './transicoes.js'

/**
 * A maquina de estados do AD-5, definida UMA vez no dominio. Os dois adapters
 * chamam a mesma funcao, entao nao ha como o MCP permitir o que a API proibe.
 *
 * A separacao em duas tabelas e a decisao central desta story: as transicoes
 * IRREVERSIVEIS (fechar, cancelar, reabrir) exigem confirmacao explicita e tem
 * acoes dedicadas na Story 2.6. Se `mudar_status` as aceitasse, existiria uma
 * porta dos fundos para a IA encerrar Chamado sem human-in-the-loop.
 */

describe('transicoes comuns (via mudar_status)', () => {
  it.each([
    ['aberto', 'em_andamento'],
    ['em_andamento', 'resolvido'],
    ['em_andamento', 'aberto'],
    ['resolvido', 'em_andamento'],
  ] as const)('%s -> %s e valida', (de, para) => {
    expect(transicaoValida(de, para)).toBe(true)
  })

  /**
   * Devolver um Chamado a fila nao e destrutivo: acontece quando o Agente
   * percebe que nao e com ele. Nao confundir com REABRIR, que traz de volta
   * algo ja encerrado — essa e a 2.6.
   */
  it('em_andamento -> aberto e comum, nao e reabertura', () => {
    expect(transicaoValida('em_andamento', 'aberto')).toBe(true)
    expect(exigeConfirmacao('em_andamento', 'aberto')).toBe(false)
  })
})

describe('a porta dos fundos que nao pode existir (AC #5)', () => {
  it.each([
    ['aberto', 'cancelado'],
    ['em_andamento', 'cancelado'],
    ['resolvido', 'fechado'],
    ['fechado', 'em_andamento'],
    ['cancelado', 'em_andamento'],
  ] as const)('%s -> %s NAO passa por mudar_status', (de, para) => {
    expect(transicaoValida(de, para)).toBe(false)
  })

  it.each([
    ['aberto', 'cancelado'],
    ['resolvido', 'fechado'],
    ['fechado', 'em_andamento'],
  ] as const)('%s -> %s exige confirmacao (Story 2.6)', (de, para) => {
    expect(exigeConfirmacao(de, para)).toBe(true)
  })

  /**
   * As duas tabelas nao podem se sobrepor: uma transicao que estivesse nas
   * duas seria executavel pelos dois caminhos, e o guardrail da 2.6 viraria
   * decoracao.
   */
  it('nenhuma transicao esta nas duas tabelas', () => {
    for (const de of STATUS) {
      const comuns = TRANSICOES[de]
      const comConfirmacao = TRANSICOES_COM_CONFIRMACAO[de]

      for (const para of comConfirmacao) {
        expect(comuns).not.toContain(para)
      }
    }
  })
})

describe('transicoes invalidas', () => {
  it.each([
    ['aberto', 'resolvido'],
    ['aberto', 'fechado'],
    ['resolvido', 'cancelado'],
    ['fechado', 'cancelado'],
    ['cancelado', 'fechado'],
  ] as const)('%s -> %s nao existe em tabela nenhuma', (de, para) => {
    expect(transicaoValida(de, para)).toBe(false)
    expect(exigeConfirmacao(de, para)).toBe(false)
  })

  /**
   * Auto-transicao nao existe, e a garantia esta nos DADOS: nenhuma tabela
   * lista o proprio estado como destino. Foi assim que ficou depois da
   * verificacao por mutacao — uma guarda `de !== para` no codigo sobrevivia a
   * ser removida, porque a tabela ja a tornava inalcancavel.
   *
   * Este teste reprova se alguem escrever `aberto: ['aberto', ...]`.
   */
  it.each(STATUS)('%s nao aparece como destino de si mesmo', (status: Status) => {
    expect(TRANSICOES[status]).not.toContain(status)
    expect(TRANSICOES_COM_CONFIRMACAO[status]).not.toContain(status)
  })

  it.each(STATUS)('%s -> ele mesmo e recusado', (status: Status) => {
    expect(transicaoValida(status, status)).toBe(false)
    expect(exigeConfirmacao(status, status)).toBe(false)
  })
})

describe('a tabela cobre todos os Status declarados', () => {
  // Exaustivo sobre STATUS, e nao sobre uma lista escrita a mao: Status novo
  // sem decisao de transicao reprova aqui, em vez de virar um `[]` silencioso.
  it.each(STATUS)('%s tem entrada nas duas tabelas', (status: Status) => {
    expect(TRANSICOES[status]).toBeDefined()
    expect(TRANSICOES_COM_CONFIRMACAO[status]).toBeDefined()
  })

  it('todo destino declarado e um Status conhecido', () => {
    for (const de of STATUS) {
      for (const para of [...TRANSICOES[de], ...TRANSICOES_COM_CONFIRMACAO[de]]) {
        expect(STATUS).toContain(para)
      }
    }
  })

  /**
   * `fechado` e `cancelado` sao terminais para o fluxo comum: so se sai deles
   * reabrindo, e reabrir exige confirmacao.
   */
  it.each(['fechado', 'cancelado'] as const)('%s nao tem saida comum', (status) => {
    expect(TRANSICOES[status]).toEqual([])
  })
})
