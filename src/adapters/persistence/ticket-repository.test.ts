import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Principal } from '../../application/contracts/principal.js'
import { abrirTicket } from '../../domain/ticket.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Integracao com Postgres REAL. O que esta story precisa provar — sequence do
 * banco (AD-4) e atomicidade da transacao (AD-3) — nao e mockavel: um mock
 * provaria apenas que o mock funciona.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const autor: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }

const novo = () =>
  abrirTicket({
    titulo: 'VPN fora do ar',
    descricao: 'Nao conecta desde as 9h.',
    categoria: 'rede',
    requester: autor.identity,
  })

beforeEach(async () => {
  // Sem truncar, a sequence continua de onde parou e assercoes sobre Numero
  // quebram de forma intermitente — o pior tipo de teste falho.
  await db.execute(sql`TRUNCATE tickets, audit_entries RESTART IDENTITY`)
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('criarComAuditoria', () => {
  it('atribui Numero vindo da sequence do Postgres (AD-4)', async () => {
    const primeiro = await repositorio.criarComAuditoria(novo(), autor)
    const segundo = await repositorio.criarComAuditoria(novo(), autor)

    expect(primeiro.number).toBe(1000)
    expect(segundo.number).toBe(1001)
  })

  it('Chamado nasce aberto e sem Dono', async () => {
    const ticket = await repositorio.criarComAuditoria(novo(), autor)
    expect(ticket.status).toBe('aberto')
    expect(ticket.assignee).toBeNull()
  })

  it('grava auditoria com autor e origem na mesma transacao (AD-3, AD-9)', async () => {
    const ticket = await repositorio.criarComAuditoria(novo(), autor)

    const linhas = await db.execute(
      sql`SELECT autor, origin, acao, ticket_number FROM audit_entries`,
    )

    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({
      autor: 'bruno@empresa.com',
      origin: 'mcp',
      acao: 'abrir_chamado',
      ticket_number: ticket.number,
    })
  })

  it('registra a origem api quando o principal vem da API', async () => {
    await repositorio.criarComAuditoria(novo(), { ...autor, origin: 'api' })
    const linhas = await db.execute(sql`SELECT origin FROM audit_entries`)
    expect(linhas[0]).toMatchObject({ origin: 'api' })
  })

  /**
   * AC #4 — a prova de que "mesma transacao" e garantia, nao intencao.
   * Sem transacao real, o Chamado ficaria comitado e existiria SEM rastro de
   * autoria: exatamente a lacuna de auditoria que o AD-3 existe para impedir.
   */
  it('NAO persiste o Chamado quando a auditoria falha (atomicidade)', async () => {
    // Derruba a insercao na auditoria sem tocar na tabela de Chamados.
    await db.execute(sql`ALTER TABLE audit_entries ADD CONSTRAINT falha_proposital CHECK (false)`)

    try {
      await expect(repositorio.criarComAuditoria(novo(), autor)).rejects.toThrow()

      const tickets = await db.execute(sql`SELECT count(*)::int AS total FROM tickets`)
      expect(tickets[0]).toMatchObject({ total: 0 })
    } finally {
      await db.execute(sql`ALTER TABLE audit_entries DROP CONSTRAINT falha_proposital`)
    }
  })
})
