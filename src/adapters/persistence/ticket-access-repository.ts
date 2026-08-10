import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { ticketAccessLinks } from '../../../drizzle/schema.js'
import type { TicketAccessRepository } from '../../application/ports/ticket-access-repository.js'

/**
 * Driven adapter do link de acesso ao Chamado (Story 1.6).
 *
 * Guarda e busca; nao decide validade — quem tem o relogio e o servico, como
 * nas Stories 1.3 e 1.5.
 */
export const criarTicketAccessRepository = (db: PostgresJsDatabase): TicketAccessRepository => ({
  async criarLinkDeAcesso({ ticketNumber, email, tokenHash, expiraEm }) {
    await db.insert(ticketAccessLinks).values({ ticketNumber, email, tokenHash, expiraEm })
  },

  async buscarLinkDeAcessoPorHash(tokenHash) {
    const [linha] = await db
      .select()
      .from(ticketAccessLinks)
      .where(eq(ticketAccessLinks.tokenHash, tokenHash))
      .limit(1)

    if (linha === undefined) {
      return null
    }

    return { ticketNumber: linha.ticketNumber, email: linha.email, expiraEm: linha.expiraEm }
  },
})
