import { beforeEach, describe, expect, it } from 'vitest'
import type { AcaoIrreversivel } from '../../domain/acoes-irreversiveis.js'
import { ehDomainError } from '../../domain/errors.js'
import type { Status, Ticket } from '../../domain/ticket.js'
import { embrulharBruto } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import { acaoIrreversivel } from './acao-irreversivel.js'

/**
 * O AD-7 do lado do caso de uso (Story 2.6).
 *
 * O que se prova aqui: a ORDEM das checagens e o que NAO acontece quando cada
 * uma delas recusa. O escopo do token — outra acao, outro Chamado, outra
 * identidade, expirado, ja usado — e do BANCO, e esta em
 * `adapters/persistence/acao-irreversivel.test.ts`: com duble, "o token nao
 * serve" seria apenas o que o duble foi programado para dizer.
 */

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
/** Solicitante que NAO e dono deste Chamado — para ele, ele nem existe (1.4). */
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

const chamado = (status: Status, extra: Partial<Ticket> = {}): Ticket => ({
  number: 1000,
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
  status,
  prioridade: 'media',
  requester: 'marina@empresa.com',
  assignee: null,
  criadoEm: new Date('2026-08-18T09:00:00.000Z'),
  excluidoEm: null,
  version: 3,
  ...extra,
})

let existente: Ticket | null
let executadas: {
  numero: number
  acao: AcaoIrreversivel
  de: Status
  para: Status
  esperada: number
  motivo?: string
}[]
let resultadoDoUpdate: { version: number } | null
let emitidas: { ticketNumber: number; acao: AcaoIrreversivel; autor: string }[]
let consumos: { token: string; acao: AcaoIrreversivel; identity: string }[]
let confirmacaoVale: boolean

const repositorio = {
  async buscarPorNumero() {
    return existente === null ? null : embrulharBruto({ ticket: existente, comentarios: [] })
  },
  async executarAcaoIrreversivelComAuditoria(entrada: {
    numero: number
    acao: AcaoIrreversivel
    de: Status
    para: Status
    esperada: number
    autor: Principal
    motivo?: string
  }) {
    const { autor: _autor, ...resto } = entrada
    executadas.push(resto)
    return resultadoDoUpdate
  },
}

const confirmacao = {
  async emitir(pedido: { ticketNumber: number; acao: AcaoIrreversivel; autor: Principal }) {
    emitidas.push({
      ticketNumber: pedido.ticketNumber,
      acao: pedido.acao,
      autor: pedido.autor.identity,
    })
    return 'token-emitido'
  },
  async consumir(
    token: string,
    escopo: { ticketNumber: number; acao: AcaoIrreversivel; identity: string },
  ) {
    consumos.push({ token, acao: escopo.acao, identity: escopo.identity })
    return confirmacaoVale
  },
}

const executar = acaoIrreversivel({ repositorio, confirmacao })

const erroDe = async (promessa: Promise<unknown>): Promise<Error> => {
  try {
    await promessa
  } catch (erro) {
    if (ehDomainError(erro)) return erro
    throw erro
  }
  throw new Error('Esperava erro de dominio, mas a operacao passou.')
}

beforeEach(() => {
  existente = chamado('resolvido')
  executadas = []
  emitidas = []
  consumos = []
  resultadoDoUpdate = { version: 4 }
  confirmacaoVale = true
})

