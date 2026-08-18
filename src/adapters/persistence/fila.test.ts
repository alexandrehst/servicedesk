import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buscarChamadosInputSchema } from '../../application/contracts/buscar-chamados.js'
import type { Principal } from '../../application/contracts/principal.js'
import { buscarChamados } from '../../application/queries/buscar-chamados.js'
import { filaVisivelPara } from '../../domain/visibilidade.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * A Fila contra o Postgres REAL (Story 3.1).
 *
 * O `WHERE` do escopo, o filtro de excluidos, a ordem estavel e a paginacao sao
 * do BANCO. Com duble, cada um deles seria apenas o que o duble foi programado
 * para fazer — e o modo de falha desta story e silencioso: uma lista com
 * Chamado alheio vem ordenada, filtrada e plausivel.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 4 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

const buscar = buscarChamados({ repositorio })
const padrao = buscarChamadosInputSchema.parse({})

/**
 * Insere direto no banco: esta suite precisa de CONTROLE sobre `criado_em`,
 * `status` e `requester`, e abrir pelo command daria `now()` e `aberto` para
 * todos — nao daria para testar ordem nem filtro.
 */
const inserir = async (
  linhas: {
    numero: number
    requester: string
    status?: string
    categoria?: string
    assignee?: string | null
    prioridade?: string
    criadoEm?: string
    excluido?: boolean
  }[],
) => {
  for (const l of linhas) {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester, assignee, criado_em, deleted_at)
      VALUES (
        ${l.numero}, ${`Chamado ${l.numero}`}, 'descricao longa que a Fila NAO devolve',
        ${l.categoria ?? 'hardware'}, ${l.status ?? 'aberto'}, ${l.prioridade ?? 'media'},
        ${l.requester}, ${l.assignee ?? null},
        ${l.criadoEm ?? '2026-08-18T09:00:00Z'}, ${l.excluido === true ? sql`now()` : null}
      )
    `)
  }
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments RESTART IDENTITY`)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('o escopo, no WHERE (AC #2)', () => {
  /**
   * O teste que o epico inteiro precisa: DUAS identidades com dados de AMBAS no
   * banco. "O Solicitante ve os dele" passaria mesmo com o filtro quebrado se
   * so houvesse dados dele.
   */
  it('o Solicitante nao alcanca Chamado de terceiro', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'carlos@empresa.com' },
      { numero: 1002, requester: 'marina@empresa.com' },
    ])

    const saida = await buscar(padrao, marina)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1002])
  })

  it('cada Solicitante ve a propria fatia, e nenhuma linha se cruza', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'carlos@empresa.com' },
    ])

    const daMarina = await buscar(padrao, marina)
    const doCarlos = await buscar(padrao, carlos)

    expect(daMarina.itens.map((i) => i.numero)).toEqual([1000])
    expect(doCarlos.itens.map((i) => i.numero)).toEqual([1001])
  })

  it('o Agente alcanca a Fila inteira', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'carlos@empresa.com' },
    ])

    expect((await buscar(padrao, bruno)).itens).toHaveLength(2)
  })
})

/**
 * O `WHERE` do escopo, ISOLADO do gargalo do dominio (AC #2, #3).
 *
 * Pela saida da query, remover o `WHERE` nao muda NADA: `filaVisivelPara`
 * corrige, e era esse o desenho. Mas entao o `WHERE` fica sem teste — e uma
 * mutacao que o removesse sobreviveria, exatamente como aconteceu na primeira
 * rodada desta story.
 *
 * A saida e a mesma da Story 2.2 com o `deleted_at IS NULL` do UPDATE: chamar o
 * REPOSITORIO direto. Aqui o embrulho e aberto com um AGENTE, que ve tudo —
 * entao o que sobrar veio do SQL, nao do dominio.
 */
describe('o WHERE do escopo, sem a rede do dominio (AC #2, #3)', () => {
  it('a consulta com escopo apenasDe ja volta sem Chamado de terceiro', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'carlos@empresa.com' },
    ])

    const bruta = await repositorio.buscarFilaBruta(
      { tipo: 'apenasDe', requester: 'marina@empresa.com' },
      {},
      { limite: 20, deslocamento: 0, ordem: 'asc' },
    )

    // Aberto por um AGENTE: se o `WHERE` tivesse deixado passar, apareceria.
    expect(filaVisivelPara(bruno, bruta).itens.map((i) => i.number)).toEqual([1000])
  })

  /**
   * Aqui abrir com um Agente NAO isola nada: `podeVerTicket` tambem descarta
   * excluido, entao o gargalo esconderia a falta do `WHERE`. Quem denuncia e o
   * `temMais` — ele vem do SQL (`limite + 1` linhas) e o dominio NAO o
   * recalcula.
   *
   * Com limite 1 e apenas UM Chamado vivo: se o `deleted_at IS NULL` estiver no
   * lugar, o banco acha 1 linha e `temMais` e falso. Sem ele, acha 2 e diz que
   * ha mais — uma pagina seguinte que nao existe.
   */
  it('a consulta ja volta sem Chamado excluido, e o temMais prova isso', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'marina@empresa.com', excluido: true },
    ])

    const bruta = await repositorio.buscarFilaBruta(
      { tipo: 'todos' },
      {},
      { limite: 1, deslocamento: 0, ordem: 'asc' },
    )

    const visivel = filaVisivelPara(bruno, bruta)
    expect(visivel.itens.map((i) => i.number)).toEqual([1000])
    expect(visivel.temMais).toBe(false)
  })
})

