import { beforeEach, describe, expect, it } from 'vitest'
import { ehDomainError } from '../../domain/errors.js'
import type { Ticket } from '../../domain/ticket.js'
import { embrulharBruto } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { excluirChamado } from './excluir-chamado.js'

/**
 * Story 4.3: excluir passou a exigir confirmacao (AD-7). Este duble sempre
 * aceita — os testes de confirmacao vivem em `excluir-usuario.test.ts` e no
 * teste do command; aqui o que se mede e outra coisa.
 */
const confirmacaoQueSempreAceita = {
  async emitir() {
    return 'token'
  },
  async consumir() {
    return true
  },
}

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
  async importarComAuditoria() {
    throw new Error('esta suite nao importa')
  },
  async contarChamadosAbertosDe() {
    return 0
  },
  async excluirComentarioComAuditoria() {
    return false
  },
  async buscarParaExportarBruto() {
    throw new Error('esta suite nao exporta')
  },
  async buscarParecidosBruto() {
    throw new Error('esta suite nao sugere parecidos')
  },
  async buscarResumoBruto() {
    throw new Error('esta suite nao le o resumo')
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
    const erro = await erroDe(
      excluirChamado({ repositorio, confirmacao: confirmacaoQueSempreAceita })(
        { numero: 1000, confirmacao: 'token' },
        carlos,
      ),
    )

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
    expect(excluidos).toHaveLength(0)
  })

  it('Numero inexistente recebe o mesmo erro', async () => {
    existente = null

    const erro = await erroDe(
      excluirChamado({ repositorio, confirmacao: confirmacaoQueSempreAceita })(
        { numero: 9999, confirmacao: 'token' },
        carlos,
      ),
    )

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })

  it('Chamado ja excluido tambem some para quem consulta', async () => {
    existente = { ...chamadoDaMarina, excluidoEm: new Date('2026-08-10T13:00:00.000Z') }

    const erro = await erroDe(
      excluirChamado({ repositorio, confirmacao: confirmacaoQueSempreAceita })(
        { numero: 1000, confirmacao: 'token' },
        bruno,
      ),
    )

    // Excluido e inexistente sao indistinguiveis mesmo para o Agente: o
    // gargalo de visibilidade (Story 1.4) ja o descarta antes de chegar aqui.
    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
    expect(excluidos).toHaveLength(0)
  })
})

describe('quem ve mas nao pode excluir recebe outro erro (AC #3)', () => {
  it('o dono Solicitante recebe SemPermissao, nao "nao encontrado"', async () => {
    const erro = await erroDe(
      excluirChamado({ repositorio, confirmacao: confirmacaoQueSempreAceita })(
        { numero: 1000, confirmacao: 'token' },
        marina,
      ),
    )

    // Ela ABRIU este Chamado: esconder a existencia nao protege informacao
    // nenhuma e so a faria pensar que ele sumiu. E o unico ponto do projeto em
    // que distinguir e melhor que esconder.
    expect(ehDomainError(erro) && erro.code).toBe('SemPermissao')
    expect(excluidos).toHaveLength(0)
  })

  it('os dois erros sao distinguiveis entre si', async () => {
    const semVer = await erroDe(
      excluirChamado({ repositorio, confirmacao: confirmacaoQueSempreAceita })(
        { numero: 1000, confirmacao: 'token' },
        carlos,
      ),
    )
    const semPoder = await erroDe(
      excluirChamado({ repositorio, confirmacao: confirmacaoQueSempreAceita })(
        { numero: 1000, confirmacao: 'token' },
        marina,
      ),
    )

    expect(ehDomainError(semVer) && semVer.code).not.toBe(ehDomainError(semPoder) && semPoder.code)
  })

  it('nenhum dos dois erros revela o papel exigido', async () => {
    const erro = await erroDe(
      excluirChamado({ repositorio, confirmacao: confirmacaoQueSempreAceita })(
        { numero: 1000, confirmacao: 'token' },
        marina,
      ),
    )

    expect(erro.message.toLowerCase()).not.toContain('agente')
  })
})

describe('caminho positivo (AC #1, #5)', () => {
  it('Agente exclui e o repositorio recebe a identidade dele', async () => {
    await excluirChamado({ repositorio, confirmacao: confirmacaoQueSempreAceita })(
      { numero: 1000, confirmacao: 'token' },
      bruno,
    )

    expect(excluidos).toEqual([{ numero: 1000, autor: bruno }])
  })

  it('a exclusao devolve o Numero excluido', async () => {
    const saida = await excluirChamado({ repositorio, confirmacao: confirmacaoQueSempreAceita })(
      { numero: 1000, confirmacao: 'token' },
      bruno,
    )

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
      excluirChamado({ repositorio: repoQuePerdeu, confirmacao: confirmacaoQueSempreAceita })(
        { numero: 1000, confirmacao: 'token' },
        bruno,
      ),
    )

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })
})

describe('excluir Chamado exige confirmacao (Story 4.3, AD-7)', () => {
  /**
   * A divida que a Story 1.7 deixou nominalmente para esta story:
   *
   * > "A exclusao E irreversivel na pratica enquanto nao houver restauracao
   * > (Story 4.3). No dia em que a 4.3 expuser a exclusao por alguma
   * > superficie, o AD-7 passa a valer — esta anotado aqui para que essa
   * > decisao nao seja tomada por omissao."
   *
   * A 4.3 expos `excluir_chamado` como tool. Estes testes sao o pagamento.
   */
  let alvos: string[]
  let vale: boolean

  const confirmacaoDeTeste = {
    async emitir(pedido: { alvo: string; acao: string }) {
      alvos.push(`${pedido.acao}@${pedido.alvo}`)
      return 'token-novo'
    },
    async consumir() {
      return vale
    },
  }

  beforeEach(() => {
    alvos = []
    vale = true
    excluidos.length = 0
  })

  const excluir = excluirChamado({ repositorio, confirmacao: confirmacaoDeTeste })

  it('sem confirmacao, NADA e excluido — e o token volta na mensagem', async () => {
    const erro = await erroDe(excluir({ numero: 1000 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('ConfirmationRequired')
    expect(erro.message).toContain('token-novo')
    expect(erro.message).toMatch(/IRREVERSIVEL/i)
    expect(excluidos).toEqual([])
  })

  it('o token e emitido para ESTE Chamado e para a acao de excluir', async () => {
    await erroDe(excluir({ numero: 1000 }, bruno))

    expect(alvos).toEqual(['excluir_chamado@chamado:1000'])
  })

  it('com confirmacao valida, exclui', async () => {
    await excluir({ numero: 1000, confirmacao: 'token-novo' }, bruno)

    expect(excluidos.map((e) => e.numero)).toEqual([1000])
  })

  it('confirmacao que nao serve nao exclui', async () => {
    vale = false

    const erro = await erroDe(excluir({ numero: 1000, confirmacao: 'qualquer' }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('ConfirmationRequired')
    expect(excluidos).toEqual([])
  })

  /** A ordem da Story 2.6: quem nao pode agir nao recebe cracha. */
  it('o Solicitante nem chega a receber token', async () => {
    const erro = await erroDe(excluir({ numero: 1000 }, marina))

    expect(ehDomainError(erro) && erro.code).toBe('SemPermissao')
    expect(alvos).toEqual([])
  })

  it('Chamado que nao existe tambem nao recebe token', async () => {
    // O duble decide por `existente`, nao pelo numero — entao e ele que some.
    existente = null

    const erro = await erroDe(excluir({ numero: 9999 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
    expect(alvos).toEqual([])
  })
})
