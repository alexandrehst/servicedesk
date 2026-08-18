import { beforeEach, describe, expect, it } from 'vitest'
import { ehDomainError } from '../../domain/errors.js'
import type { Ticket } from '../../domain/ticket.js'
import { embrulharBruto } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { excluirChamado } from './excluir-chamado.js'

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

const chamadoDaMarina: Ticket = {
  number: 1000,
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
  status: 'aberto',
  prioridade: 'media',
  requester: 'marina@empresa.com',
  assignee: null,
  criadoEm: new Date('2026-08-10T12:00:00.000Z'),
  excluidoEm: null,
  version: 1,
}

let excluidos: { numero: number; autor: Principal }[]
let existente: Ticket | null

const repositorio: TicketRepository = {
  async criarComAuditoria() {
    throw new Error('nao deveria criar')
  },
  async buscarPorNumero() {
    return existente === null ? null : embrulharBruto({ ticket: existente, comentarios: [] })
  },
  async excluirComAuditoria(numero, autor) {
    excluidos.push({ numero, autor })
    return existente !== null && existente.excluidoEm === null
  },
  async criarComentarioComAuditoria() {
    throw new Error('esta suite nao comenta')
  },
  async mudarStatusComAuditoria() {
    throw new Error('esta suite nao muda Status')
  },
  async atribuirComAuditoria() {
    throw new Error('esta suite nao atribui')
  },
  async mudarPrioridadeComAuditoria() {
    throw new Error('esta suite nao muda Prioridade')
  },
  async buscarIntakePorMessageId() {
    throw new Error('esta suite nao faz intake por e-mail')
  },
  async executarAcaoIrreversivelComAuditoria() {
    throw new Error('esta suite nao executa Acao irreversivel')
  },
  async buscarFilaBruta() {
    throw new Error('esta suite nao le a Fila')
  },
  async buscarHistoricoBruto() {
    throw new Error('esta suite nao le historico')
  },
}

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
  excluidos = []
  existente = chamadoDaMarina
})

describe('quem nao pode ver nao sabe que existe (AC #3)', () => {
  it('Solicitante alheio recebe TicketNaoEncontrado', async () => {
    const erro = await erroDe(excluirChamado({ repositorio })({ numero: 1000 }, carlos))

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
    expect(excluidos).toHaveLength(0)
  })

  it('Numero inexistente recebe o mesmo erro', async () => {
    existente = null

    const erro = await erroDe(excluirChamado({ repositorio })({ numero: 9999 }, carlos))

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })

  it('Chamado ja excluido tambem some para quem consulta', async () => {
    existente = { ...chamadoDaMarina, excluidoEm: new Date('2026-08-10T13:00:00.000Z') }

    const erro = await erroDe(excluirChamado({ repositorio })({ numero: 1000 }, bruno))

    // Excluido e inexistente sao indistinguiveis mesmo para o Agente: o
    // gargalo de visibilidade (Story 1.4) ja o descarta antes de chegar aqui.
    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
    expect(excluidos).toHaveLength(0)
  })
})

describe('quem ve mas nao pode excluir recebe outro erro (AC #3)', () => {
  it('o dono Solicitante recebe SemPermissao, nao "nao encontrado"', async () => {
    const erro = await erroDe(excluirChamado({ repositorio })({ numero: 1000 }, marina))

    // Ela ABRIU este Chamado: esconder a existencia nao protege informacao
    // nenhuma e so a faria pensar que ele sumiu. E o unico ponto do projeto em
    // que distinguir e melhor que esconder.
    expect(ehDomainError(erro) && erro.code).toBe('SemPermissao')
    expect(excluidos).toHaveLength(0)
  })

  it('os dois erros sao distinguiveis entre si', async () => {
    const semVer = await erroDe(excluirChamado({ repositorio })({ numero: 1000 }, carlos))
    const semPoder = await erroDe(excluirChamado({ repositorio })({ numero: 1000 }, marina))

    expect(ehDomainError(semVer) && semVer.code).not.toBe(ehDomainError(semPoder) && semPoder.code)
  })

  it('nenhum dos dois erros revela o papel exigido', async () => {
    const erro = await erroDe(excluirChamado({ repositorio })({ numero: 1000 }, marina))

    expect(erro.message.toLowerCase()).not.toContain('agente')
  })
})

describe('caminho positivo (AC #1, #5)', () => {
  it('Agente exclui e o repositorio recebe a identidade dele', async () => {
    await excluirChamado({ repositorio })({ numero: 1000 }, bruno)

    expect(excluidos).toEqual([{ numero: 1000, autor: bruno }])
  })

  it('a exclusao devolve o Numero excluido', async () => {
    const saida = await excluirChamado({ repositorio })({ numero: 1000 }, bruno)

    expect(saida).toEqual({ number: 1000 })
  })

  it('corrida perdida vira TicketNaoEncontrado', async () => {
    // O repositorio devolve `false` quando o UPDATE nao casou — outro pedido
    // marcou primeiro. Do ponto de vista de quem chamou, o Chamado ja nao
    // estava la.
    const repoQuePerdeu: TicketRepository = {
      ...repositorio,
      async excluirComAuditoria() {
        return false
      },
      async criarComentarioComAuditoria() {
        throw new Error('esta suite nao comenta')
      },
      async mudarStatusComAuditoria() {
        throw new Error('esta suite nao muda Status')
      },
      async atribuirComAuditoria() {
        throw new Error('esta suite nao atribui')
      },
      async mudarPrioridadeComAuditoria() {
        throw new Error('esta suite nao muda Prioridade')
      },
      async buscarIntakePorMessageId() {
        throw new Error('esta suite nao faz intake por e-mail')
      },
      async buscarFilaBruta() {
        throw new Error('esta suite nao le a Fila')
      },
      async buscarHistoricoBruto() {
        throw new Error('esta suite nao le historico')
      },
    }

    const erro = await erroDe(
      excluirChamado({ repositorio: repoQuePerdeu })({ numero: 1000 }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })
})
