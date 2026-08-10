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
      return { ...novo, number: 1000, criadoEm: new Date('2026-08-10T12:00:00Z'), excluidoEm: null }
    },
    async buscarPorNumero() {
      return null
    },
    async excluirComAuditoria() {
      throw new Error('esta suite nao exclui')
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
  }
  await expect(abrirChamado({ repositorio })(input, autor)).rejects.toThrowError('conexao perdida')
})
