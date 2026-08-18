import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Principal } from '../../application/contracts/principal.js'
import { resumoFila } from '../../application/queries/resumo-fila.js'
import { ehDomainError } from '../../domain/errors.js'
import { resumoVisivelPara } from '../../domain/visibilidade.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * O resumo contra o Postgres REAL (Story 3.3, FR-10).
 *
 * Aqui NAO ha segunda camada: se o `WHERE` do escopo errar, os numeros saem
 * errados e nada os corrige. Um contador tambem nao mostra de quem sao os
 * Chamados — `{ aberto: 47 }` parece certo para qualquer um. Por isso todo teste
 * tem DUAS identidades com dados de ambas.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 4 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const resumir = resumoFila({ repositorio })

const inserir = async (
  linhas: {
    numero: number
    requester: string
    status?: string
    categoria?: string
    assignee?: string | null
    excluido?: boolean
  }[],
) => {
  for (const l of linhas) {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester, assignee, deleted_at)
      VALUES (
        ${l.numero}, ${`Chamado ${l.numero}`}, 'descricao', ${l.categoria ?? 'hardware'},
        ${l.status ?? 'aberto'}, 'media', ${l.requester}, ${l.assignee ?? null},
        ${l.excluido === true ? sql`now()` : null}
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

describe('os tres eixos (AC #1)', () => {
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
      {
        numero: 1002,
        requester: 'carlos@empresa.com',
        status: 'aberto',
        categoria: 'hardware',
      },
      {
        numero: 1003,
        requester: 'carlos@empresa.com',
        status: 'resolvido',
        categoria: 'software',
        assignee: 'ana@empresa.com',
      },
    ])
  })

  it('conta por Status', async () => {
    const resumo = await resumir({}, bruno)

    expect(resumo.porStatus).toEqual({
      aberto: 2,
      em_andamento: 1,
      resolvido: 1,
      fechado: 0,
      cancelado: 0,
    })
  })

  it('conta por Categoria', async () => {
    const resumo = await resumir({}, bruno)

    expect(resumo.porCategoria).toEqual({
      hardware: 1,
      software: 1,
      rede: 2,
      acesso: 0,
      nao_classificado: 0,
    })
  })

  it('conta por Dono, e os sem Dono a parte (AC #4)', async () => {
    const resumo = await resumir({}, bruno)

    expect(resumo.porDono).toEqual({ 'bruno@empresa.com': 1, 'ana@empresa.com': 1 })
    expect(resumo.semDono).toBe(2)
  })

  /**
   * `null` como chave viraria a string "null" em JSON e colidiria com uma
   * identidade chamada assim — alem de esconder o gargalo que motiva o resumo.
   */
  it('nunca usa null como chave em porDono', async () => {
    const resumo = await resumir({}, bruno)

    expect(Object.keys(resumo.porDono)).not.toContain('null')
    expect(JSON.stringify(resumo.porDono)).not.toContain('null')
  })
})

describe('zero e resposta; ausencia nao (AC #5)', () => {
  it('todos os Status e Categorias aparecem, mesmo sem Chamado', async () => {
    await inserir([{ numero: 1000, requester: 'marina@empresa.com' }])

    const resumo = await resumir({}, bruno)

    expect(Object.keys(resumo.porStatus).sort()).toEqual(
      ['aberto', 'cancelado', 'em_andamento', 'fechado', 'resolvido'].sort(),
    )
    expect(resumo.porStatus.resolvido).toBe(0)
    expect(resumo.porCategoria.acesso).toBe(0)
  })

  it('a Fila vazia devolve zeros, nao objeto vazio', async () => {
    const resumo = await resumir({}, bruno)

    expect(resumo.porStatus.aberto).toBe(0)
    expect(resumo.semDono).toBe(0)
    expect(resumo.porDono).toEqual({})
  })
})