describe('Chamado excluido nao aparece (AC #3)', () => {
  it('nem para o dono, nem para o Agente', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'marina@empresa.com', excluido: true },
    ])

    expect((await buscar(padrao, marina)).itens.map((i) => i.numero)).toEqual([1000])
    expect((await buscar(padrao, bruno)).itens.map((i) => i.numero)).toEqual([1000])
  })
})

describe('filtros combinados (AC #1)', () => {
  beforeEach(async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', status: 'aberto', categoria: 'rede' },
      {
        numero: 1001,
        requester: 'marina@empresa.com',
        status: 'em_andamento',
        categoria: 'rede',
        assignee: 'bruno@empresa.com',
      },
      { numero: 1002, requester: 'carlos@empresa.com', status: 'aberto', categoria: 'hardware' },
      {
        numero: 1003,
        requester: 'carlos@empresa.com',
        status: 'em_andamento',
        categoria: 'rede',
        assignee: 'ana@empresa.com',
      },
    ])
  })

  it('filtra por status', async () => {
    const saida = await buscar({ ...padrao, status: 'aberto' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1002])
  })

  it('filtra por dono', async () => {
    const saida = await buscar({ ...padrao, dono: 'bruno@empresa.com' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1001])
  })

  it('filtra por categoria', async () => {
    const saida = await buscar({ ...padrao, categoria: 'rede' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1001, 1003])
  })

  it('combina os tres', async () => {
    const saida = await buscar(
      { ...padrao, status: 'em_andamento', categoria: 'rede', dono: 'ana@empresa.com' },
      bruno,
    )

    expect(saida.itens.map((i) => i.numero)).toEqual([1003])
  })

  /** O filtro NAO pode furar o escopo: eles se combinam, nao competem. */
  it('o filtro do Solicitante continua dentro do escopo dele', async () => {
    const saida = await buscar({ ...padrao, categoria: 'rede' }, marina)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1001])
  })
})

describe('a linha da Fila vem do banco, e e resumo (AC #1)', () => {
  /**
   * Sem esta assercao, trocar `titulo` por `descricao` no SELECT sobrevive a
   * suite inteira: o teste unitario usa duble, e os demais testes daqui so
   * olham Numeros. Foi uma mutacao sobrevivente na primeira rodada.
   */
  it('cada campo vem da coluna certa', async () => {
    await inserir([
      {
        numero: 1042,
        requester: 'marina@empresa.com',
        status: 'em_andamento',
        prioridade: 'alta',
        assignee: 'bruno@empresa.com',
        criadoEm: '2026-08-18T09:00:00Z',
      },
    ])

    const saida = await buscar(padrao, bruno)

    expect(saida.itens[0]).toEqual({
      numero: 1042,
      titulo: 'Chamado 1042',
      status: 'em_andamento',
      prioridade: 'alta',
      dono: 'bruno@empresa.com',
      criadoEm: '2026-08-18T09:00:00.000Z',
    })
  })

  /** O resumo NAO carrega a Descricao — nem no tipo, nem por acidente. */
  it('a Descricao nao viaja na Fila', async () => {
    await inserir([{ numero: 1000, requester: 'marina@empresa.com' }])

    const saida = await buscar(padrao, marina)

    expect(JSON.stringify(saida)).not.toContain('descricao longa')
  })
})

describe('ordem estavel (AC #5)', () => {
  /**
   * Insere FORA de ordem, com timestamps IGUAIS: sem o desempate por Numero, o
   * Postgres devolve na ordem fisica e o teste passa por acaso — ate parar de
   * passar (licao da 1.2).
   */
  it('desempata por Numero quando a data e a mesma', async () => {
    await inserir([
      { numero: 1003, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
      { numero: 1001, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
      { numero: 1002, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
    ])

    const saida = await buscar(padrao, marina)

    expect(saida.itens.map((i) => i.numero)).toEqual([1001, 1002, 1003])
  })

  it('o mais antigo vem primeiro por padrao, como se atende uma fila', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', criadoEm: '2026-08-18T12:00:00Z' },
      { numero: 1001, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
    ])

    expect((await buscar(padrao, marina)).itens.map((i) => i.numero)).toEqual([1001, 1000])
  })

  it('ordem desc inverte, mantendo o desempate', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
      { numero: 1001, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
    ])

    const saida = await buscar({ ...padrao, ordem: 'desc' }, marina)

    expect(saida.itens.map((i) => i.numero)).toEqual([1001, 1000])
  })
})

