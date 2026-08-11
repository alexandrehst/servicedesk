import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { auditEntries, comments, emailIntake, tickets } from '../../../drizzle/schema.js'
import type { Principal } from '../../application/contracts/principal.js'
import type {
  RegistroDeIntake,
  TicketRepository,
} from '../../application/ports/ticket-repository.js'
import type { AcaoDeAuditoria } from '../../domain/auditoria.js'
import type { NovoComentario } from '../../domain/comentario.js'
import { DomainError } from '../../domain/errors.js'
import type { Origem } from '../../domain/origem.js'
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
/**
 * `23505` e o SQLSTATE de unique_violation. Ler o CODIGO, e nao a mensagem, e
 * o que mantem isto funcionando em outra versao ou outro idioma do servidor.
 *
 * A cadeia de `cause` precisa ser percorrida porque o Drizzle embrulha o erro
 * do driver num `Error` generico ("Failed query: ...") e o codigo do Postgres
 * fica um nivel abaixo. Olhar so o topo daria `undefined` — e a violacao
 * passaria por erro desconhecido, que e o pior desfecho possivel aqui: a
 * reentrega viraria uma falha ruidosa em vez de uma duplicata silenciosa.
 */
export const ehViolacaoDeUnicidade = (erro: unknown): boolean => {
  for (let atual = erro; atual !== undefined && atual !== null; ) {
    if (typeof atual === 'object' && 'code' in atual && atual.code === '23505') {
      return true
    }
    atual = typeof atual === 'object' && 'cause' in atual ? atual.cause : null
  }

  return false
}

/**
 * O corpo de TODA mutacao de campo versionada (AD-3 + AD-10).
 *
 * Extraido na Story 2.3, quando o Sonar apontou duplicacao: `mudar_status` e
 * `atribuir_chamado` faziam exatamente o mesmo UPDATE condicional seguido do
 * mesmo INSERT de auditoria, mudando so a coluna e o rotulo. As Stories 2.4,
 * 2.5 e 2.6 repetiriam.
 *
 * As tres garantias que este bloco carrega, e que uma copia mal feita perderia:
 *
 * - `version = $esperada` no WHERE (AD-10) — a checagem e do BANCO, nao de um
 *   `if` entre uma leitura e uma escrita;
 * - `deleted_at IS NULL` junto — o Chamado pode ter sido excluido depois que o
 *   command o leu;
 * - auditoria na MESMA transacao (AD-3), e **nenhuma** linha de auditoria
 *   quando o UPDATE nao afeta nada (licao da 1.7: escrita que nao aconteceu
 *   nao vira registro).
 */
const mutarCampoComAuditoria = async (
  db: PostgresJsDatabase,
  campos: Record<string, unknown>,
  entrada: {
    numero: number
    acao: AcaoDeAuditoria
    de: string | null
    para: string
    esperada: number
    autor: Principal
  },
): Promise<{ version: number } | null> =>
  db.transaction(async (tx) => {
    const [linha] = await tx
      .update(tickets)
      .set({ ...campos, version: sql`${tickets.version} + 1` })
      .where(
        and(
          eq(tickets.number, entrada.numero),
          eq(tickets.version, entrada.esperada),
          isNull(tickets.deletedAt),
        ),
      )
      .returning({ version: tickets.version })

    if (linha === undefined) {
      return null
    }

    await tx.insert(auditEntries).values({
      ticketNumber: entrada.numero,
      // O rotulo e o par de/para chegam PRONTOS do command: o adapter grava,
      // nao interpreta (achado do review no PR #46).
      acao: entrada.acao,
      autor: entrada.autor.identity,
      origin: entrada.autor.origin,
      de: entrada.de,
      para: entrada.para,
    })

    return { version: linha.version }
  })

