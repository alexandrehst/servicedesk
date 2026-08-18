import {
  bigserial,
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

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
  // Story 2.4 — FR-6. Ver a migration para o porque do NOT NULL.
  priority: text('priority').notNull().default('media'),
  requester: text('requester').notNull(),
  assignee: text('assignee'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  // Story 1.7 — soft-delete (FR-23): exclusao e marcacao, a linha fica.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  // Story 2.2 — concorrencia otimista (AD-10). Incrementada a cada mutacao de
  // CAMPO; escrita aditiva (Comentario) nao a move.
  version: integer('version').notNull().default(1),
  // Story 3.4 — o Numero do sistema ANTERIOR (FR-11). Nasce vazia; quem
  // preenche e o import do Epic 4. TEXT porque numero legado costuma vir com
  // prefixo, zero a esquerda ou letra.
  numeroLegado: text('numero_legado'),
})

/**
 * AD-3 e AD-9: cada mutacao gera um registro com AUTOR e ORIGEM (api|mcp),
 * gravado na mesma transacao da mudanca.
 */
/**
 * Sem `deletedAt` de proposito (Story 1.7): o Log e append-only (FR-22). Uma
 * coluna de exclusao aqui permitiria apagar a prova de que algo aconteceu.
 */
export const auditEntries = pgTable('audit_entries', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ticketNumber: integer('ticket_number').notNull(),
  acao: text('acao').notNull(),
  autor: text('autor').notNull(),
  origin: text('origin').notNull(),
  // Story 2.2 — o par de/para. Nulos: `abrir_chamado` e `comentar_chamado` nao
  // mudam valor nenhum, e inventar 'nenhum' seria registrar um evento falso.
  de: text('de'),
  para: text('para'),
  // Story 2.6 — o motivo da REABERTURA (FR-7). Nulo nas demais acoes: so
  // `reabrir_chamado` o informa. Vai para o Log, e nao para um Comentario,
  // porque o Log e append-only e o Comentario tem soft-delete.
  motivo: text('motivo'),
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
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export type CommentRow = typeof comments.$inferSelect

/**
 * Identidade (Story 1.3, FR-19). Tres tabelas, uma responsabilidade cada:
 * quem existe (`users`), quem esta tentando entrar (`loginLinks`) e quem ja
 * entrou (`sessions`).
 *
 * O que NAO existe aqui e tao importante quanto o que existe: nenhuma coluna
 * de token em texto claro e nenhuma coluna de senha. O banco so ve hash.
 */
export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull().unique(),
  papel: text('papel').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const loginLinks = pgTable('login_links', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  usadoEm: timestamp('usado_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  // Sem `papel`: ele e lido de `users` na resolucao, para que rebaixamento e
  // remocao valham imediatamente em vez de esperar a sessao expirar.
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Story 1.5 — credencial de maquina do cliente MCP e contador de chamadas.
 *
 * `mcpTokens` e separada de `sessions` de proposito (AD-9): o agente autonomo
 * tem identidade propria, e e isso que permite a auditoria distinguir uma acao
 * dele de uma acao "humano via IA".
 */
export const mcpTokens = pgTable('mcp_tokens', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  identity: text('identity').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  descricao: text('descricao').notNull(),
  // NULL = nao expira. Prazo nao foi decidido; ver a migration.
  expiraEm: timestamp('expira_em', { withTimezone: true }),
  revogadoEm: timestamp('revogado_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const rateLimit = pgTable(
  'rate_limit',
  {
    identity: text('identity').notNull(),
    janela: timestamp('janela', { withTimezone: true }).notNull(),
    chamadas: integer('chamadas').notNull().default(0),
  },
  (tabela) => [primaryKey({ columns: [tabela.identity, tabela.janela] })],
)

/**
 * Story 2.6 — a confirmacao de uma Acao irreversivel (AD-7, FR-15, FR-17).
 *
 * Mesmo desenho de `loginLinks` (1.3): o banco ve HASH, o token cru existe uma
 * vez na resposta, o consumo e atomico e o uso e unico. A diferenca esta no
 * ESCOPO — `ticketNumber`, `acao` e `identity` — que e o que impede uma
 * confirmacao de "cancelar #1042" fechar #1042, ou servir a outra pessoa.
 */
export const confirmacoes = pgTable('confirmacoes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ticketNumber: integer('ticket_number').notNull(),
  acao: text('acao').notNull(),
  identity: text('identity').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  usadoEm: timestamp('usado_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export type McpTokenRow = typeof mcpTokens.$inferSelect
export type RateLimitRow = typeof rateLimit.$inferSelect
export type ConfirmacaoRow = typeof confirmacoes.$inferSelect

/**
 * Story 1.6 — link de acesso ao Chamado (FR-18). Sem `usadoEm`: reutilizavel
 * por decisao, ao contrario do link de login.
 */
export const ticketAccessLinks = pgTable('ticket_access_links', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ticketNumber: integer('ticket_number').notNull(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export type TicketAccessLinkRow = typeof ticketAccessLinks.$inferSelect

/**
 * Story 1.9 — uma linha por mensagem de e-mail que virou Chamado.
 *
 * O `unique()` em `messageId` nao e otimizacao: e a unica coisa que impede duas
 * entregas simultaneas da mesma mensagem de abrirem dois Chamados. A leitura
 * previa cobre o caso comum; a restricao cobre a corrida.
 */
export const emailIntake = pgTable('email_intake', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  messageId: text('message_id').notNull().unique(),
  ticketNumber: integer('ticket_number').notNull(),
  recebidoEm: timestamp('recebido_em', { withTimezone: true }).notNull().defaultNow(),
})

export type EmailIntakeRow = typeof emailIntake.$inferSelect

export type UserRow = typeof users.$inferSelect
export type LoginLinkRow = typeof loginLinks.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
