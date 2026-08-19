import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { exportarCsvInputSchema } from '../../application/contracts/exportar-csv.js'
import type { Principal } from '../../application/contracts/principal.js'
import { exportarCsv } from '../../application/queries/exportar-csv.js'
import { exportacaoVisivelPara } from '../../domain/visibilidade.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * O export contra o Postgres REAL (Story 4.1, FR-24).
 *
 * O que se prova aqui e o `WHERE` — e ele importa mais que nas leituras
 * anteriores: um vazamento na Fila aparece numa tela e some; num CSV, vira
 * arquivo, e arquivo e encaminhado.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 4 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const exportar = exportarCsv({ repositorio })
const padrao = exportarCsvInputSchema.parse({})

const inserir = async (
  linhas: {
    numero: number
    requester: string
    titulo?: string
    descricao?: string
    status?: string
    categoria?: string
    assignee?: string | null
    numeroLegado?: string
    excluido?: boolean
  }[],
) => {
  for (const l of linhas) {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester, assignee, criado_em, deleted_at, numero_legado)
      VALUES (
        ${l.numero}, ${l.titulo ?? `Chamado ${l.numero}`}, ${l.descricao ?? 'descricao'},
        ${l.categoria ?? 'hardware'}, ${l.status ?? 'aberto'}, 'media',
        ${l.requester}, ${l.assignee ?? null}, '2026-08-19T09:00:00Z',
        ${l.excluido === true ? sql`now()` : null}, ${l.numeroLegado ?? null}
      )
    `)
  }
}

const linhasDo = (csv: string) => csv.split('\n').slice(1)

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments RESTART IDENTITY`)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('o arquivo tem os campos do Chamado (AC #1)', () => {
  it('cabecalho e uma linha por Chamado, com Descricao e numero legado', async () => {
    await inserir([
      {
        numero: 1042,
        requester: 'marina@empresa.com',
        titulo: 'VPN nao conecta',
        descricao: 'Sem acesso remoto desde ontem.',
        categoria: 'rede',
        status: 'em_andamento',
        assignee: 'bruno@empresa.com',
        numeroLegado: 'INC-4711',
      },
    ])

    const saida = await exportar(padrao, bruno)

    expect(saida.csv.split('\n')[0]).toBe(
      'numero,titulo,descricao,categoria,status,prioridade,solicitante,dono,criado_em,numero_legado',
    )
    expect(saida.csv.split('\n')[1]).toBe(
      '1042,VPN nao conecta,Sem acesso remoto desde ontem.,rede,em_andamento,media,marina@empresa.com,bruno@empresa.com,2026-08-19T09:00:00.000Z,INC-4711',
    )
    expect(saida.linhas).toBe(1)
  })

  it('Chamado sem Dono e sem numero legado deixa os campos vazios', async () => {
    await inserir([{ numero: 1000, requester: 'marina@empresa.com' }])

    const linha = linhasDo((await exportar(padrao, bruno)).csv)[0] ?? ''

    // Dois campos vazios no fim: `dono` e `numero_legado` — e nao "null".
    expect(linha).toContain(',,2026-08-19T09:00:00.000Z,')
    expect(linha).not.toContain('null')
  })
})

describe('o escopo vale, e aqui vira arquivo (AC #2)', () => {
  beforeEach(async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'carlos@empresa.com' },
    ])
  })

  it('o Solicitante exporta apenas os proprios Chamados', async () => {
    const dela = await exportar(padrao, marina)

    expect(dela.linhas).toBe(1)
    expect(dela.csv).toContain('marina@empresa.com')
    expect(dela.csv).not.toContain('carlos@empresa.com')
  })

  it('o Agente exporta a base', async () => {
    expect((await exportar(padrao, bruno)).linhas).toBe(2)
  })

  /**
   * O gargalo do dominio esconde erro no `WHERE` — como nas Stories 3.1, 3.2,
   * 3.4 e 3.5. Chamar o repositorio direto e abrir com um AGENTE isola o SQL.
   */
  it('a consulta ja volta sem Chamado de terceiro', async () => {
    const bruta = await repositorio.buscarParaExportarBruto(
      { tipo: 'apenasDe', requester: 'marina@empresa.com' },
      { dono: { tipo: 'qualquer' } },
      { limite: 100, deslocamento: 0 },
    )

    expect(exportacaoVisivelPara(bruno, bruta).itens.map((i) => i.number)).toEqual([1000])
  })
})

