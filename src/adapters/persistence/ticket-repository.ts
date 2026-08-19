import { and, asc, count, desc, eq, isNull, or, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { auditEntries, comments, emailIntake, tickets } from '../../../drizzle/schema.js'
import type { Principal } from '../../application/contracts/principal.js'
import type {
  RegistroDeIntake,
  TicketRepository,
} from '../../application/ports/ticket-repository.js'
import type { AcaoDeAuditoria } from '../../domain/auditoria.js'
import type { AlcanceDaBusca } from '../../domain/busca.js'
import type { NovoComentario } from '../../domain/comentario.js'
import { DomainError } from '../../domain/errors.js'
import type { Origem } from '../../domain/origem.js'
import {
  CATEGORIAS,
  type Categoria,
  type NovoTicket,
  type Prioridade,
  STATUS,
  STATUS_ENCERRADOS,
  type Status,
  type Ticket,
} from '../../domain/ticket.js'
import { type Comentario, type EscopoDeLeitura, embrulharBruto } from '../../domain/visibilidade.js'

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
    /**
     * Story 2.6 — o porque da REABERTURA (FR-7). Opcional, e nao uma segunda
     * versao desta funcao: as garantias que ela carrega sao as mesmas, e
     * duplica-las para acrescentar uma coluna seria o erro que a extracao da
     * 2.3 desfez.
     */
    motivo?: string
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
      motivo: entrada.motivo ?? null,
    })

    return { version: linha.version }
  })

/**
 * O `WHERE` da busca textual (Story 3.4, FR-11).
 *
 * Tres coisas casam: Titulo, Descricao e Comentario — mais o `numero_legado`,
 * por IGUALDADE (numero legado e identificador: buscar "123" nao deve trazer o
 * Chamado "1234").
 *
 * O `EXISTS` do Comentario carrega duas condicoes que NAO sao detalhe:
 *
 * - `deleted_at IS NULL` — Comentario apagado nao pode continuar fazendo o
 *   Chamado aparecer, senao o soft-delete (1.7) vaza por outra porta;
 * - o recorte de INTERNO, que vem decidido do dominio. Sem ele, um Comentario
 *   Interno faz o Chamado casar para quem nao pode le-lo: o conteudo nao
 *   aparece, mas a EXISTENCIA do resultado ja conta do que a conversa do time
 *   trata. O gargalo nao pega isso — `podeVerTicket` sabe de posse e exclusao,
 *   nao de conteudo.
 */
