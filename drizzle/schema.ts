import { bigserial, boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * AD-4: o Numero vem de uma SEQUENCE do Postgres, atribuido no insert e
 * imutavel depois. Nunca gerado em codigo de aplicacao — `SELECT max()+1`
 * ou geracao em JS criariam conflito sob concorrencia.
 *
 * A sequence e criada na migration; aqui a coluna so declara o default.
 */
export const tickets = pgTable('tickets', {
  // Chave tecnica interna, nunca exposta no lugar do Numero (Conventions).
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  number: integer('number').notNull().unique(),
  titulo: text('titulo').notNull(),
  descricao: text('descricao').notNull(),
  categoria: text('categoria').notNull(),
  status: text('status').notNull(),
  requester: text('requester').notNull(),
  assignee: text('assignee'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * AD-3 e AD-9: cada mutacao gera um registro com AUTOR e ORIGEM (api|mcp),
 * gravado na mesma transacao da mudanca.
 */
export const auditEntries = pgTable('audit_entries', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ticketNumber: integer('ticket_number').notNull(),
  acao: text('acao').notNull(),
  autor: text('autor').notNull(),
  origin: text('origin').notNull(),
  registradoEm: timestamp('registrado_em', { withTimezone: true }).notNull().defaultNow(),
})

export type TicketRow = typeof tickets.$inferSelect
export type AuditEntryRow = typeof auditEntries.$inferSelect

/**
 * Thread de Comentarios. A ESCRITA e a Story 2.1 — esta tabela existe aqui
 * porque a Story 1.2 precisa ler a thread, e sem tabela nao ha o que ler.
 *
 * `internal` distingue Comentario Publico de Interno: o Solicitante so ve os
 * publicos (FR-2, AD-8). O filtro acontece no dominio, nao numa query.
 */
export const comments = pgTable('comments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ticketNumber: integer('ticket_number').notNull(),
  autor: text('autor').notNull(),
  corpo: text('corpo').notNull(),
  internal: boolean('internal').notNull().default(false),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export type CommentRow = typeof comments.$inferSelect
