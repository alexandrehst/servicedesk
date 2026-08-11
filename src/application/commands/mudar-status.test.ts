import { beforeEach, describe, expect, it } from 'vitest'
import { ehDomainError } from '../../domain/errors.js'
import type { Status, Ticket } from '../../domain/ticket.js'
import { embrulharBruto } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { mudarStatus } from './mudar-status.js'

/**
 * O papel errado antes do papel certo, e a recusa antes do caminho feliz.
 *
 * O conflito de versao NAO e testado aqui — duble concorda com o que voce
 * programou, e concorrencia otimista precisa do banco de verdade. Ver
 * `adapters/persistence/mudar-status.test.ts`.
 */

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
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
  criadoEm: new Date('2026-08-11T12:00:00.000Z'),
  excluidoEm: null,
  version: 3,
  ...extra,
})

let mudancas: { numero: number; de: Status; para: Status; esperada: number }[]
let existente: Ticket | null
let resultadoDoUpdate: { version: number } | null

const repositorio: TicketRepository = {
  async criarComAuditoria() {
    throw new Error('esta suite nao abre Chamado')
  },
  async buscarPorNumero() {
    return existente === null ? null : embrulharBruto({ ticket: existente, comentarios: [] })
  },
  async mudarStatusComAuditoria({ numero, de, para, esperada }) {
    mudancas.push({ numero, de, para, esperada })
    return resultadoDoUpdate
  },
  async criarComentarioComAuditoria() {
    throw new Error('esta suite nao comenta')
  },
  async excluirComAuditoria() {
    throw new Error('esta suite nao exclui')
  },
  async atribuirComAuditoria() {
    throw new Error('esta suite nao atribui')
  },
  async mudarPrioridadeComAuditoria() {
    throw new Error('esta suite nao muda Prioridade')
  },
  async buscarIntakePorMessageId() {
    throw new Error('esta suite nao faz intake')
  },
  async buscarHistoricoBruto() {
    throw new Error('esta suite nao le historico')
  },
}

const mudar = mudarStatus({ repositorio })

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
  existente = chamado('aberto')
  resultadoDoUpdate = { version: 4 }
})

describe('quem nao ve o Chamado (AC #3)', () => {
  it('alheio, excluido e inexistente sao indistinguiveis', async () => {
    const alheio = await erroDe(
      mudar({ numero: 1000, novoStatus: 'em_andamento', versao: 3 }, carlos),
    )

    existente = chamado('aberto', { excluidoEm: new Date() })
    const excluido = await erroDe(
      mudar({ numero: 1000, novoStatus: 'em_andamento', versao: 3 }, bruno),
    )

    existente = null
    const inexistente = await erroDe(
      mudar({ numero: 1000, novoStatus: 'em_andamento', versao: 3 }, bruno),
    )

    for (const erro of [alheio, excluido, inexistente]) {
      expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
    }
    expect(mudancas).toHaveLength(0)
  })
})

describe('quem ve mas nao pode agir (AC #4)', () => {
  it('o Solicitante nao muda o Status do proprio Chamado', async () => {
    const erro = await erroDe(
      mudar({ numero: 1000, novoStatus: 'em_andamento', versao: 3 }, marina),
    )

    expect(ehDomainError(erro) && erro.code).toBe('SemPermissao')
    expect(mudancas).toHaveLength(0)
  })

  /**
   * A ORDEM das checagens: autorizacao ANTES da validacao da transicao. Se
   * fosse ao contrario, o Solicitante receberia `TransicaoInvalida` — e
   * aprenderia como a maquina de estados funciona sem ter direito de agir.
   */
  it('Solicitante pedindo transicao invalida recebe SemPermissao, nao TransicaoInvalida', async () => {
    const erro = await erroDe(mudar({ numero: 1000, novoStatus: 'resolvido', versao: 3 }, marina))

    expect(ehDomainError(erro) && erro.code).toBe('SemPermissao')
  })
})

