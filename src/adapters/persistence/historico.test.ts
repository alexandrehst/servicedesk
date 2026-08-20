import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auditEntries, tickets } from '../../../drizzle/schema.js'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { excluirChamado } from '../../application/commands/excluir-chamado.js'
import type { Principal } from '../../application/contracts/principal.js'
import { verHistoricoOutputSchema } from '../../application/contracts/ver-historico.js'
import { verHistorico } from '../../application/queries/ver-historico.js'
import { ehDomainError } from '../../domain/errors.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Story 4.3: excluir passou a exigir confirmacao (AD-7). Este duble sempre
 * aceita — os testes de confirmacao vivem em `excluir-usuario.test.ts` e no
 * teste do command; aqui o que se mede e outra coisa.
 */
const confirmacaoQueSempreAceita = {
  async emitir() {
    return 'token'
  },
  async consumir() {
    return true
  },
}

/**
 * Integracao com Postgres REAL: a ordem cronologica vem do `ORDER BY` e o
 * recorte por origem vem do `WHERE` — nenhum dos dois e verificavel com duble.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

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

const abrir = (quem: Principal = marina) => abrirChamado({ repositorio })(entrada, quem)
const historico = (numero: number, quem: Principal, origem?: 'api' | 'mcp') =>
  verHistorico({ repositorio })({ numero, origem }, quem)

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments RESTART IDENTITY`)
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('papel errado (AC #3, #4)', () => {
  it('o Solicitante nao ve o historico nem do proprio Chamado', async () => {
    const { number } = await abrir()

    const erro = await erroDe(historico(number, marina))

    // Ela ABRIU o Chamado e pode ve-lo — mas o Log expoe quais Agentes
    // mexeram nele e quando. Ver o Chamado nao basta para ver o Log.
    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })

  it('o Solicitante alheio tambem e recusado', async () => {
    const { number } = await abrir()

    const erro = await erroDe(historico(number, carlos))

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })

  it('Chamado excluido nao tem historico visivel, nem para o Agente', async () => {
    const { number } = await abrir()
    await excluirChamado({ repositorio, confirmacao: confirmacaoQueSempreAceita })(
      { numero: number, confirmacao: 'token' },
      bruno,
    )

    const erro = await erroDe(historico(number, bruno))

    // Herdado do gargalo: a 1.7 ensinou `podeVerTicket` a descartar excluido, e
    // esta leitura, escrita depois, ja nasceu sabendo.
    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })

  it('recusado, alheio, excluido e inexistente devolvem o mesmo erro', async () => {
    const { number } = await abrir()
    const doDono = await erroDe(historico(number, marina))
    const doAlheio = await erroDe(historico(number, carlos))
    const inexistente = await erroDe(historico(999_999, bruno))

    const forma = (e: Error, n: number) => ({
      name: e.name,
      code: ehDomainError(e) ? e.code : undefined,
      message: e.message.replace(`#${n}`, '#N'),
    })

    expect(forma(doAlheio, number)).toEqual(forma(doDono, number))
    expect(forma(inexistente, 999_999)).toEqual(forma(doDono, number))
  })
})

describe('o Agente ve o historico (AC #1)', () => {
  it('cada acao traz autor, origem e timestamp', async () => {
    const { number } = await abrir()

    const saida = await historico(number, bruno)

    expect(saida.entradas).toHaveLength(1)
    expect(saida.entradas[0]).toMatchObject({
      acao: 'abrir_chamado',
      autor: 'marina@empresa.com',
      origin: 'mcp',
    })
  })

  it('a saida casa com o contrato, com datas ISO 8601', async () => {
    const { number } = await abrir()

    const saida = await historico(number, bruno)

    // O contrato exige `z.iso.datetime()`: se a data saisse como Date ou em
    // outro formato, o parse reprova aqui.
    expect(() => verHistoricoOutputSchema.parse(saida)).not.toThrow()
  })

  it('a ordem e cronologica', async () => {
    const { number } = await abrir()
    await excluirChamado({ repositorio, confirmacao: confirmacaoQueSempreAceita })(
      { numero: number, confirmacao: 'token' },
      bruno,
    )

    // Inseridas fora de ordem de proposito: uma acao antiga chega depois, como
    // aconteceria numa importacao ou correcao manual. Em ordem, o teste
    // passaria pela ordem fisica do heap mesmo sem `ORDER BY` (licao da 1.2).
    await db.insert(auditEntries).values({
      ticketNumber: number,
      acao: 'acao_antiga',
      autor: 'bruno@empresa.com',
      origin: 'api',
      registradoEm: new Date('2020-01-01T00:00:00.000Z'),
    })

    // O Chamado foi excluido acima; para ler o historico, revivemos a linha.
    await db.update(tickets).set({ deletedAt: null }).where(eq(tickets.number, number))

    const saida = await historico(number, bruno)

    expect(saida.entradas[0]?.acao).toBe('acao_antiga')
    expect(saida.entradas.map((e) => e.acao)).toEqual([
      'acao_antiga',
      'abrir_chamado',
      'excluir_chamado',
    ])
  })

  it('Chamado sem acao alguma devolve lista vazia, nao erro', async () => {
    const { number } = await abrir()
    await db.delete(auditEntries).where(eq(auditEntries.ticketNumber, number))

    const saida = await historico(number, bruno)

    // Existe e nao tem historico e diferente de nao existe.
    expect(saida.entradas).toEqual([])
  })
})

describe('o recorte por origem (AC #2)', () => {
  const semearOrigens = async (numero: number) => {
    await db.insert(auditEntries).values([
      { ticketNumber: numero, acao: 'mudar_status', autor: 'bruno@empresa.com', origin: 'api' },
      { ticketNumber: numero, acao: 'comentar', autor: 'bot@empresa.com', origin: 'mcp' },
    ])
  }

  it('origem=mcp devolve so o que passou pela IA', async () => {
    const { number } = await abrir()
    await semearOrigens(number)

    const saida = await historico(number, bruno, 'mcp')

    expect(saida.entradas.every((e) => e.origin === 'mcp')).toBe(true)
    // A abertura tambem veio por mcp, entao sao duas.
    expect(saida.entradas).toHaveLength(2)
  })

  it('origem=api devolve so o resto', async () => {
    const { number } = await abrir()
    await semearOrigens(number)

    const saida = await historico(number, bruno, 'api')

    expect(saida.entradas.map((e) => e.acao)).toEqual(['mudar_status'])
  })

  it('sem filtro, vem tudo', async () => {
    const { number } = await abrir()
    await semearOrigens(number)

    expect((await historico(number, bruno)).entradas).toHaveLength(3)
  })

  it('o filtro nao serve de contorno para a autorizacao', async () => {
    const { number } = await abrir()

    // Recorte e recorte; quem nao pode ver o Log nao passa a poder por pedir
    // um pedaco dele.
    const erro = await erroDe(historico(number, marina, 'mcp'))
    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })
})

describe('a leitura nao deixa rastro (AC #5)', () => {
  it('consultar o historico nao acrescenta linha ao Log', async () => {
    const { number } = await abrir()
    const antes = await db.select().from(auditEntries)

    await historico(number, bruno)
    await historico(number, bruno, 'mcp')

    // Auditar a propria consulta faria o Log crescer a cada revisao, e quem
    // procurasse o que a IA fez encontraria, sobretudo, gente procurando.
    expect(await db.select().from(auditEntries)).toHaveLength(antes.length)
  })
})