const condicaoDeBusca = (busca: AlcanceDaBusca) => {
  const padrao = `%${busca.termo}%`

  const comentarioQueCasa = and(
    eq(comments.ticketNumber, tickets.number),
    isNull(comments.deletedAt),
    ...(busca.comentarios === 'apenasPublicos' ? [eq(comments.internal, false)] : []),
    sql`${comments.corpo} ILIKE ${padrao}`,
  )

  return or(
    sql`${tickets.titulo} ILIKE ${padrao}`,
    sql`${tickets.descricao} ILIKE ${padrao}`,
    eq(tickets.numeroLegado, busca.termo),
    sql`EXISTS (SELECT 1 FROM ${comments} WHERE ${comentarioQueCasa})`,
  )
}

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
          priority: novo.prioridade,
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
        prioridade: linha.priority as Prioridade,
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
      // Story 2.4 — LIDA do banco, pela licao do `assignee` na 2.3.
      prioridade: linha.priority as Prioridade,
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
  /**
   * A Fila (Story 3.1, FR-8).
   *
   * O `deleted_at IS NULL` fica DENTRO desta funcao, junto da traducao do
   * escopo, e nao em cada chamada: e uma condicao que, esquecida, vaza em
   * silencio. Aqui ha um lugar so onde esquece-la e possivel — e uma mutacao
   * que a remova reprova teste.
   *
   * `ORDER BY criado_em, number`: sem o desempate por Numero, dois Chamados
   * abertos no mesmo instante saem na ordem fisica, e a paginacao por
   * deslocamento passa a duplicar e omitir linhas entre paginas (licao da 1.2).
   */
  async buscarFilaBruta(escopo: EscopoDeLeitura, filtros, pagina) {
    const condicoes = [
      // Invariante de TODA leitura de lista, na mesma funcao que traduz o
      // escopo: excluido nao aparece para ninguem (1.7).
      isNull(tickets.deletedAt),
      // O escopo chega decidido pelo dominio; aqui vira SQL, so isso.
      ...(escopo.tipo === 'apenasDe' ? [eq(tickets.requester, escopo.requester)] : []),
      ...(filtros.status === undefined ? [] : [eq(tickets.status, filtros.status)]),
      // Story 3.2 — o filtro de Dono chega decidido: 'qualquer' nao restringe,
      // 'ninguem' e a ausencia, 'identidade' e a igualdade. Repare que ele
      // SOMA com o escopo acima, nunca o substitui: um Solicitante pedindo
      // "sem dono" recebe os DELE sem Dono.
      ...(filtros.dono.tipo === 'ninguem' ? [isNull(tickets.assignee)] : []),
      ...(filtros.dono.tipo === 'identidade' ? [eq(tickets.assignee, filtros.dono.identity)] : []),
      ...(filtros.categoria === undefined ? [] : [eq(tickets.categoria, filtros.categoria)]),
      ...(filtros.busca === undefined ? [] : [condicaoDeBusca(filtros.busca)]),
    ]

    const direcao = pagina.ordem === 'desc' ? desc : asc

    const linhas = await db
      .select({
        number: tickets.number,
        titulo: tickets.titulo,
        status: tickets.status,
        priority: tickets.priority,
        requester: tickets.requester,
        assignee: tickets.assignee,
        criadoEm: tickets.criadoEm,
        deletedAt: tickets.deletedAt,
      })
      .from(tickets)
      .where(and(...condicoes))
      .orderBy(direcao(tickets.criadoEm), direcao(tickets.number))
      // Uma linha a mais que o pedido: e o que responde "ha mais?" sem pagar um
      // COUNT sobre o conjunto inteiro.
      .limit(pagina.limite + 1)
      .offset(pagina.deslocamento)

    const temMais = linhas.length > pagina.limite

    return embrulharBruto({
      itens: linhas.slice(0, pagina.limite).map((linha) => ({
        number: linha.number,
        titulo: linha.titulo,
        status: linha.status as Status,
        prioridade: linha.priority as Prioridade,
        requester: linha.requester,
        assignee: linha.assignee,
        criadoEm: linha.criadoEm,
        excluidoEm: linha.deletedAt,
      })),
      temMais,
    })
  },

  /**
   * O resumo da Fila (Story 3.3, FR-10).
   *
   * TRES `GROUP BY`, e nao um `GROUPING SETS`: este devolveria linhas
   * heterogeneas que o adapter teria que desempilhar, trocando legibilidade por
   * uma varredura a menos. Com indice parcial e uma fila de dezenas de milhares
   * de linhas, tres agregacoes sao baratas — e a troca, se um dia o custo
   * importar, e local: a assinatura do port nao muda.
   *
   * O `escopo` volta junto dos numeros porque o dominio nao tem itens para
   * filtrar: e a pergunta que ele confere (`resumoVisivelPara`).
   */
  /**
   * Chamados parecidos (Story 3.5, FR-12).
   *
   * DUAS condicoes de semelhanca, e as duas sao necessarias:
   *
   * - `%` e o operador de similaridade do `pg_trgm`, e e o unico que USA o
   *   indice GIN criado na 0012;
   * - `similarity(...) >= limiar` e o limiar EXPLICITO, porque o `%` filtra
   *   pelo `pg_trgm.similarity_threshold`, que e configuracao de SESSAO e nao
   *   esta sob controle deste codigo. Sem ele, o resultado dependeria de qual
   *   conexao o pool entregasse.
   *
   * `ORDER BY similarity DESC, number` — desempate explicito, como em toda
   * ordenacao do epico: dois Chamados igualmente parecidos sairiam na ordem
   * fisica, e o teste passaria por acaso ate parar de passar (licao da 1.2).
   */
  async buscarParecidosBruto({ escopo, texto, limiar, limite }) {
    const semelhanca = sql<number>`similarity(${tickets.titulo}, ${texto})`

    const linhas = await db
      .select({
        number: tickets.number,
        titulo: tickets.titulo,
        status: tickets.status,
        priority: tickets.priority,
        requester: tickets.requester,
        assignee: tickets.assignee,
        criadoEm: tickets.criadoEm,
        deletedAt: tickets.deletedAt,
      })
      .from(tickets)
      .where(
        and(
          // Excluido fora; encerrado DENTRO — "ja resolvemos isso" e a resposta
          // mais util que a sugestao pode dar (ao contrario do resumo, 3.3).
          isNull(tickets.deletedAt),
          ...(escopo.tipo === 'apenasDe' ? [eq(tickets.requester, escopo.requester)] : []),
          sql`${tickets.titulo} % ${texto}`,
          sql`${semelhanca} >= ${limiar}`,
        ),
      )
      .orderBy(sql`${semelhanca} DESC`, asc(tickets.number))
      .limit(limite)

    return embrulharBruto({
      itens: linhas.map((linha) => ({
        number: linha.number,
        titulo: linha.titulo,
        status: linha.status as Status,
        prioridade: linha.priority as Prioridade,
        requester: linha.requester,
        assignee: linha.assignee,
        criadoEm: linha.criadoEm,
        excluidoEm: linha.deletedAt,
      })),
      // Sugestao nao pagina: ou os parecidos cabem no limite, ou os que ficaram
      // de fora sao menos parecidos que os piores mostrados.
      temMais: false,
    })
  },

  async buscarResumoBruto(escopo: EscopoDeLeitura) {
    const base = [
      // As mesmas duas condicoes de toda leitura de lista, mais a de CARGA:
      // encerrado nao e carga (Story 3.3).
      isNull(tickets.deletedAt),
      ...(escopo.tipo === 'apenasDe' ? [eq(tickets.requester, escopo.requester)] : []),
      sql`${tickets.status} NOT IN ${STATUS_ENCERRADOS}`,
    ]

    const [porStatus, porCategoria, porDono] = await Promise.all([
      db
        .select({ chave: tickets.status, quantos: count() })
        .from(tickets)
        .where(and(...base))
        .groupBy(tickets.status),
      db
        .select({ chave: tickets.categoria, quantos: count() })
        .from(tickets)
        .where(and(...base))
        .groupBy(tickets.categoria),
      db
        .select({ chave: tickets.assignee, quantos: count() })
        .from(tickets)
        .where(and(...base))
        .groupBy(tickets.assignee),
    ])

    const contar = (linhas: { chave: string | null; quantos: number }[], chave: string) =>
      linhas.find((l) => l.chave === chave)?.quantos ?? 0

    return embrulharBruto({
      escopo,
      contadores: {
        // Eixos FECHADOS preenchidos a partir das listas do dominio: Status sem
        // Chamado aparece com ZERO, em vez de sumir. Ausencia e zero sao coisas
        // diferentes para quem le um painel — e sumir esconde justamente o
        // "nao ha nada aqui".
        porStatus: Object.fromEntries(STATUS.map((s) => [s, contar(porStatus, s)])) as Record<
          Status,
          number
        >,
        porCategoria: Object.fromEntries(
          CATEGORIAS.map((c) => [c, contar(porCategoria, c)]),
        ) as Record<Categoria, number>,
        // Eixo ABERTO: so as identidades que tem Chamado. `null` NAO vira chave
        // — vai para `semDono`, que e campo proprio (licao da 3.2).
        porDono: Object.fromEntries(
          porDono.filter((l) => l.chave !== null).map((l) => [l.chave as string, l.quantos]),
        ),
        semDono: porDono.find((l) => l.chave === null)?.quantos ?? 0,
      },
    })
  },

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
      // Story 2.4 — LIDA do banco, pela licao do `assignee` na 2.3.
      prioridade: linha.priority as Prioridade,
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

  async mudarPrioridadeComAuditoria(entrada) {
    return mutarCampoComAuditoria(
      db,
      { priority: entrada.para },
      {
        ...entrada,
        acao: 'mudar_prioridade',
      },
    )
  },

  async executarAcaoIrreversivelComAuditoria(entrada) {
    return mutarCampoComAuditoria(db, { status: entrada.para }, entrada)
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