describe('os filtros da Fila valem no export (AC #1)', () => {
  beforeEach(async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', status: 'aberto', categoria: 'rede' },
      {
        numero: 1001,
        requester: 'marina@empresa.com',
        status: 'fechado',
        categoria: 'rede',
        assignee: 'bruno@empresa.com',
      },
      { numero: 1002, requester: 'marina@empresa.com', status: 'aberto', categoria: 'hardware' },
    ])
  })

  it.each([
    [{ status: 'aberto' as const }, [1000, 1002]],
    [{ categoria: 'rede' as const }, [1000, 1001]],
    [{ dono: 'bruno@empresa.com' }, [1001]],
    [{ recorte: 'sem_dono' as const }, [1000, 1002]],
  ])('filtro %j cobre os Chamados certos', async (filtro, esperados) => {
    const saida = await exportar({ ...padrao, ...filtro }, bruno)

    expect(linhasDo(saida.csv).map((l) => Number(l.split(',')[0]))).toEqual(esperados)
  })

  it('a busca por texto tambem filtra o export', async () => {
    const saida = await exportar({ ...padrao, texto: 'Chamado 1002' }, bruno)

    expect(saida.linhas).toBe(1)
  })
})

describe('excluidos ficam fora (AC #6)', () => {
  it('nem para o Agente', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'marina@empresa.com', excluido: true },
    ])

    const saida = await exportar(padrao, bruno)

    expect(saida.linhas).toBe(1)
    expect(saida.csv).not.toContain('1001')
  })
})

/**
 * Abrir com um Agente NAO isola o filtro de excluidos: `podeVerTicket` tambem os
 * descarta, e o gargalo esconde a falta do `WHERE` (foi assim que a mutacao
 * sobreviveu na primeira rodada). A sonda e o `temMais`, que vem do SQL
 * (`limite + 1` linhas) e o dominio NAO recalcula.
 */
describe('o filtro de excluidos, isolado do gargalo (AC #6)', () => {
  it('com limite 1 e um excluido, o temMais denuncia o filtro ausente', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'marina@empresa.com', excluido: true },
    ])

    const bruta = await repositorio.buscarParaExportarBruto(
      { tipo: 'todos' },
      { dono: { tipo: 'qualquer' } },
      { limite: 1, deslocamento: 0 },
    )

    const visivel = exportacaoVisivelPara(bruno, bruta)
    expect(visivel.itens.map((i) => i.number)).toEqual([1000])
    expect(visivel.temMais).toBe(false)
  })
})

describe('paginacao sem truncar em silencio (AC #5)', () => {
  beforeEach(async () => {
    await inserir(
      Array.from({ length: 5 }, (_, i) => ({
        numero: 1000 + i,
        requester: 'marina@empresa.com',
      })),
    )
  })

  it('avisa que ha mais', async () => {
    const saida = await exportar({ ...padrao, limite: 2 }, bruno)

    expect(saida.linhas).toBe(2)
    expect(saida.temMais).toBe(true)
  })

  it('a ultima pagina nao mente', async () => {
    const saida = await exportar({ ...padrao, limite: 2, deslocamento: 4 }, bruno)

    expect(saida.linhas).toBe(1)
    expect(saida.temMais).toBe(false)
  })

  /**
   * O cabecalho repetido no meio do arquivo o corrompe: quem junta as paginas
   * pede `cabecalho: false` da segunda em diante.
   */
  it('as paginas se juntam num arquivo valido', async () => {
    const p1 = await exportar({ ...padrao, limite: 3 }, bruno)
    const p2 = await exportar({ ...padrao, limite: 3, deslocamento: 3, cabecalho: false }, bruno)

    const arquivo = `${p1.csv}\n${p2.csv}`

    expect(arquivo.split('\n')).toHaveLength(6)
    expect(arquivo.split('\n').filter((l) => l.startsWith('numero,'))).toHaveLength(1)
  })

  it('o teto e do contrato, e recusa em vez de truncar', () => {
    expect(exportarCsvInputSchema.safeParse({ limite: 5001 }).success).toBe(false)
    expect(exportarCsvInputSchema.safeParse({ limite: 5000 }).success).toBe(true)
  })
})

describe('o dado real passa pelo escape (AC #3, #4)', () => {
  /**
   * O `platform/csv` tem os testes unitarios; aqui prova-se que o caminho REAL
   * — banco, query, montagem — preserva o tratamento.
   */
  it('Titulo com virgula e aspas sai escapado', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', titulo: 'Erro "grave", urgente' },
    ])

    const linha = linhasDo((await exportar(padrao, bruno)).csv)[0] ?? ''

    expect(linha).toContain('"Erro ""grave"", urgente"')
  })

  /** O Titulo vem do Solicitante: e entrada de usuario indo para uma planilha. */
  it('Titulo que comeca com = nao vira formula', async () => {
    await inserir([{ numero: 1000, requester: 'marina@empresa.com', titulo: '=cmd|calc' }])

    const linha = linhasDo((await exportar(padrao, bruno)).csv)[0] ?? ''

    expect(linha).toContain("'=cmd|calc")
  })
})
