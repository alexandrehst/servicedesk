import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { tickets } from '../../../drizzle/schema.js'
import type { Principal } from '../../application/contracts/principal.js'
import { ehDomainError } from '../../domain/errors.js'
import { abrirTicket } from '../../domain/ticket.js'
import { criarTicketRepository, ehViolacaoDeUnicidade } from './ticket-repository.js'

/**
 * A deduplicacao do intake so e verificavel contra o Postgres REAL: o que
 * garante "um Chamado por mensagem" e uma restricao UNIQUE, e restricao de
 * banco nao existe em duble.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const marina: Principal = {
  identity: 'marina@empresa.com',
  role: 'solicitante',
  origin: 'email',
}

const novo = () =>
  abrirTicket({
    titulo: 'Notebook nao liga',
    descricao: 'Apertei o botao e nada acontece.',
    categoria: 'nao_classificado',
    requester: marina.identity,
  })

const contarTickets = async (): Promise<number> => {
  const linhas = await db.select().from(tickets)
  return linhas.length
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments, email_intake RESTART IDENTITY`)
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
})

afterAll(async () => {
  await sqlClient.end()
})

/**
 * Assercao contra o CATALOGO do banco, e nao contra o comportamento: o padrao
 * da Story 1.7. E preciso provar os dois lados — que a coluna existe e que a
 * restricao existe — senao "nao tem a coluna" passaria com a migration ausente.
 */
describe('o vinculo mensagem -> Chamado no catalogo (AC #4)', () => {
  it('email_intake.message_id existe e e NOT NULL', async () => {
    const linhas = await db.execute(sql`
      SELECT is_nullable
        FROM information_schema.columns
       WHERE table_name = 'email_intake' AND column_name = 'message_id'
    `)

    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.is_nullable).toBe('NO')
  })

  /**
   * Sem UNIQUE, a dedup seria so a leitura previa — e duas entregas simultaneas
   * da mesma mensagem passariam pelas duas leituras antes de qualquer insert,
   * abrindo dois Chamados.
   */
  it('message_id tem restricao UNIQUE', async () => {
    const linhas = await db.execute(sql`
      SELECT con.contype
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
       WHERE rel.relname = 'email_intake'
         AND att.attname = 'message_id'
         AND con.contype IN ('u', 'p')
    `)

    expect(linhas.length).toBeGreaterThan(0)
  })
})

describe('gravacao do vinculo (AC #1, #4)', () => {
  it('registra a mensagem junto com o Chamado', async () => {
    const ticket = await repositorio.criarComAuditoria(novo(), marina, {
      messageId: '<primeira@empresa.com>',
    })

    expect(await repositorio.buscarIntakePorMessageId('<primeira@empresa.com>')).toBe(ticket.number)
  })

  it('mensagem nunca vista devolve null', async () => {
    expect(await repositorio.buscarIntakePorMessageId('<nunca@empresa.com>')).toBeNull()
  })

  /** Abertura por MCP/API nao grava vinculo nenhum — o parametro e opcional. */
  it('abertura sem intake nao cria vinculo', async () => {
    await repositorio.criarComAuditoria(novo(), { ...marina, origin: 'mcp' })

    const linhas = await db.execute(sql`SELECT count(*)::int AS total FROM email_intake`)
    expect(linhas[0]?.total).toBe(0)
  })
})

/**
 * O predicado merece teste proprio porque uma resposta errada dele tem dois
 * desfechos ruins e opostos: falso negativo faz a reentrega virar erro
 * ruidoso; falso positivo faria QUALQUER falha de banco ser reportada como
 * "mensagem duplicada" — e o Chamado sumiria em silencio.
 */
describe('reconhecer a violacao de unicidade', () => {
  it('reconhece o codigo no topo do erro', () => {
    expect(ehViolacaoDeUnicidade(Object.assign(new Error('x'), { code: '23505' }))).toBe(true)
  })

  /**
   * O caso real: o Drizzle embrulha o erro do driver num `Error` generico
   * ("Failed query: ...") e o codigo do Postgres fica um nivel abaixo. Olhar so
   * o topo daria `undefined` — foi exatamente o que aconteceu na primeira
   * versao desta story, e o teste da corrida reprovou.
   */
  it('reconhece o codigo dentro da cadeia de cause', () => {
    const driver = Object.assign(new Error('duplicate key'), { code: '23505' })
    const embrulhado = new Error('Failed query: insert ...', { cause: driver })

    expect(ehViolacaoDeUnicidade(embrulhado)).toBe(true)
  })

  it.each([
    ['outro codigo de SQLSTATE', Object.assign(new Error('x'), { code: '23503' })],
    ['erro sem codigo', new Error('conexao caiu')],
    ['nulo', null],
    ['string', 'nao e erro'],
  ])('recusa %s', (_caso, erro) => {
    expect(ehViolacaoDeUnicidade(erro)).toBe(false)
  })
})

describe('a corrida (AC #4)', () => {
  /**
   * Este e o teste que prova a garantia. A leitura previa resolve o caso comum;
   * quando duas entregas correm juntas, as duas leituras dizem "nao existe" e
   * as duas seguem para o insert. Quem impede o segundo Chamado e o UNIQUE.
   */
  it('a mesma mensagem duas vezes nao cria o segundo Chamado', async () => {
    await repositorio.criarComAuditoria(novo(), marina, { messageId: '<repetida@empresa.com>' })

    const erro = await repositorio
      .criarComAuditoria(novo(), marina, { messageId: '<repetida@empresa.com>' })
      .catch((e: unknown) => e)

    expect(ehDomainError(erro) && erro.code).toBe('MensagemJaProcessada')
    expect(await contarTickets()).toBe(1)
  })

  /**
   * Atomicidade (AD-3): o vinculo entra na MESMA transacao da abertura. Se
   * fossem duas transacoes, o Chamado da segunda tentativa ja estaria comitado
   * quando o UNIQUE reprovasse — e sobraria um Chamado orfao a cada reentrega.
   */
  it('duas entregas simultaneas produzem UM Chamado', async () => {
    const entregas = [1, 2].map(() =>
      repositorio
        .criarComAuditoria(novo(), marina, { messageId: '<simultanea@empresa.com>' })
        .catch((e: unknown) => e),
    )

    await Promise.all(entregas)

    expect(await contarTickets()).toBe(1)
  })
})
