import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import type { Principal } from '../../application/contracts/principal.js'
import { chamadosParecidos } from '../../application/queries/chamados-parecidos.js'
import { LIMIAR_DE_SEMELHANCA } from '../../domain/semelhanca.js'
import { filaVisivelPara } from '../../domain/visibilidade.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * A sugestao de parecidos contra o Postgres REAL (Story 3.5, FR-12).
 *
 * `similarity()` e do banco: com duble, "parecido" seria so o que o duble
 * decidisse. E o escopo continua exigindo DUAS identidades — sugerir Chamado de
 * terceiro vazaria Titulo alheio para quem esta apenas abrindo um Chamado.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 4 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const sugerir = chamadosParecidos({ repositorio })

const inserir = async (
  linhas: {
    numero: number
    requester: string
    titulo: string
    status?: string
    excluido?: boolean
  }[],
) => {
  for (const l of linhas) {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester, deleted_at)
      VALUES (
        ${l.numero}, ${l.titulo}, 'descricao', 'rede', ${l.status ?? 'aberto'}, 'media',
        ${l.requester}, ${l.excluido === true ? sql`now()` : null}
      )
    `)
  }
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments RESTART IDENTITY`)
  // A sequence comeca ACIMA dos numeros inseridos a mao: o teste do AC #5 abre
  // um Chamado de verdade, e ele nao pode colidir com os fixos.
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 5000`)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('a ordem e por semelhanca (AC #1)', () => {
  /**
   * Os numeros sao escolhidos para a ordem por semelhanca DIVERGIR da ordem por
   * data/Numero: o mais parecido e o de Numero MAIOR. Sem isso, ordenar por data
   * daria o mesmo resultado e o teste passaria por acaso — foi assim que a
   * mutacao "ordenar por data" sobreviveu na primeira rodada.
   */
  it('o mais parecido vem primeiro, mesmo sendo o mais recente', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', titulo: 'VPN nao conecta no notebook novo' },
      { numero: 1001, requester: 'marina@empresa.com', titulo: 'Impressora sem toner' },
      { numero: 1002, requester: 'marina@empresa.com', titulo: 'VPN nao conecta' },
    ])

    const saida = await sugerir({ texto: 'VPN nao conecta' }, marina)

    expect(saida.parecidos.map((p) => p.numero)).toEqual([1002, 1000])
  })

  /** A linha e a MESMA da Fila (3.1): resumo, sem Descricao nem thread. */
  it('devolve o resumo do Chamado, nao o Chamado', async () => {
    await inserir([{ numero: 1000, requester: 'marina@empresa.com', titulo: 'VPN nao conecta' }])

    const saida = await sugerir({ texto: 'VPN nao conecta' }, marina)

    expect(Object.keys(saida.parecidos[0] ?? {}).sort()).toEqual(
      ['criadoEm', 'dono', 'numero', 'prioridade', 'status', 'titulo'].sort(),
    )
  })
})

describe('a sugestao respeita o escopo (AC #2)', () => {
  /**
   * O conflito de frente da story: quem abre costuma ser o Solicitante, e o
   * Titulo de um Chamado alheio JA E conteudo — "Acesso negado ao sistema da
   * folha" entrega o que ela nao podia ver.
   */
  it('o Solicitante nao recebe Chamado de terceiro como sugestao', async () => {
    await inserir([
      { numero: 1000, requester: 'carlos@empresa.com', titulo: 'VPN nao conecta' },
      { numero: 1001, requester: 'marina@empresa.com', titulo: 'VPN nao conecta hoje' },
    ])

    const dela = await sugerir({ texto: 'VPN nao conecta' }, marina)
    const dele = await sugerir({ texto: 'VPN nao conecta' }, bruno)

    expect(dela.parecidos.map((p) => p.numero)).toEqual([1001])
    // O Agente ve os dois — para ele a FR-12 funciona como imaginada.
    expect(dele.parecidos.map((p) => p.numero)).toEqual([1000, 1001])
  })
})

/**
 * O SQL, ISOLADO do gargalo (AC #2, #3, #4).
 *
 * Pela saida, remover o escopo do `WHERE` ou incluir excluidos nao muda nada:
 * `filaVisivelPara` corrige as duas coisas. E o mesmo mascaramento das Stories
 * 3.1, 3.2 e 3.4 — aqui ele apareceu em QUATRO mutacoes de uma vez.
 *
 * Abrir o embrulho com um AGENTE e o que isola: o que sobrar veio do SQL.
 */
describe('o WHERE da sugestao, sem a rede do dominio', () => {
  it('a consulta com escopo apenasDe ja volta sem Chamado de terceiro (AC #2)', async () => {
    await inserir([
      { numero: 1000, requester: 'carlos@empresa.com', titulo: 'VPN nao conecta' },
      { numero: 1001, requester: 'marina@empresa.com', titulo: 'VPN nao conecta hoje' },
    ])

    const bruta = await repositorio.buscarParecidosBruto({
      escopo: { tipo: 'apenasDe', requester: 'marina@empresa.com' },
      texto: 'VPN nao conecta',
      limiar: LIMIAR_DE_SEMELHANCA,
      limite: 5,
    })

    expect(filaVisivelPara(bruno, bruta).itens.map((i) => i.number)).toEqual([1001])
  })

  /**
   * Abrir com um Agente NAO isola aqui: `podeVerTicket` tambem descarta
   * excluido, entao o gargalo esconde a falta do filtro no SQL — foi assim que
   * a mutacao sobreviveu na primeira rodada.
   *
   * A sonda e o LIMITE, que corta ANTES do gargalo. Com `limite: 1` e o
   * excluido sendo o mais parecido: com o filtro no lugar, volta o vivo; sem
   * ele, o excluido ocupa a unica vaga e o dominio o descarta — resultado
   * VAZIO.
   */
  it('a consulta ja volta sem Chamado excluido, e o limite prova isso (AC #4)', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', titulo: 'VPN nao conecta', excluido: true },
      { numero: 1001, requester: 'marina@empresa.com', titulo: 'VPN nao conecta hoje cedo' },
    ])

    const bruta = await repositorio.buscarParecidosBruto({
      escopo: { tipo: 'todos' },
      texto: 'VPN nao conecta',
      limiar: LIMIAR_DE_SEMELHANCA,
      limite: 1,
    })

    expect(filaVisivelPara(bruno, bruta).itens.map((i) => i.number)).toEqual([1001])
  })

  it('a consulta ja volta sem Chamado excluido (AC #4)', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', titulo: 'VPN nao conecta', excluido: true },
      { numero: 1001, requester: 'marina@empresa.com', titulo: 'VPN nao conecta hoje' },
    ])

    const bruta = await repositorio.buscarParecidosBruto({
      escopo: { tipo: 'todos' },
      texto: 'VPN nao conecta',
      limiar: LIMIAR_DE_SEMELHANCA,
      limite: 5,
    })

    expect(filaVisivelPara(bruno, bruta).itens.map((i) => i.number)).toEqual([1001])
  })

  /**
   * O limiar EXPLICITO existe porque o operador `%` filtra pelo
   * `pg_trgm.similarity_threshold`, que e configuracao de SESSAO. Baixando o
   * threshold, o `%` deixa passar coisa pouco parecida — e o `similarity() >=
   * limiar` e o unico que ainda segura.
   *
   * Sem este teste, a mutacao que remove o limiar explicito sobrevive, porque
   * na sessao padrao os dois valores coincidem (0.3).
   */
  it('o limiar explicito segura mesmo com o threshold da sessao baixo (AC #3)', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', titulo: 'Impressora sem toner na sala' },
    ])

    await db.execute(sql`SET pg_trgm.similarity_threshold = 0.05`)
    try {
      const bruta = await repositorio.buscarParecidosBruto({
        escopo: { tipo: 'todos' },
        texto: 'VPN nao conecta',
        limiar: LIMIAR_DE_SEMELHANCA,
        limite: 5,
      })

      expect(filaVisivelPara(bruno, bruta).itens).toEqual([])
    } finally {
      await db.execute(sql`RESET pg_trgm.similarity_threshold`)
    }
  })
})

describe('nada parecido e resposta (AC #3)', () => {
  it('devolve lista vazia em vez do menos diferente', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', titulo: 'Impressora sem toner' },
    ])

    const saida = await sugerir({ texto: 'Notebook nao liga' }, marina)

    expect(saida.parecidos).toEqual([])
  })

  it('texto curto demais e recusado pelo dominio', async () => {
    await expect(sugerir({ texto: 'ab' }, marina)).rejects.toThrow(/caracteres|termo/i)
  })
})

describe('encerrados entram, excluidos nao (AC #4)', () => {
  /** "Ja resolvemos isso" e a resposta mais util que a sugestao pode dar. */
  it('Chamado fechado aparece como parecido', async () => {
    await inserir([
      {
        numero: 1000,
        requester: 'marina@empresa.com',
        titulo: 'VPN nao conecta',
        status: 'fechado',
      },
    ])

    const saida = await sugerir({ texto: 'VPN nao conecta' }, marina)

    expect(saida.parecidos.map((p) => p.numero)).toEqual([1000])
  })

  it('Chamado excluido nao aparece', async () => {
    await inserir([
      {
        numero: 1000,
        requester: 'marina@empresa.com',
        titulo: 'VPN nao conecta',
        excluido: true,
      },
    ])

    expect((await sugerir({ texto: 'VPN nao conecta' }, marina)).parecidos).toEqual([])
  })
})

describe('a sugestao e conselho, nao gate (AC #5)', () => {
  /**
   * FR-12: nao bloqueia a abertura. Hoje isso sai de graca — a tool e separada
   * e `abrir_chamado` nao a consulta. O teste existe para que continue assim: se
   * um dia a abertura passar a sugerir, a falha da sugestao NAO pode propagar
   * (mesmo padrao do e-mail na 1.6/2.5).
   */
  it('abrir Chamado nao depende da sugestao', async () => {
    await inserir([{ numero: 1000, requester: 'marina@empresa.com', titulo: 'VPN nao conecta' }])

    const aberto = await abrirChamado({ repositorio })(
      { titulo: 'VPN nao conecta', descricao: 'De novo.', categoria: 'rede' },
      marina,
    )

    expect(aberto.number).toBeGreaterThan(0)
    expect(aberto.status).toBe('aberto')
  })
})

describe('a sugestao usa o indice de trigramas (AC #6)', () => {
  /**
   * Licao da 3.4: indice de texto so se prova com TEXTO DE VERDADE e volume.
   * Com titulo curto e poucas linhas, o planejador varre — e acerta.
   */
  beforeEach(async () => {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester)
      SELECT
        i,
        'Chamado sobre problema recorrente numero ' || i || ' na estacao de trabalho',
        'descricao do problema relatado',
        'hardware', 'aberto', 'media',
        'pessoa' || (i % 200) || '@empresa.com'
      FROM generate_series(1, 20000) AS i
    `)
    await db.execute(sql`ANALYZE tickets`)
  })

  it('o operador % usa tickets_busca_titulo_idx', async () => {
    const linhas = await db.execute(sql`
      EXPLAIN SELECT number FROM tickets
       WHERE deleted_at IS NULL AND titulo % 'problema no notebook da recepcao'
       ORDER BY similarity(titulo, 'problema no notebook da recepcao') DESC LIMIT 5
    `)
    const texto = linhas.map((l) => String(Object.values(l)[0])).join('\n')

    expect(texto).toContain('tickets_busca_titulo_idx')
    expect(texto).not.toContain('Seq Scan')
  })
})
