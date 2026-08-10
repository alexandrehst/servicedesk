import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auditEntries, comments, tickets } from '../../../drizzle/schema.js'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { excluirChamado } from '../../application/commands/excluir-chamado.js'
import type { Principal } from '../../application/contracts/principal.js'
import { verChamado } from '../../application/queries/ver-chamado.js'
import { ehDomainError } from '../../domain/errors.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Integracao com Postgres REAL. O ponto inteiro desta story e o que sobra no
 * banco depois da exclusao — e isso so se ve olhando a tabela.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 5 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const entrada = {
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
} as const

const erroDe = async (promessa: Promise<unknown>): Promise<Error> => {
  try {
    await promessa
  } catch (erro) {
    if (ehDomainError(erro)) return erro
    throw erro
  }
  throw new Error('Esperava erro de dominio, mas a operacao passou.')
}

const abrir = () => abrirChamado({ repositorio })(entrada, marina)
const excluir = (numero: number, quem: Principal) =>
  excluirChamado({ repositorio })({ numero }, quem)
const ver = (numero: number, quem: Principal) => verChamado({ repositorio })({ numero }, quem)

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments RESTART IDENTITY`)
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('a linha permanece (AC #1)', () => {
  it('excluir marca, nao apaga', async () => {
    const { number } = await abrir()

    await excluir(number, bruno)

    const [linha] = await db.select().from(tickets).where(eq(tickets.number, number))
    // O teste central do FR-23: a linha continua la, com a marca.
    expect(linha).toBeDefined()
    expect(linha?.deletedAt).toBeInstanceOf(Date)
  })

  it('a contagem de linhas nao muda', async () => {
    await abrir()
    const { number } = await abrir()

    await excluir(number, bruno)

    expect(await db.select().from(tickets)).toHaveLength(2)
  })
})

describe('excluido some das leituras (AC #2, #3)', () => {
  it('o Agente que excluiu deixa de encontrar o Chamado', async () => {
    const { number } = await abrir()
    await excluir(number, bruno)

    const erro = await erroDe(ver(number, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })

  it('o dono tambem deixa de encontrar', async () => {
    const { number } = await abrir()
    await excluir(number, bruno)

    const erro = await erroDe(ver(number, marina))

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })

  it('o erro do excluido e identico ao de um Numero que nunca existiu', async () => {
    const { number } = await abrir()
    await excluir(number, bruno)

    const excluido = await erroDe(ver(number, bruno))
    const inexistente = await erroDe(ver(999_999, bruno))

    const forma = (e: Error, n: number) => ({
      name: e.name,
      code: ehDomainError(e) ? e.code : undefined,
      message: e.message.replace(`#${n}`, '#N'),
    })

    expect(forma(excluido, number)).toEqual(forma(inexistente, 999_999))
  })

  it('os outros Chamados continuam visiveis', async () => {
    const primeiro = await abrir()
    const segundo = await abrir()

    await excluir(primeiro.number, bruno)

    expect((await ver(segundo.number, bruno)).number).toBe(segundo.number)
  })
})

describe('Comentario excluido some da thread (AC #4)', () => {
  it('a thread devolve so os vivos, sem buraco na contagem', async () => {
    const { number } = await abrir()
    await db.insert(comments).values([
      { ticketNumber: number, autor: 'marina@empresa.com', corpo: 'Primeiro.', internal: false },
      {
        ticketNumber: number,
        autor: 'marina@empresa.com',
        corpo: 'Segundo, arrependido.',
        internal: false,
        deletedAt: new Date('2026-08-10T13:00:00.000Z'),
      },
      { ticketNumber: number, autor: 'bruno@empresa.com', corpo: 'Terceiro.', internal: false },
    ])

    const saida = await ver(number, marina)

    expect(saida.comentarios).toHaveLength(2)
    expect(saida.comentarios.map((c) => c.corpo)).toEqual(['Primeiro.', 'Terceiro.'])
  })

  it('Comentario excluido some tambem para o Agente', async () => {
    const { number } = await abrir()
    await db.insert(comments).values({
      ticketNumber: number,
      autor: 'bruno@empresa.com',
      corpo: 'Interno e excluido.',
      internal: true,
      deletedAt: new Date('2026-08-10T13:00:00.000Z'),
    })

    expect((await ver(number, bruno)).comentarios).toHaveLength(0)
  })
})