export const criarTicketRepository = (db: PostgresJsDatabase): TicketRepository => ({
  async criarComAuditoria(
    novo: NovoTicket,
    autor: Principal,
    intake?: RegistroDeIntake,
  ): Promise<Ticket> {
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

      // Story 1.9 — dentro da MESMA transacao, pelo mesmo motivo da auditoria.
      if (intake !== undefined) {
        await tx
          .insert(emailIntake)
          .values({ messageId: intake.messageId, ticketNumber: linha.number })
          .catch((erro: unknown) => {
            // 23505 = unique_violation. A mensagem ja tinha sido processada por
            // outra entrega que correu junto — o UNIQUE fez exatamente o que
            // existe para fazer. Traduzir aqui evita que codigo de erro do
            // Postgres vaze para `application`, que nao conhece banco.
            if (ehViolacaoDeUnicidade(erro)) {
              throw new DomainError(
                'MensagemJaProcessada',
                'Esta mensagem de e-mail ja gerou um Chamado.',
              )
            }
            throw erro
          })
      }

      return {
        number: linha.number,
        titulo: linha.titulo,
        descricao: linha.descricao,
        categoria: novo.categoria,
        status: linha.status as Status,
        requester: linha.requester,
        assignee: linha.assignee,
        criadoEm: linha.criadoEm,
        // Chamado nasce vivo; o soft-delete e a Story 1.7.
        excluidoEm: null,
        // Primeira versao (AD-10, Story 2.2): nunca foi mutado.
        version: linha.version,
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
      // Story 2.3 — LIDO do banco. Ate aqui era `null` fixo: a coluna existe
      // desde a 1.1, mas nada atribuia Dono, entao ninguem notou. A partir da
      // atribuicao, o literal viraria bug visivel.
      assignee: linha.assignee,
      criadoEm: linha.criadoEm,
      // O adapter entrega o dado BRUTO, inclusive o excluido: quem descarta e
      // `visivelPara`, no dominio (AD-8, Story 1.4). Filtrar aqui tambem
      // criaria a mesma regra em dois lugares.
      excluidoEm: linha.deletedAt,
      version: linha.version,
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
  async buscarHistoricoBruto(numero: number, origem?: Origem) {
    const [linha] = await db.select().from(tickets).where(eq(tickets.number, numero)).limit(1)

    if (linha === undefined) {
      return null
    }

    // ORDER BY explicito com desempate por `id`: sem ele o Postgres devolve na
    // ordem fisica e o teste de cronologia passa por acaso — ate parar de
    // passar (licao da Story 1.2). Duas acoes no mesmo instante existem: a
    // exclusao e sua auditoria saem na mesma transacao.
    const entradas = await db
      .select()
      .from(auditEntries)
      .where(
        origem === undefined
          ? eq(auditEntries.ticketNumber, numero)
          : and(eq(auditEntries.ticketNumber, numero), eq(auditEntries.origin, origem)),
      )
      .orderBy(asc(auditEntries.registradoEm), asc(auditEntries.id))

    const ticket: Ticket = {
      number: linha.number,
      titulo: linha.titulo,
      descricao: linha.descricao,
      categoria: linha.categoria as Categoria,
      status: linha.status as Status,
      requester: linha.requester,
      // Story 2.3 — LIDO do banco. Ate aqui era `null` fixo: a coluna existe
      // desde a 1.1, mas nada atribuia Dono, entao ninguem notou. A partir da
      // atribuicao, o literal viraria bug visivel.
      assignee: linha.assignee,
      criadoEm: linha.criadoEm,
      excluidoEm: linha.deletedAt,
      version: linha.version,
    }

    return embrulharBruto({
      ticket,
      entradas: entradas.map((e) => ({
        acao: e.acao,
        autor: e.autor,
        origin: e.origin as Origem,
        de: e.de,
        para: e.para,
        registradoEm: e.registradoEm,
      })),
    })
  },

  async criarComentarioComAuditoria(
    numero: number,
    novo: NovoComentario,
    autor: Principal,
    acao: AcaoDeAuditoria,
  ): Promise<{ criadoEm: Date }> {
    return db.transaction(async (tx) => {
      const [linha] = await tx
        .insert(comments)
        .values({
          ticketNumber: numero,
          autor: novo.autor,
          corpo: novo.corpo,
          internal: novo.internal,
        })
        .returning({ criadoEm: comments.criadoEm })

      if (linha === undefined) {
        throw new Error('INSERT do Comentario nao retornou linha.')
      }

      await tx.insert(auditEntries).values({
        ticketNumber: numero,
        // O rotulo chega PRONTO do dominio (`acaoDeComentario`). Deduzi-lo
        // aqui — ramificando sobre `novo.internal` — faria deste adapter o
        // unico lugar do sistema a saber o que aquele booleano significa para
        // a auditoria, e um segundo caminho de escrita poderia divergir.
        //
        // O CORPO nao entra na auditoria: `audit_entries` e append-only
        // (FR-22) e nao tem soft-delete, entao o texto viraria uma segunda
        // copia que sobreviveria a exclusao do Comentario.
        acao,
        autor: autor.identity,
        origin: autor.origin,
      })

      return { criadoEm: linha.criadoEm }
    })
  },

  async mudarStatusComAuditoria(entrada) {
    return mutarCampoComAuditoria(
      db,
      { status: entrada.para },
      {
        ...entrada,
        acao: 'mudar_status',
      },
    )
  },

  async atribuirComAuditoria(entrada) {
    return mutarCampoComAuditoria(
      db,
      { assignee: entrada.para },
      {
        ...entrada,
        acao: 'atribuir_chamado',
      },
    )
  },

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

  async buscarIntakePorMessageId(messageId: string): Promise<number | null> {
    const [linha] = await db
      .select({ ticketNumber: emailIntake.ticketNumber })
      .from(emailIntake)
      .where(eq(emailIntake.messageId, messageId))
      .limit(1)

    return linha?.ticketNumber ?? null
  },
})