describe('sem confirmacao, nada muda (AC #1)', () => {
  /**
   * O teste que o AD-7 existe para exigir. Se ele passar com a checagem de
   * confirmacao removida, o guardrail nao existe.
   */
  it('a primeira chamada devolve ConfirmationRequired e NAO executa', async () => {
    const erro = await erroDe(executar('fechar_chamado')({ numero: 1000, versao: 3 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('ConfirmationRequired')
    expect(executadas).toHaveLength(0)
  })

  it('a mensagem traz o token a usar, e diz que e irreversivel', async () => {
    const erro = await erroDe(executar('fechar_chamado')({ numero: 1000, versao: 3 }, bruno))

    expect(erro.message).toContain('token-emitido')
    expect(erro.message).toContain('IRREVERSIVEL')
  })

  it('a confirmacao e emitida para aquele Chamado, aquela acao e quem pediu', async () => {
    existente = chamado('em_andamento')

    await erroDe(executar('cancelar_chamado')({ numero: 1000, versao: 3 }, bruno))

    expect(emitidas).toEqual([
      { ticketNumber: 1000, acao: 'cancelar_chamado', autor: 'bruno@empresa.com' },
    ])
  })
})

describe('com confirmacao valida, executa (AC #2)', () => {
  it.each([
    ['fechar_chamado', 'resolvido', 'fechado'],
    ['cancelar_chamado', 'aberto', 'cancelado'],
    ['cancelar_chamado', 'em_andamento', 'cancelado'],
    ['reabrir_chamado', 'fechado', 'em_andamento'],
    ['reabrir_chamado', 'cancelado', 'em_andamento'],
  ] as const)('%s leva de %s para %s', async (acao, de, para) => {
    existente = chamado(de)

    const saida = await executar(acao)(
      { numero: 1000, versao: 3, confirmacao: 'token-emitido', motivo: 'O problema voltou.' },
      bruno,
    )

    expect(saida).toEqual({ numero: 1000, de, para, versao: 4 })
    expect(executadas[0]?.acao).toBe(acao)
  })

  it('a versao esperada vem da ENTRADA, nao do Chamado lido', async () => {
    await executar('fechar_chamado')(
      { numero: 1000, versao: 2, confirmacao: 'token-emitido' },
      bruno,
    )

    expect(executadas[0]?.esperada).toBe(2)
  })

  it('o motivo da reabertura chega ao repositorio', async () => {
    existente = chamado('fechado')

    await executar('reabrir_chamado')(
      { numero: 1000, versao: 3, confirmacao: 'token-emitido', motivo: 'O problema voltou.' },
      bruno,
    )

    expect(executadas[0]?.motivo).toBe('O problema voltou.')
  })

  /** Fechar e cancelar nao tem motivo a gravar; `undefined`, nao string vazia. */
  it('fechar nao inventa motivo', async () => {
    await executar('fechar_chamado')(
      { numero: 1000, versao: 3, confirmacao: 'token-emitido' },
      bruno,
    )

    expect(executadas[0]?.motivo).toBeUndefined()
  })
})

describe('confirmacao que nao serve (AC #3)', () => {
  it('recebe a MESMA resposta de quem nao mandou nada, e nada executa', async () => {
    confirmacaoVale = false

    const erro = await erroDe(
      executar('fechar_chamado')({ numero: 1000, versao: 3, confirmacao: 'qualquer' }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('ConfirmationRequired')
    expect(executadas).toHaveLength(0)
  })

  /**
   * A mensagem da recusa NAO traz token novo: emitir um a cada tentativa
   * invalida transformaria a sondagem em fonte infinita de confirmacoes.
   */
  it('a recusa nao emite confirmacao nova', async () => {
    confirmacaoVale = false

    const erro = await erroDe(
      executar('fechar_chamado')({ numero: 1000, versao: 3, confirmacao: 'qualquer' }, bruno),
    )

    expect(emitidas).toHaveLength(0)
    expect(erro.message).not.toContain('token-emitido')
  })

  it('o escopo do consumo carrega acao e identidade', async () => {
    await executar('fechar_chamado')({ numero: 1000, versao: 3, confirmacao: 'tk' }, bruno)

    expect(consumos).toEqual([
      { token: 'tk', acao: 'fechar_chamado', identity: 'bruno@empresa.com' },
    ])
  })
})

describe('quem nao pode nao recebe cracha (AC #4)', () => {
  it('quem nao ve o Chamado recebe TicketNaoEncontrado, sem emitir nada', async () => {
    const alheio = await erroDe(executar('fechar_chamado')({ numero: 1000, versao: 3 }, carlos))

    existente = null
    const inexistente = await erroDe(executar('fechar_chamado')({ numero: 1000, versao: 3 }, bruno))

    for (const erro of [alheio, inexistente]) {
      expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
    }
    expect(emitidas).toHaveLength(0)
  })

  /**
   * O Solicitante DONO do Chamado ve, mas nao encerra. Emitir confirmacao para
   * ele vazaria duas coisas: que o Chamado esta naquele estado, e que a acao
   * seria valida.
   */
  it('o Solicitante dono recebe SemPermissao, e nenhuma confirmacao e emitida', async () => {
    existente = chamado('resolvido', { requester: 'marina@empresa.com' })

    const erro = await erroDe(executar('fechar_chamado')({ numero: 1000, versao: 3 }, marina))

    expect(ehDomainError(erro) && erro.code).toBe('SemPermissao')
    expect(emitidas).toHaveLength(0)
    expect(executadas).toHaveLength(0)
  })

  /**
   * Fechar um Chamado `aberto` nao e irreversivel — e invalido. Emitir
   * confirmacao aqui ensinaria a maquina de estados a quem esta sondando.
   */
  it.each([
    ['fechar_chamado', 'aberto'],
    ['fechar_chamado', 'em_andamento'],
    ['reabrir_chamado', 'resolvido'],
    ['cancelar_chamado', 'fechado'],
  ] as const)('%s num Chamado %s e TransicaoInvalida, sem emitir', async (acao, status) => {
    existente = chamado(status)

    const erro = await erroDe(
      executar(acao)({ numero: 1000, versao: 3, motivo: 'qualquer' }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('TransicaoInvalida')
    expect(emitidas).toHaveLength(0)
  })
})

describe('reabrir exige motivo (AC #2)', () => {
  it.each([undefined, '   '])('motivo %j e recusado, sem emitir confirmacao', async (motivo) => {
    existente = chamado('fechado')

    const erro = await erroDe(
      executar('reabrir_chamado')(
        motivo === undefined ? { numero: 1000, versao: 3 } : { numero: 1000, versao: 3, motivo },
        bruno,
      ),
    )

    expect(ehDomainError(erro) && erro.code).toBe('MotivoObrigatorio')
    expect(emitidas).toHaveLength(0)
    expect(executadas).toHaveLength(0)
  })

  /**
   * A ordem importa: o motivo e checado ANTES de emitir confirmacao. Emitir
   * primeiro gastaria um token que a chamada seguinte nao poderia usar, porque
   * ela reprovaria de novo no motivo.
   */
  it('fechar nao pede motivo', async () => {
    const erro = await erroDe(executar('fechar_chamado')({ numero: 1000, versao: 3 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('ConfirmationRequired')
  })
})

describe('quando o UPDATE nao casa', () => {
  it('versao divergente vira Conflict — e a confirmacao ja foi consumida', async () => {
    resultadoDoUpdate = null
    existente = chamado('resolvido')

    const erro = await erroDe(
      executar('fechar_chamado')({ numero: 1000, versao: 3, confirmacao: 'token-emitido' }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('Conflict')
    // Consumir antes do UPDATE e deliberado: o humano confirmou "fechar na
    // versao 3", e a versao mudou. O aval nao vale para o Chamado novo.
    expect(consumos).toHaveLength(1)
  })
})