describe('auditoria da exclusao (AC #5)', () => {
  it('grava a acao com a identidade de quem excluiu', async () => {
    const { number } = await abrir()

    await excluir(number, bruno)

    const registros = await db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.ticketNumber, number))

    const exclusao = registros.find((r) => r.acao === 'excluir_chamado')
    expect(exclusao?.autor).toBe('bruno@empresa.com')
    expect(exclusao?.origin).toBe('mcp')
  })

  it('a abertura continua auditada depois da exclusao (FR-23)', async () => {
    const { number } = await abrir()
    await excluir(number, bruno)

    const registros = await db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.ticketNumber, number))

    // "Nada auditavel e perdido": o rastro da abertura sobrevive a exclusao do
    // Chamado. E o motivo de o soft-delete existir.
    expect(registros.map((r) => r.acao).sort()).toEqual(['abrir_chamado', 'excluir_chamado'])
  })

  it('tentativa que nao excluiu nada nao gera registro', async () => {
    const { number } = await abrir()
    await excluir(number, bruno)

    await erroDe(excluir(number, bruno))

    const registros = await db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.ticketNumber, number))

    // Registrar uma exclusao que nao aconteceu poluiria o Log com evento falso.
    expect(registros.filter((r) => r.acao === 'excluir_chamado')).toHaveLength(1)
  })
})

describe('exclusao concorrente (AC #6)', () => {
  it('dois pedidos simultaneos, uma marcacao so', async () => {
    const { number } = await abrir()

    const resultados = await Promise.allSettled([excluir(number, bruno), excluir(number, bruno)])

    // Ler-e-depois-marcar deixaria os dois passarem pela leitura antes de
    // qualquer escrita, e gravaria duas linhas de auditoria para uma exclusao.
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)

    const registros = await db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.ticketNumber, number))
    expect(registros.filter((r) => r.acao === 'excluir_chamado')).toHaveLength(1)
  })
})

describe('o adapter recusa a segunda marcacao (AC #6)', () => {
  it('excluirComAuditoria devolve false quando ja estava excluido', async () => {
    const { number } = await abrir()

    const primeira = await repositorio.excluirComAuditoria(number, bruno)
    const segunda = await repositorio.excluirComAuditoria(number, bruno)

    // Chamado direto ao adapter: pelo caso de uso, o gargalo de visibilidade
    // barra antes de chegar aqui. Este e o comportamento sob corrida, quando as
    // duas leituras acontecem antes de qualquer escrita.
    expect(primeira).toBe(true)
    expect(segunda).toBe(false)
  })
})

describe('o Log de auditoria nao ganha soft-delete (AC #7)', () => {
  it('audit_entries nao tem a coluna deleted_at', async () => {
    const colunas = await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_name = 'audit_entries' AND column_name = 'deleted_at'`,
    )

    // Assercao contra o CATALOGO do Postgres, nao contra o nosso schema.ts:
    // verificar o proprio codigo seria verificar a si mesmo. O Log e
    // append-only (FR-22) — dar a ele um `deleted_at` permitiria apagar a prova
    // de que algo aconteceu, que e exatamente o que o FR-23 impede.
    expect(colunas).toHaveLength(0)
  })

  it('tickets e comments TEM a coluna', async () => {
    const colunas = await db.execute(
      sql`SELECT table_name FROM information_schema.columns
          WHERE column_name = 'deleted_at' ORDER BY table_name`,
    )

    // Sem esta metade, o teste acima passaria com a migration inteira ausente.
    expect(colunas.map((c) => c.table_name)).toEqual(['comments', 'tickets'])
  })
})
