import { beforeEach, describe, expect, it } from 'vitest'
import { ehDomainError } from '../../domain/errors.js'
import type { Prioridade, Ticket } from '../../domain/ticket.js'
import { embrulharBruto } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { mudarPrioridade } from './mudar-prioridade.js'

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

const chamado = (extra: Partial<Ticket> = {}): Ticket => ({
  number: 1000,
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
  prioridade: 'media',
  status: 'aberto',
  requester: 'marina@empresa.com',
  assignee: null,
  criadoEm: new Date('2026-08-11T12:00:00.000Z'),
  excluidoEm: null,
  version: 3,
  ...extra,
})

let mudancas: { de: Prioridade; para: Prioridade; esperada: number }[]
let existente: Ticket | null
let resultadoDoUpdate: { version: number } | null

const repositorio: Pick<TicketRepository, 'buscarPorNumero' | 'mudarPrioridadeComAuditoria'> = {
  async buscarPorNumero() {
    return existente === null ? null : embrulharBruto({ ticket: existente, comentarios: [] })
  },
  async mudarPrioridadeComAuditoria({ de, para, esperada }) {
    mudancas.push({ de, para, esperada })
    return resultadoDoUpdate
  },
}

const mudar = mudarPrioridade({ repositorio })

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
  mudancas = []
  existente = chamado()
  resultadoDoUpdate = { version: 4 }
})

describe('quem nao ve o Chamado', () => {
  it('alheio, excluido e inexistente sao indistinguiveis', async () => {
    const alheio = await erroDe(mudar({ numero: 1000, prioridade: 'alta', versao: 3 }, carlos))

    existente = chamado({ excluidoEm: new Date() })
    const excluido = await erroDe(mudar({ numero: 1000, prioridade: 'alta', versao: 3 }, bruno))

    existente = null
    const inexistente = await erroDe(mudar({ numero: 1000, prioridade: 'alta', versao: 3 }, bruno))

    for (const erro of [alheio, excluido, inexistente]) {
      expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
    }
    expect(mudancas).toHaveLength(0)
  })
})

describe('quem ve mas nao pode mudar (AC #3)', () => {
  it('o Solicitante nao muda a Prioridade do proprio Chamado', async () => {
    const erro = await erroDe(mudar({ numero: 1000, prioridade: 'critica', versao: 3 }, marina))

    expect(ehDomainError(erro) && erro.code).toBe('SemPermissao')
    expect(mudancas).toHaveLength(0)
  })

  /**
   * A ordem: autorizacao ANTES de comparar valores. Se fosse ao contrario, o
   * Solicitante pedindo a prioridade atual receberia `PrioridadeInalterada` — e
   * descobriria a prioridade do Chamado pela mensagem de erro.
   */
  it('Solicitante pedindo a prioridade atual recebe SemPermissao', async () => {
    const erro = await erroDe(mudar({ numero: 1000, prioridade: 'media', versao: 3 }, marina))

    expect(ehDomainError(erro) && erro.code).toBe('SemPermissao')
  })
})

describe('mudanca que nao muda (AC #4)', () => {
  it('pedir a prioridade atual e recusado', async () => {
    const erro = await erroDe(mudar({ numero: 1000, prioridade: 'media', versao: 3 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('PrioridadeInalterada')
    expect(mudancas).toHaveLength(0)
  })
})

describe('o caminho feliz (AC #1)', () => {
  it.each(['baixa', 'alta', 'critica'] as const)('muda para %s', async (prioridade) => {
    const saida = await mudar({ numero: 1000, prioridade, versao: 3 }, bruno)

    expect(saida).toEqual({ numero: 1000, de: 'media', para: prioridade, versao: 4 })
  })

  it('entrega o par de/para ja resolvido ao repositorio', async () => {
    await mudar({ numero: 1000, prioridade: 'critica', versao: 3 }, bruno)

    expect(mudancas[0]).toEqual({ de: 'media', para: 'critica', esperada: 3 })
  })

  it('a versao esperada vem da ENTRADA, nao do Chamado lido', async () => {
    await mudar({ numero: 1000, prioridade: 'alta', versao: 2 }, bruno)

    expect(mudancas[0]?.esperada).toBe(2)
  })
})

describe('concorrencia otimista (AC #5)', () => {
  it('versao divergente vira Conflict', async () => {
    resultadoDoUpdate = null
    existente = chamado({ version: 8 })

    const erro = await erroDe(mudar({ numero: 1000, prioridade: 'alta', versao: 3 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('Conflict')
    expect(erro.message).toContain('8')
  })

  it('Chamado que sumiu vira TicketNaoEncontrado', async () => {
    resultadoDoUpdate = null
    let leituras = 0
    const repoQueSome: typeof repositorio = {
      ...repositorio,
      async buscarPorNumero() {
        leituras += 1
        return leituras === 1 ? embrulharBruto({ ticket: chamado(), comentarios: [] }) : null
      },
    }

    const erro = await erroDe(
      mudarPrioridade({ repositorio: repoQueSome })(
        { numero: 1000, prioridade: 'alta', versao: 3 },
        bruno,
      ),
    )

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })
})
