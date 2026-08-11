import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { tickets } from '../../../drizzle/schema.js'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { mudarPrioridade } from '../../application/commands/mudar-prioridade.js'
import type { Principal } from '../../application/contracts/principal.js'
import { verChamado } from '../../application/queries/ver-chamado.js'
import { verHistorico } from '../../application/queries/ver-historico.js'
import { ehDomainError } from '../../domain/errors.js'
import { criarTicketRepository } from './ticket-repository.js'

const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 4 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const abrir = () =>
  abrirChamado({ repositorio })(
    { titulo: 'Notebook nao liga', descricao: 'Sem resposta ao botao.', categoria: 'hardware' },
    marina,
  )

const mudar = mudarPrioridade({ repositorio })
const ler = (numero: number) => verChamado({ repositorio })({ numero }, bruno)

const erroDe = async (promessa: Promise<unknown>): Promise<Error> => {
  try {
    await promessa
  } catch (erro) {
    if (ehDomainError(erro)) return erro
    throw erro
  }
  throw new Error('Esperava erro de dominio, mas a operacao passou.')
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments RESTART IDENTITY`)
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
})

afterAll(async () => {
  await sqlClient.end()
})

/**
 * Assercao contra o CATALOGO, provando os DOIS lados (padrao da 1.7): sem o
 * segundo, "nao tem a coluna" passaria com a migration ausente.
 */
describe('o schema da Prioridade (AC #2)', () => {
  it('tickets.priority existe, e NOT NULL e tem default', async () => {
    const linhas = await db.execute(sql`
      SELECT is_nullable, column_default
        FROM information_schema.columns
       WHERE table_name = 'tickets' AND column_name = 'priority'
    `)

    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.is_nullable).toBe('NO')
    expect(String(linhas[0]?.column_default)).toContain('media')
  })
})

describe('a Prioridade e LIDA do banco (licao do assignee na 2.3)', () => {
  /**
   * Escreve direto no banco, sem passar pelo command: um teste que so olhasse o
   * retorno do command passaria com um literal no lugar da coluna — foi
   * exatamente o que aconteceu com `assignee` desde a Story 1.1.
   */
  it('a leitura devolve a prioridade que esta na coluna', async () => {
    const { number } = await abrir()
    await db.update(tickets).set({ priority: 'critica' }).where(eq(tickets.number, number))

    expect((await ler(number)).prioridade).toBe('critica')
  })

  it('o Chamado nasce com a prioridade padrao', async () => {
    const { number } = await abrir()

    expect((await ler(number)).prioridade).toBe('media')
  })
})

describe('mudar de verdade (AC #1)', () => {
  it('muda a coluna e incrementa a versao', async () => {
    const { number } = await abrir()

    const saida = await mudar({ numero: number, prioridade: 'alta', versao: 1 }, bruno)

    expect(saida).toMatchObject({ de: 'media', para: 'alta', versao: 2 })
    expect((await ler(number)).prioridade).toBe('alta')
  })

  it('o Log registra de/para', async () => {
    const { number } = await abrir()
    await mudar({ numero: number, prioridade: 'critica', versao: 1 }, bruno)

    const { entradas } = await verHistorico({ repositorio })({ numero: number }, bruno)

    expect(entradas.at(-1)).toMatchObject({
      acao: 'mudar_prioridade',
      de: 'media',
      para: 'critica',
      autor: 'bruno@empresa.com',
    })
  })
})

describe('concorrencia otimista (AC #5)', () => {
  it('versao velha recebe Conflict e nada muda', async () => {
    const { number } = await abrir()
    await mudar({ numero: number, prioridade: 'alta', versao: 1 }, bruno)

    const erro = await erroDe(mudar({ numero: number, prioridade: 'baixa', versao: 1 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('Conflict')
    expect((await ler(number)).prioridade).toBe('alta')
  })

  /** A invariante, nao o codigo do erro (licao da 2.2). */
  it('duas mudancas simultaneas produzem UMA escrita', async () => {
    const { number } = await abrir()

    const resultados = await Promise.all([
      mudar({ numero: number, prioridade: 'alta', versao: 1 }, bruno).catch((e: unknown) => e),
      mudar({ numero: number, prioridade: 'baixa', versao: 1 }, bruno).catch((e: unknown) => e),
    ])

    expect(resultados.filter((r) => !(r instanceof Error))).toHaveLength(1)
    expect((await ler(number)).versao).toBe(2)
  })

  it('o repositorio recusa mudar Prioridade de Chamado excluido', async () => {
    const { number } = await abrir()
    await repositorio.excluirComAuditoria(number, bruno)

    const resultado = await repositorio.mudarPrioridadeComAuditoria({
      numero: number,
      de: 'media',
      para: 'alta',
      esperada: 1,
      autor: bruno,
    })

    expect(resultado).toBeNull()
  })
})
