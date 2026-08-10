import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { auditEntries, comments, tickets } from '../../../drizzle/schema.js'
import type { Principal } from '../../application/contracts/principal.js'
import type { TicketRepository } from '../../application/ports/ticket-repository.js'
import type { Categoria, NovoTicket, Status, Ticket } from '../../domain/ticket.js'
import { type Comentario, embrulharBruto } from '../../domain/visibilidade.js'

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
        // Chamado nasce vivo; o soft-delete e a Story 1.7.
        excluidoEm: null,
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
      // O adapter entrega o dado BRUTO, inclusive o excluido: quem descarta e
      // `visivelPara`, no dominio (AD-8, Story 1.4). Filtrar aqui tambem
      // criaria a mesma regra em dois lugares.
      excluidoEm: linha.deletedAt,
    }

    const comentarios: readonly Comentario[] = thread.map((c) => ({
      autor: c.autor,
      corpo: c.corpo,
      internal: c.internal,
      criadoEm: c.criadoEm,
      excluidoEm: c.deletedAt,
    }))

    // Embrulhado: o adapter entrega tudo o que leu, inclusive Comentario
    // interno, e nao tem como decidir o que esconder — nem tem a informacao
    // para isso. Quem abre o embrulho e o dominio (AD-8).
    return embrulharBruto({ ticket, comentarios })
  },

  /**
   * Soft-delete (Story 1.7, FR-23): marca e audita na MESMA transacao (AD-3).
   *
   * `WHERE deleted_at IS NULL` no proprio UPDATE: dois pedidos simultaneos
   * disputam a linha e so um casa. Ler-e-depois-marcar deixaria os dois
   * passarem pela leitura antes de qualquer escrita e gravaria duas linhas de
   * auditoria para uma exclusao — foi o mesmo raciocinio do consumo do link de
   * login (Story 1.3).
   */
  async excluirComAuditoria(numero: number, autor: Principal): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [linha] = await tx
        .update(tickets)
        .set({ deletedAt: sql`now()` })
        .where(and(eq(tickets.number, numero), isNull(tickets.deletedAt)))
        .returning({ number: tickets.number })

      if (linha === undefined) {
        // Nao havia o que excluir. Nenhuma linha de auditoria: registrar uma
        // exclusao que nao aconteceu poluiria o Log com evento falso.
        return false
      }

      await tx.insert(auditEntries).values({
        ticketNumber: linha.number,
        acao: 'excluir_chamado',
        // AD-9: a identidade de quem excluiu, nunca o nome da tool.
        autor: autor.identity,
        origin: autor.origin,
      })

      return true
    })
  },
})