describe('a porta dos fundos da Story 2.6 (AC #5)', () => {
  /**
   * O teste central desta story. Fechar, cancelar e reabrir exigem confirmacao
   * explicita (AD-7). Se `mudar_status` as executasse, a IA encerraria Chamado
   * sem human-in-the-loop, e o guardrail da 2.6 nasceria furado.
   */
  it.each([
    ['aberto', 'cancelado'],
    ['em_andamento', 'cancelado'],
  ] as const)('%s -> %s e recusado com o motivo certo', async (de, para) => {
    existente = chamado(de)

    const erro = await erroDe(mudar({ numero: 1000, novoStatus: para, versao: 3 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('TransicaoInvalida')
    expect(erro.message).toContain('confirmacao')
    expect(mudancas).toHaveLength(0)
  })

  it('resolvido -> fechado tambem passa pela acao dedicada', async () => {
    existente = chamado('resolvido')

    const erro = await erroDe(mudar({ numero: 1000, novoStatus: 'fechado', versao: 3 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('TransicaoInvalida')
    expect(mudancas).toHaveLength(0)
  })

  it('reabrir um Chamado fechado nao passa por aqui', async () => {
    existente = chamado('fechado')

    const erro = await erroDe(mudar({ numero: 1000, novoStatus: 'em_andamento', versao: 3 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('TransicaoInvalida')
    expect(mudancas).toHaveLength(0)
  })
})

describe('transicoes invalidas (AC #1)', () => {
  it.each([
    ['aberto', 'resolvido'],
    ['resolvido', 'cancelado'],
  ] as const)('%s -> %s e recusado pelo dominio', async (de, para) => {
    existente = chamado(de)

    const erro = await erroDe(mudar({ numero: 1000, novoStatus: para, versao: 3 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('TransicaoInvalida')
    expect(mudancas).toHaveLength(0)
  })

  it('mudar para o mesmo Status nao e mudanca', async () => {
    const erro = await erroDe(mudar({ numero: 1000, novoStatus: 'aberto', versao: 3 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('TransicaoInvalida')
    expect(mudancas).toHaveLength(0)
  })
})

describe('o caminho feliz (AC #1)', () => {
  it('muda e devolve a versao NOVA', async () => {
    const saida = await mudar({ numero: 1000, novoStatus: 'em_andamento', versao: 3 }, bruno)

    expect(saida).toEqual({ numero: 1000, de: 'aberto', para: 'em_andamento', versao: 4 })
  })

  /**
   * O par de/para e resolvido pelo COMMAND e entregue pronto ao repositorio:
   * o adapter grava, nao interpreta (achado do `claude-review` no PR #46).
   */
  it('entrega o par de/para ja resolvido ao repositorio', async () => {
    await mudar({ numero: 1000, novoStatus: 'em_andamento', versao: 3 }, bruno)

    expect(mudancas[0]).toEqual({
      numero: 1000,
      de: 'aberto',
      para: 'em_andamento',
      esperada: 3,
    })
  })

  it('a versao esperada vem da ENTRADA, nao do Chamado lido', async () => {
    // Se o command usasse `visivel.ticket.version` em vez do que o chamador
    // informou, a concorrencia otimista nao existiria: ele estaria sempre
    // "certo" sobre a versao, e nunca haveria conflito.
    await mudar({ numero: 1000, novoStatus: 'em_andamento', versao: 2 }, bruno)

    expect(mudancas[0]?.esperada).toBe(2)
  })

  it.each([
    ['aberto', 'em_andamento'],
    ['em_andamento', 'resolvido'],
    ['em_andamento', 'aberto'],
    ['resolvido', 'em_andamento'],
  ] as const)('%s -> %s passa', async (de, para) => {
    existente = chamado(de)

    const saida = await mudar({ numero: 1000, novoStatus: para, versao: 3 }, bruno)

    expect(saida.para).toBe(para)
  })
})

describe('quando o UPDATE nao casa (AC #2, #3)', () => {
  /**
   * Duas causas possiveis para zero linhas afetadas, e elas pedem acoes
   * OPOSTAS de quem chamou: releia-e-tente (conflito) ou desista (sumiu).
   * Confundi-las faria a IA tentar para sempre num Chamado excluido.
   */
  it('versao divergente vira Conflict, com a versao atual na mensagem', async () => {
    resultadoDoUpdate = null
    existente = chamado('aberto', { version: 7 })

    const erro = await erroDe(mudar({ numero: 1000, novoStatus: 'em_andamento', versao: 3 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('Conflict')
    expect(erro.message).toContain('7')
  })

  it('Chamado que sumiu no meio do caminho vira TicketNaoEncontrado', async () => {
    resultadoDoUpdate = null
    let leituras = 0
    const repoQueSome: TicketRepository = {
      ...repositorio,
      async buscarPorNumero() {
        leituras += 1
        // A primeira leitura ve o Chamado; a segunda (depois do UPDATE falhar)
        // ja nao — foi excluido por outro Agente nesse intervalo.
        return leituras === 1
          ? embrulharBruto({ ticket: chamado('aberto'), comentarios: [] })
          : null
      },
    }

    const erro = await erroDe(
      mudarStatus({ repositorio: repoQueSome })(
        { numero: 1000, novoStatus: 'em_andamento', versao: 3 },
        bruno,
      ),
    )

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })
})
