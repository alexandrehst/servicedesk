import { expect, it, vi } from 'vitest'
import type { NovoTicket, Ticket } from '../../domain/ticket.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { abrirChamado } from './abrir-chamado.js'

const autor: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }

const input = {
  titulo: 'VPN fora do ar',
  descricao: 'Nao conecta desde as 9h.',
  categoria: 'rede',
} as const

const repositorioFake = (): TicketRepository & { chamadas: [NovoTicket, Principal][] } => {
  const chamadas: [NovoTicket, Principal][] = []
  return {
    chamadas,
    async criarComAuditoria(novo, principal): Promise<Ticket> {
      chamadas.push([novo, principal])
      return {
        ...novo,
        number: 1000,
        criadoEm: new Date('2026-08-10T12:00:00Z'),
        excluidoEm: null,
        version: 1,
      }
    },
    async buscarPorNumero() {
      return null
    },
    async excluirComAuditoria() {
      throw new Error('esta suite nao exclui')
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
}

it('retorna o Numero atribuido pela persistencia', async () => {
  const repositorio = repositorioFake()
  const saida = await abrirChamado({ repositorio })(input, autor)
  expect(saida).toEqual({ number: 1000, status: 'aberto' })
})

it('usa a identidade do principal como Solicitante (AD-9)', async () => {
  const repositorio = repositorioFake()
  await abrirChamado({ repositorio })(input, autor)
  const chamada = repositorio.chamadas[0]
  expect(chamada?.[0].requester).toBe('bruno@empresa.com')
  expect(chamada?.[1].origin).toBe('mcp')
})

it('NAO persiste quando o dominio rejeita o input', async () => {
  const repositorio = repositorioFake()
  const espia = vi.spyOn(repositorio, 'criarComAuditoria')

  await expect(
    abrirChamado({ repositorio })({ ...input, titulo: '   ' }, autor),
  ).rejects.toThrowError(/titulo/i)

  expect(espia).not.toHaveBeenCalled()
})

it('propaga falha da persistencia sem mascarar', async () => {
  const repositorio: TicketRepository = {
    async criarComAuditoria() {
      throw new Error('conexao perdida')
    },
    async buscarPorNumero() {
      return null
    },
    async excluirComAuditoria() {
      throw new Error('esta suite nao exclui')
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
  await expect(abrirChamado({ repositorio })(input, autor)).rejects.toThrowError('conexao perdida')
})