describe('paginacao (AC #4)', () => {
  beforeEach(async () => {
    await inserir(
      Array.from({ length: 25 }, (_, i) => ({
        numero: 1000 + i,
        requester: 'marina@empresa.com',
        criadoEm: `2026-08-18T09:${String(i).padStart(2, '0')}:00Z`,
      })),
    )
  })

  it('o padrao devolve 20 e avisa que ha mais', async () => {
    const saida = await buscar(padrao, marina)

    expect(saida.itens).toHaveLength(20)
    expect(saida.temMais).toBe(true)
  })

  it('a ultima pagina nao mente sobre haver mais', async () => {
    const saida = await buscar({ ...padrao, deslocamento: 20 }, marina)

    expect(saida.itens).toHaveLength(5)
    expect(saida.temMais).toBe(false)
  })

  /** Ordem estavel + deslocamento: nenhuma linha se repete nem some. */
  it('as paginas nao se sobrepoem nem deixam buraco', async () => {
    const p1 = await buscar({ ...padrao, limite: 10 }, marina)
    const p2 = await buscar({ ...padrao, limite: 10, deslocamento: 10 }, marina)
    const p3 = await buscar({ ...padrao, limite: 10, deslocamento: 20 }, marina)

    const todos = [...p1.itens, ...p2.itens, ...p3.itens].map((i) => i.numero)

    expect(new Set(todos).size).toBe(25)
    expect(todos).toEqual([...todos].sort((a, b) => a - b))
  })
})

describe('o teto do limite e do CONTRATO (AC #4)', () => {
  /**
   * Recusa, e nao truncamento: pedir 500 e receber 100 em silencio faria a IA
   * concluir que viu tudo.
   */
  it('limite acima de 100 e recusado pelo schema', () => {
    expect(buscarChamadosInputSchema.safeParse({ limite: 101 }).success).toBe(false)
    expect(buscarChamadosInputSchema.safeParse({ limite: 100 }).success).toBe(true)
  })

  it('os defaults sao 20, 0 e asc', () => {
    expect(buscarChamadosInputSchema.parse({})).toEqual({
      limite: 20,
      deslocamento: 0,
      ordem: 'asc',
    })
  })
})

describe('a Fila usa INDICE, nao varredura (AC #6)', () => {
  /**
   * O pilar Performatico nunca foi exercitado neste projeto (QUALITY-GATE
   * §3.1). Este e o primeiro teste que o toca — e ele so significa alguma coisa
   * COM VOLUME: com 20 linhas o planejador escolhe `Seq Scan` de qualquer jeito,
   * porque ler a tabela inteira e mais barato que consultar o indice.
   *
   * `enable_seqscan = off` NAO e opcao: testaria o `SET`, nao o indice.
   */
  beforeEach(async () => {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester, criado_em)
      SELECT
        i, 'Chamado ' || i, 'descricao', 'hardware',
        CASE WHEN i % 50 = 0 THEN 'resolvido' ELSE 'aberto' END,
        'media',
        'pessoa' || (i % 200) || '@empresa.com',
        now() - (i || ' minutes')::interval
      FROM generate_series(1, 5000) AS i
    `)
    await db.execute(sql`ANALYZE tickets`)
  })

  const plano = async (consulta: ReturnType<typeof sql>): Promise<string> => {
    const linhas = await db.execute(consulta)
    return linhas.map((l) => String(Object.values(l)[0])).join('\n')
  }

  it('o filtro por status seletivo usa Index Scan', async () => {
    const texto = await plano(sql`
      EXPLAIN SELECT number FROM tickets
       WHERE deleted_at IS NULL AND status = 'resolvido'
       ORDER BY criado_em, number LIMIT 21
    `)

    expect(texto).toContain('tickets_fila_status_idx')
    expect(texto).not.toContain('Seq Scan')
  })

  it('o escopo do Solicitante usa Index Scan', async () => {
    const texto = await plano(sql`
      EXPLAIN SELECT number FROM tickets
       WHERE deleted_at IS NULL AND requester = 'pessoa7@empresa.com'
       ORDER BY criado_em, number LIMIT 21
    `)

    expect(texto).toContain('tickets_fila_requester_idx')
    expect(texto).not.toContain('Seq Scan')
  })
})
