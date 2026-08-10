import { asc, eq, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { auditEntries, comments, tickets } from '../../../drizzle/schema.js'
import type { Principal } from '../../application/contracts/principal.js'
import type { TicketRepository } from '../../application/ports/ticket-repository.js'
import type { Categoria, NovoTicket, Status, Ticket } from '../../domain/ticket.js'
import type { Comentario } from '../../domain/visibilidade.js'

/**
 * Driven adapter: implementa o port de repositorio.
 *
 * AD-3 — a insercao do Chamado e a do registro de auditoria acontecem dentro
 * de UMA transacao. Duas chamadas em sequencia NAO seriam uma transacao: se a
 * segunda falhasse, a primeira ja estaria comitada e o Chamado existiria sem
 * rastro de autoria. O teste de atomicidade (AC #4) prova que isso nao ocorre.
 *
 * AD-4 — o `number` nao aparece no INSERT. Ele vem do DEFAULT nextval(...)
 * da coluna e volta pelo RETURNING. Nao ha caminho para gerar em codigo.
 */
export const criarTicketRepository = (db: PostgresJsDatabase): TicketRepository => ({
  async criarComAuditoria(novo: NovoTicket, autor: Principal): Promise<Ticket> {
    return db.transaction(async (tx) => {
      const [linha] = await tx
        .insert(tickets)
        .values({
          titulo: novo.titulo,
          descricao: novo.descricao,
          categoria: novo.categoria,
          status: novo.status,
          requester: novo.requester,
          assignee: novo.assignee,
          number: sql`nextval('ticket_number_seq')`,
        })
        .returning()

      if (linha === undefined) {
        throw new Error('INSERT do Chamado nao retornou linha.')
      }

      await tx.insert(auditEntries).values({
        ticketNumber: linha.number,
        acao: 'abrir_chamado',
        // AD-9: a identidade do principal e o autor. Nunca o nome da tool.
        autor: autor.identity,
        origin: autor.origin,
      })

      return {
        number: linha.number,
        titulo: linha.titulo,
        descricao: linha.descricao,
        categoria: novo.categoria,
        status: linha.status as Status,
        requester: linha.requester,
        assignee: null,
        criadoEm: linha.criadoEm,
      }
    })
  },

  /**
   * Leitura pura: nenhuma transacao de escrita, nenhum registro de auditoria
   * (FR-13). Devolve o dado BRUTO — inclusive Comentarios internos. Quem
   * filtra por papel e o dominio (AD-8); o adapter nao conhece autorizacao.
   */
  async buscarPorNumero(numero: number) {
    const [linha] = await db.select().from(tickets).where(eq(tickets.number, numero)).limit(1)

    if (linha === undefined) {
      return null
    }

    // ORDER BY explicito: sem ele o Postgres nao garante ordem, e o teste de
    // cronologia passaria por acaso ate parar de passar.
    const thread = await db
      .select()
      .from(comments)
      .where(eq(comments.ticketNumber, numero))
      .orderBy(asc(comments.criadoEm), asc(comments.id))

    const ticket: Ticket = {
      number: linha.number,
      titulo: linha.titulo,
      descricao: linha.descricao,
      categoria: linha.categoria as Categoria,
      status: linha.status as Status,
      requester: linha.requester,
      assignee: null,
      criadoEm: linha.criadoEm,
    }

    const comentarios: readonly Comentario[] = thread.map((c) => ({
      autor: c.autor,
      corpo: c.corpo,
      internal: c.internal,
      criadoEm: c.criadoEm,
    }))

    return { ticket, comentarios }
  },
})