describe('o resumo mede CARGA (AC #3)', () => {
  it('encerrados e excluidos ficam de fora', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', status: 'aberto' },
      { numero: 1001, requester: 'marina@empresa.com', status: 'fechado' },
      { numero: 1002, requester: 'marina@empresa.com', status: 'cancelado' },
      { numero: 1003, requester: 'marina@empresa.com', status: 'aberto', excluido: true },
    ])

    const resumo = await resumir({}, bruno)

    expect(resumo.porStatus).toEqual({
      aberto: 1,
      em_andamento: 0,
      resolvido: 0,
      fechado: 0,
      cancelado: 0,
    })
  })

  /** `resolvido` ENTRA: ainda pode ser reaberto e e trabalho aguardando confirmacao. */
  it('resolvido continua sendo carga', async () => {
    await inserir([{ numero: 1000, requester: 'marina@empresa.com', status: 'resolvido' }])

    expect((await resumir({}, bruno)).porStatus.resolvido).toBe(1)
  })
})

describe('um contador e um oraculo (AC #2)', () => {
  beforeEach(async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', assignee: 'bruno@empresa.com' },
      { numero: 1001, requester: 'carlos@empresa.com' },
      { numero: 1002, requester: 'carlos@empresa.com' },
    ])
  })

  /**
   * O teste central: o Solicitante conta so os DELE. Sem duas identidades no
   * banco, "1 chamado" passaria com o `WHERE` do escopo removido.
   */
  it('o Solicitante conta apenas os proprios Chamados', async () => {
    const dela = await resumir({}, marina)
    const dele = await resumir({}, bruno)

    expect(dela.porStatus.aberto).toBe(1)
    expect(dele.porStatus.aberto).toBe(3)
  })

  it('o eixo por Dono tambem respeita o escopo', async () => {
    const dela = await resumir({}, marina)

    // O Chamado dela tem Dono; os do carlos, nao. Se o escopo vazasse, `semDono`
    // seria 2.
    expect(dela.porDono).toEqual({ 'bruno@empresa.com': 1 })
    expect(dela.semDono).toBe(0)
  })

  /**
   * A verificacao que substitui a segunda camada: se alguem montar o resumo com
   * escopo mais amplo — por engano ou por refatoracao — o dominio RECUSA, em vez
   * de devolver numeros da base inteira.
   */
  it('resumo montado com escopo alheio e recusado pelo dominio', async () => {
    const bruto = await repositorio.buscarResumoBruto({ tipo: 'todos' })

    let capturado: unknown
    try {
      resumoVisivelPara(marina, bruto)
    } catch (erro) {
      capturado = erro
    }

    expect(ehDomainError(capturado) && capturado.code).toBe('EscopoDivergente')
  })

  it('o escopo volta do adapter junto dos numeros', async () => {
    const bruto = await repositorio.buscarResumoBruto({
      tipo: 'apenasDe',
      requester: 'marina@empresa.com',
    })

    // Abre com a propria marina: o escopo confere, e os numeros sao os dela.
    expect(resumoVisivelPara(marina, bruto).contadores.porStatus.aberto).toBe(1)
  })
})

describe('as agregacoes usam indice (AC #6)', () => {
  /**
   * Padrao da 3.1: volume, e dados gerados no `INSERT` — na 3.2 um `UPDATE`
   * posterior criou bloat e o planejador passou a preferir varredura, reprovando
   * o teste por um motivo que nao era o indice.
   *
   * Testa-se o eixo do ESCOPO (o `WHERE` de um Solicitante), que e o seletivo.
   * Agregar a Fila inteira de um Agente varre mesmo — e varrer, ali, e a escolha
   * certa do planejador.
   */
  beforeEach(async () => {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester, assignee)
      SELECT
        i, 'Chamado ' || i, 'descricao', 'hardware',
        CASE WHEN i % 50 = 0 THEN 'fechado' ELSE 'aberto' END,
        'media',
        'pessoa' || (i % 200) || '@empresa.com',
        CASE WHEN i % 10 = 0 THEN NULL ELSE 'agente' || (i % 8) || '@empresa.com' END
      FROM generate_series(1, 5000) AS i
    `)
    await db.execute(sql`ANALYZE tickets`)
  })

  it('a agregacao no escopo de um Solicitante usa Index Scan', async () => {
    const linhas = await db.execute(sql`
      EXPLAIN SELECT status, count(*) FROM tickets
       WHERE deleted_at IS NULL AND requester = 'pessoa7@empresa.com'
         AND status NOT IN ('fechado', 'cancelado')
       GROUP BY status
    `)
    const texto = linhas.map((l) => String(Object.values(l)[0])).join('\n')

    expect(texto).toContain('tickets_fila_requester_idx')
    expect(texto).not.toContain('Seq Scan')
  })
})
