import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comments } from '../../../drizzle/schema.js'
import type { Principal } from '../../application/contracts/principal.js'
import { verChamadoOutputSchema } from '../../application/contracts/ver-chamado.js'
import { verChamado } from '../../application/queries/ver-chamado.js'
import { type DomainError, ehDomainError } from '../../domain/errors.js'
import { abrirTicket } from '../../domain/ticket.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Integracao com Postgres REAL. O que estas stories precisam provar — sequence
 * do banco (AD-4), atomicidade da transacao (AD-3) e ordem cronologica vinda do
 * ORDER BY — nao e mockavel: um mock provaria apenas que o mock funciona.
 *
 * A leitura da Story 1.2 e exercitada ponta a ponta (query handler sobre o
 * repositorio real) porque as garantias que ela precisa mostrar se dividem
 * entre as camadas: a ordem vem da query, a conversao ISO e o erro unico vem do
 * handler. Testar so o adapter deixaria metade da AC sem cobertura.
 *
 * Tudo num arquivo so, de proposito: dois arquivos truncando as MESMAS tabelas
 * rodariam em paralelo no Vitest e um limparia a base do outro.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const autor: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

const novoDe = (requester: string) =>
  abrirTicket({
    titulo: 'VPN fora do ar',
    descricao: 'Nao conecta desde as 9h.',
    categoria: 'rede',
    requester,
  })

const novo = () => novoDe(autor.identity)

