import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { comentarChamado } from '../../application/commands/comentar-chamado.js'
import type { Principal } from '../../application/contracts/principal.js'
import { verChamado } from '../../application/queries/ver-chamado.js'
import { verHistorico } from '../../application/queries/ver-historico.js'
import { ehDomainError } from '../../domain/errors.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Integracao com Postgres REAL: o que esta story precisa provar e que o
 * Comentario escrito aqui atravessa a LEITURA da Story 1.2 do jeito certo — e
 * isso so aparece indo ao banco e voltando.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const abrir = () =>
  abrirChamado({ repositorio })(
    { titulo: 'Notebook nao liga', descricao: 'Sem resposta ao botao.', categoria: 'hardware' },
    marina,
  )

const comentar = comentarChamado({ repositorio })
const ler = (numero: number, quem: Principal) => verChamado({ repositorio })({ numero }, quem)

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

describe('o Comentario atravessa a leitura da 1.2 (AC #1, #2)', () => {
  it('o Agente ve o Comentario Publico e o Interno', async () => {
    const { number } = await abrir()
    await comentar({ numero: number, texto: 'Vou olhar hoje', interno: false }, bruno)
    await comentar({ numero: number, texto: 'Cliente ja reclamou 3x', interno: true }, bruno)

    const { comentarios } = await ler(number, bruno)

    expect(comentarios).toHaveLength(2)
    expect(comentarios.map((c) => c.corpo)).toEqual(['Vou olhar hoje', 'Cliente ja reclamou 3x'])
  })

  /**
   * O teste central do AD-8: quem escreve nao decide quem le. O filtro e o
   * `filtrarComentarios` que ja existia desde a 1.2 — esta story so passou a
   * escrever o campo que ele consulta.
   */
  it('o Solicitante ve so o Publico', async () => {
    const { number } = await abrir()
    await comentar({ numero: number, texto: 'Publico', interno: false }, bruno)
    await comentar({ numero: number, texto: 'Interno do time', interno: true }, bruno)

    const { comentarios } = await ler(number, marina)

    expect(comentarios).toHaveLength(1)
    expect(comentarios[0]?.corpo).toBe('Publico')
  })

  it('o Comentario carrega autor e timestamp (FR-3)', async () => {
    const { number } = await abrir()
    await comentar({ numero: number, texto: 'Registrado', interno: false }, bruno)

    const { comentarios } = await ler(number, bruno)

    expect(comentarios[0]?.autor).toBe('bruno@empresa.com')
    expect(comentarios[0]?.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  /**
   * Insere FORA de ordem nao da para fazer aqui (o banco carimba `now()`), mas
   * o desempate por `id` importa: dois Comentarios criados no mesmo instante
   * sao o caso comum num teste, e sem ele a ordem seria a fisica do heap
   * (licao da 1.2).
   */
  it('a ordem e cronologica mesmo com timestamps iguais', async () => {
    const { number } = await abrir()
    for (const texto of ['primeiro', 'segundo', 'terceiro']) {
      await comentar({ numero: number, texto, interno: false }, bruno)
    }

    const { comentarios } = await ler(number, bruno)

    expect(comentarios.map((c) => c.corpo)).toEqual(['primeiro', 'segundo', 'terceiro'])
  })
})

describe('a auditoria sai na mesma transacao (AC #1)', () => {
  it('cada Comentario gera uma entrada no Log', async () => {
    const { number } = await abrir()
    await comentar({ numero: number, texto: 'Publico', interno: false }, bruno)
    await comentar({ numero: number, texto: 'Interno', interno: true }, bruno)

    const { entradas } = await verHistorico({ repositorio })({ numero: number }, bruno)

    expect(entradas.map((e) => e.acao)).toEqual([
      'abrir_chamado',
      'comentar_chamado',
      'comentar_chamado_interno',
    ])
  })

  /**
   * A acao distingue publico de interno porque quem revisa o que a IA fez
   * (1.8) precisa saber se ela criou conversa interna do time. Remover a
   * distincao passaria despercebido sem este teste.
   */
  it('a acao registrada diz se o Comentario era interno', async () => {
    const { number } = await abrir()
    await comentar({ numero: number, texto: 'Interno', interno: true }, bruno)

    const { entradas } = await verHistorico({ repositorio })({ numero: number }, bruno)

    expect(entradas.at(-1)).toMatchObject({
      acao: 'comentar_chamado_interno',
      autor: 'bruno@empresa.com',
      origin: 'mcp',
    })
  })

  /**
   * O CORPO nao entra na auditoria: `audit_entries` e append-only (FR-22) e nao
   * tem soft-delete, entao o texto viraria uma segunda copia que sobreviveria a
   * exclusao do Comentario.
   */
  it('o corpo do Comentario nao vaza para o Log', async () => {
    const { number } = await abrir()
    await comentar({ numero: number, texto: 'segredo industrial', interno: true }, bruno)

    const linhas = await db.execute(sql`SELECT * FROM audit_entries`)

    expect(JSON.stringify(linhas)).not.toContain('segredo industrial')
  })

  /** Escrita que nao aconteceu nao vira auditoria (licao da 1.7). */
  it('corpo vazio nao deixa Comentario nem auditoria', async () => {
    const { number } = await abrir()

    await erroDe(comentar({ numero: number, texto: '   ', interno: false }, bruno))

    const comentarios = await db.execute(sql`SELECT count(*)::int AS total FROM comments`)
    const auditoria = await db.execute(sql`SELECT count(*)::int AS total FROM audit_entries`)

    expect(comentarios[0]?.total).toBe(0)
    // So a da abertura.
    expect(auditoria[0]?.total).toBe(1)
  })
})

describe('escrita aditiva nao versiona o Chamado (refinamento do AD-10)', () => {
  /**
   * Dois Agentes comentando ao mesmo tempo produzem DOIS Comentarios corretos.
   * Foi por isso que a 2.1 decidiu nao aplicar concorrencia otimista aqui:
   * rejeitar o segundo com `Conflict` inventaria um problema que nao existe —
   * nao ha update a perder numa escrita que so acrescenta.
   */
  it('comentarios simultaneos coexistem, sem conflito', async () => {
    const { number } = await abrir()

    await Promise.all([
      comentar({ numero: number, texto: 'do bruno', interno: false }, bruno),
      comentar({ numero: number, texto: 'da marina', interno: false }, marina),
    ])

    const { comentarios } = await ler(number, bruno)
    expect(comentarios).toHaveLength(2)
  })
})

describe('o gargalo protege a escrita (AC #4)', () => {
  it('Chamado excluido nao aceita Comentario', async () => {
    const { number } = await abrir()
    await repositorio.excluirComAuditoria(number, bruno)

    const erro = await erroDe(comentar({ numero: number, texto: 'oi', interno: false }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')

    const linhas = await db.execute(sql`SELECT count(*)::int AS total FROM comments`)
    expect(linhas[0]?.total).toBe(0)
  })

  it('Chamado inexistente devolve o mesmo erro', async () => {
    const erro = await erroDe(comentar({ numero: 9999, texto: 'oi', interno: false }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })
})
