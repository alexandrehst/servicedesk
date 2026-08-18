import { describe, expect, it } from 'vitest'
import type { Status } from './ticket.js'
import {
  embrulharBruto,
  escopoDeLeitura,
  filaVisivelPara,
  type ItemDaFilaBruto,
  type QuemPergunta,
} from './visibilidade.js'

/**
 * A autorizacao de LISTA (Story 3.1, AD-8).
 *
 * Duas camadas, e este arquivo prova as duas em memoria:
 *
 * 1. `escopoDeLeitura` — a decisao, ANTES de ler. Vira dado que o adapter
 *    traduz para `WHERE`.
 * 2. `filaVisivelPara` — o gargalo, DEPOIS de ler. Se o `WHERE` errar, aqui
 *    nada passa.
 */

const bruno: QuemPergunta = { identity: 'bruno@empresa.com', role: 'agente' }
const marina: QuemPergunta = { identity: 'marina@empresa.com', role: 'solicitante' }

const item = (
  number: number,
  requester: string,
  extra: Partial<ItemDaFilaBruto> = {},
): ItemDaFilaBruto => ({
  number,
  titulo: `Chamado ${number}`,
  status: 'aberto' as Status,
  prioridade: 'media',
  requester,
  assignee: null,
  criadoEm: new Date('2026-08-18T09:00:00.000Z'),
  excluidoEm: null,
  ...extra,
})

describe('escopoDeLeitura (a decisao, antes de ler)', () => {
  /**
   * Quem ve a Fila inteira e quem ja ve Chamado de terceiro (1.4). Uma
   * capacidade `veFila` daria duas fontes para a mesma pergunta.
   */
  it('o Agente alcanca todos', () => {
    expect(escopoDeLeitura(bruno)).toEqual({ tipo: 'todos' })
  })

  it('o Solicitante alcanca apenas os proprios', () => {
    expect(escopoDeLeitura(marina)).toEqual({
      tipo: 'apenasDe',
      requester: 'marina@empresa.com',
    })
  })

  /**
   * O escopo e DADO, nao consulta: e isso que permite o adapter traduzi-lo
   * para `WHERE` sem tomar decisao nenhuma.
   */
  it('o escopo do Solicitante carrega a identidade dele, nao um booleano', () => {
    const escopo = escopoDeLeitura(marina)

    expect(escopo.tipo === 'apenasDe' && escopo.requester).toBe('marina@empresa.com')
  })
})

describe('filaVisivelPara (o gargalo, depois de ler)', () => {
  /**
   * O teste central da story: mesmo que o repositorio devolva linha alheia —
   * `WHERE` errado, filtro esquecido, adapter novo — o dominio descarta.
   */
  it('descarta Chamado alheio que o repositorio devolveu por engano', () => {
    const bruta = embrulharBruto({
      itens: [item(1000, 'marina@empresa.com'), item(1001, 'carlos@empresa.com')],
      temMais: false,
    })

    const visivel = filaVisivelPara(marina, bruta)

    expect(visivel.itens.map((i) => i.number)).toEqual([1000])
  })

  it('descarta Chamado excluido, para todo mundo', () => {
    const bruta = embrulharBruto({
      itens: [
        item(1000, 'marina@empresa.com'),
        item(1001, 'carlos@empresa.com', { excluidoEm: new Date() }),
      ],
      temMais: false,
    })

    expect(filaVisivelPara(bruno, bruta).itens.map((i) => i.number)).toEqual([1000])
  })

  it('o Agente ve Chamado de qualquer Solicitante', () => {
    const bruta = embrulharBruto({
      itens: [item(1000, 'marina@empresa.com'), item(1001, 'carlos@empresa.com')],
      temMais: false,
    })

    expect(filaVisivelPara(bruno, bruta).itens).toHaveLength(2)
  })

  /** `temMais` atravessa: e informacao de paginacao, nao de visibilidade. */
  it('preserva o sinal de que ha mais paginas', () => {
    const bruta = embrulharBruto({ itens: [item(1000, 'marina@empresa.com')], temMais: true })

    expect(filaVisivelPara(marina, bruta).temMais).toBe(true)
  })

  /**
   * A ORDEM em que o banco devolveu e preservada: ordenar e do SQL, e refazer
   * a ordenacao aqui criaria a mesma regra em dois lugares.
   */
  it('nao reordena o que veio do banco', () => {
    const bruta = embrulharBruto({
      itens: [item(1005, 'marina@empresa.com'), item(1000, 'marina@empresa.com')],
      temMais: false,
    })

    expect(filaVisivelPara(marina, bruta).itens.map((i) => i.number)).toEqual([1005, 1000])
  })
})