beforeEach(async () => {
  // Sem truncar, a sequence continua de onde parou e assercoes sobre Numero
  // quebram de forma intermitente — o pior tipo de teste falho.
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments RESTART IDENTITY`)
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('criarComAuditoria', () => {
  it('atribui Numero vindo da sequence do Postgres (AD-4)', async () => {
    const primeiro = await repositorio.criarComAuditoria(novo(), autor)
    const segundo = await repositorio.criarComAuditoria(novo(), autor)

    expect(primeiro.number).toBe(1000)
    expect(segundo.number).toBe(1001)
  })

  it('Chamado nasce aberto e sem Dono', async () => {
    const ticket = await repositorio.criarComAuditoria(novo(), autor)
    expect(ticket.status).toBe('aberto')
    expect(ticket.assignee).toBeNull()
  })

  it('grava auditoria com autor e origem na mesma transacao (AD-3, AD-9)', async () => {
    const ticket = await repositorio.criarComAuditoria(novo(), autor)

    const linhas = await db.execute(
      sql`SELECT autor, origin, acao, ticket_number FROM audit_entries`,
    )

    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({
      autor: 'bruno@empresa.com',
      origin: 'mcp',
      acao: 'abrir_chamado',
      ticket_number: ticket.number,
    })
  })

  it('registra a origem api quando o principal vem da API', async () => {
    await repositorio.criarComAuditoria(novo(), { ...autor, origin: 'api' })
    const linhas = await db.execute(sql`SELECT origin FROM audit_entries`)
    expect(linhas[0]).toMatchObject({ origin: 'api' })
  })

  /**
   * AC #4 — a prova de que "mesma transacao" e garantia, nao intencao.
   * Sem transacao real, o Chamado ficaria comitado e existiria SEM rastro de
   * autoria: exatamente a lacuna de auditoria que o AD-3 existe para impedir.
   */
  it('NAO persiste o Chamado quando a auditoria falha (atomicidade)', async () => {
    // Derruba a insercao na auditoria sem tocar na tabela de Chamados.
    await db.execute(sql`ALTER TABLE audit_entries ADD CONSTRAINT falha_proposital CHECK (false)`)

    try {
      await expect(repositorio.criarComAuditoria(novo(), autor)).rejects.toThrow()

      const tickets = await db.execute(sql`SELECT count(*)::int AS total FROM tickets`)
      expect(tickets[0]).toMatchObject({ total: 0 })
    } finally {
      await db.execute(sql`ALTER TABLE audit_entries DROP CONSTRAINT falha_proposital`)
    }
  })
})

/**
 * Story 1.2 — leitura sobre o banco real.
 *
 * A ESCRITA de Comentario e a Story 2.1, entao aqui a thread e semeada direto
 * na tabela. E o unico jeito de ter o que ler sem antecipar a story seguinte.
 */
describe('ver_chamado sobre o banco real', () => {
  const ler = verChamado({ repositorio })

  const comentar = (numero: number, corpo: string, quando: string, internal = false) =>
    db.insert(comments).values({
      ticketNumber: numero,
      autor: internal ? autor.identity : marina.identity,
      corpo,
      internal,
      criadoEm: new Date(quando),
    })

  const totalDeAuditoria = async (): Promise<number> => {
    const linhas = await db.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM audit_entries`,
    )
    return linhas[0]?.total ?? -1
  }

  /**
   * O `#N` neutraliza o Numero que o proprio chamador informou. Ele nao e
   * vazamento: quem perguntou ja o conhecia. O que nao pode diferir e todo o
   * resto — nome, code e texto —, porque qualquer diferenca ali responde
   * "existe?" para Numeros sequenciais (AD-4).
   */
  const formaDoErro = (erro: DomainError, numero: number) => ({
    name: erro.name,
    code: erro.code,
    message: erro.message.replace(`#${numero}`, '#N'),
  })

  /** Uma leitura bem-sucedida aqui e falha do teste, nao um erro ausente. */
  const erroDe = async (promessa: Promise<unknown>): Promise<DomainError> => {
    const resultado: unknown = await promessa.then(
      () => null,
      (e: unknown) => e,
    )
    if (!ehDomainError(resultado)) {
      throw new Error(`Esperava um DomainError; veio: ${String(resultado)}`)
    }
    return resultado
  }

  it('devolve a thread em ordem cronologica, nao na ordem de insercao (AC #1)', async () => {
    const ticket = await repositorio.criarComAuditoria(novoDe(marina.identity), marina)

    // Inseridos FORA de ordem de proposito: sem o ORDER BY explicito o Postgres
    // devolveria a ordem fisica e o teste passaria por acaso — ate parar.
    await comentar(ticket.number, 'terceiro', '2026-08-10T12:20:00.000Z')
    await comentar(ticket.number, 'primeiro', '2026-08-10T12:00:00.000Z')
    await comentar(ticket.number, 'segundo', '2026-08-10T12:10:00.000Z')

    const saida = await ler({ numero: ticket.number }, autor)

    expect(saida.comentarios.map((c) => c.corpo)).toEqual(['primeiro', 'segundo', 'terceiro'])
  })

  it('devolve todos os campos no shape do contrato (AC #1)', async () => {
    const ticket = await repositorio.criarComAuditoria(novoDe(marina.identity), marina)
    await comentar(ticket.number, 'Parou hoje.', '2026-08-10T12:00:00.000Z')

    const saida = await ler({ numero: ticket.number }, autor)

    // Valida contra a fonte unica (AD-6): se o handler devolvesse um campo com
    // tipo errado, o parse reprova aqui e nao no cliente MCP.
    expect(() => verChamadoOutputSchema.parse(saida)).not.toThrow()
    expect(saida).toMatchObject({
      number: ticket.number,
      titulo: 'VPN fora do ar',
      descricao: 'Nao conecta desde as 9h.',
      categoria: 'rede',
      status: 'aberto',
      requester: marina.identity,
      assignee: null,
    })
  })

  it('converte as datas do Postgres para string ISO 8601 UTC (AC #1)', async () => {
    const ticket = await repositorio.criarComAuditoria(novoDe(marina.identity), marina)
    await comentar(ticket.number, 'Parou hoje.', '2026-08-10T12:00:00.000Z')

    const saida = await ler({ numero: ticket.number }, autor)

    expect(saida.comentarios[0]?.criadoEm).toBe('2026-08-10T12:00:00.000Z')
    expect(saida.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('Solicitante ve o proprio Chamado sem os Comentarios internos (AC #4)', async () => {
    const ticket = await repositorio.criarComAuditoria(novoDe(marina.identity), marina)
    await comentar(ticket.number, 'Parou hoje.', '2026-08-10T12:00:00.000Z')
    await comentar(ticket.number, 'Fonte queimada.', '2026-08-10T12:05:00.000Z', true)

    const daMarina = await ler({ numero: ticket.number }, marina)
    const doAgente = await ler({ numero: ticket.number }, autor)

    expect(daMarina.comentarios.map((c) => c.corpo)).toEqual(['Parou hoje.'])
    expect(doAgente.comentarios).toHaveLength(2)
  })

  /**
   * O teste central da story. Isolado, cada caso passaria mesmo com mensagens
   * diferentes — e a diferenca e exatamente o vazamento.
   */
  it('Numero inexistente e Chamado alheio produzem erro identico (AC #2, #3)', async () => {
    const daMarina = await repositorio.criarComAuditoria(novoDe(marina.identity), marina)
    const inexistente = daMarina.number + 5000

    const erroAlheio = await erroDe(ler({ numero: daMarina.number }, carlos))
    const erroInexistente = await erroDe(ler({ numero: inexistente }, carlos))

    expect(formaDoErro(erroAlheio, daMarina.number)).toEqual(
      formaDoErro(erroInexistente, inexistente),
    )
    expect(erroAlheio.code).toBe('TicketNaoEncontrado')
  })

  it('leitura nao acrescenta linha em audit_entries (AC #5, FR-13)', async () => {
    const ticket = await repositorio.criarComAuditoria(novoDe(marina.identity), marina)

    // Guarda: se a abertura parasse de auditar, o resto do teste ficaria
    // trivialmente verde comparando zero com zero.
    const antes = await totalDeAuditoria()
    expect(antes).toBe(1)

    await ler({ numero: ticket.number }, autor)
    await ler({ numero: ticket.number }, marina)
    await ler({ numero: ticket.number }, carlos).catch(() => undefined)
    await ler({ numero: ticket.number + 5000 }, autor).catch(() => undefined)

    expect(await totalDeAuditoria()).toBe(antes)
  })
})
