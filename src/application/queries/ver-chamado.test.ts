import { expect, it, vi } from 'vitest'
import type { Ticket } from '../../domain/ticket.js'
import type { Comentario } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { verChamado } from './ver-chamado.js'

const agente: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

const ticket: Ticket = {
  number: 1000,
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
  status: 'aberto',
  requester: 'marina@empresa.com',
  assignee: null,
  criadoEm: new Date('2026-08-10T12:00:00.000Z'),
}

const thread: readonly Comentario[] = [
  {
    autor: 'marina@empresa.com',
    corpo: 'Parou hoje.',
    internal: false,
    criadoEm: new Date('2026-08-10T12:05:00.000Z'),
  },
  {
    autor: 'bruno@empresa.com',
    corpo: 'Fonte queimada.',
    internal: true,
    criadoEm: new Date('2026-08-10T12:10:00.000Z'),
  },
]

const repo = (
  achado: { ticket: Ticket; comentarios: readonly Comentario[] } | null,
): TicketRepository => ({
  async criarComAuditoria() {
    throw new Error('nao deveria escrever numa leitura')
  },
  async buscarPorNumero() {
    return achado
  },
})

it('retorna os campos do Chamado e a thread', async () => {
  const saida = await verChamado({ repositorio: repo({ ticket, comentarios: thread }) })(
    { numero: 1000 },
    agente,
  )
  expect(saida.number).toBe(1000)
  expect(saida.titulo).toBe('Notebook nao liga')
  expect(saida.comentarios).toHaveLength(2)
})

it('converte datas para ISO 8601 UTC', async () => {
  const saida = await verChamado({ repositorio: repo({ ticket, comentarios: thread }) })(
    { numero: 1000 },
    agente,
  )
  expect(saida.criadoEm).toBe('2026-08-10T12:00:00.000Z')
  expect(saida.comentarios[0]?.criadoEm).toBe('2026-08-10T12:05:00.000Z')
})

it('Solicitante nao recebe Comentario Interno', async () => {
  const saida = await verChamado({ repositorio: repo({ ticket, comentarios: thread }) })(
    { numero: 1000 },
    marina,
  )
  expect(saida.comentarios).toHaveLength(1)
  expect(saida.comentarios[0]?.corpo).toBe('Parou hoje.')
})

/**
 * O teste central da story: as duas mensagens precisam ser IDENTICAS. Checar
 * cada caso isoladamente passaria mesmo com mensagens diferentes — e a
 * diferenca e exatamente o vazamento.
 */
it('inexistente e alheio produzem erro identico', async () => {
  const inexistente = await verChamado({ repositorio: repo(null) })({ numero: 9999 }, carlos).catch(
    (e) => e as Error,
  )
  const alheio = await verChamado({ repositorio: repo({ ticket, comentarios: thread }) })(
    { numero: 9999 },
    carlos,
  ).catch((e) => e as Error)

  expect(alheio.message).toBe(inexistente.message)
  expect(alheio.constructor).toBe(inexistente.constructor)
})

it('nao chama o caminho de escrita do repositorio (FR-13)', async () => {
  const repositorio = repo({ ticket, comentarios: thread })
  const escrita = vi.spyOn(repositorio, 'criarComAuditoria')
  await verChamado({ repositorio })({ numero: 1000 }, agente)
  expect(escrita).not.toHaveBeenCalled()
})
