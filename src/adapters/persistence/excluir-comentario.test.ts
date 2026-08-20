import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { excluirComentario } from '../../application/commands/excluir-comentario.js'
import type { Principal } from '../../application/contracts/principal.js'
import { verChamado } from '../../application/queries/ver-chamado.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Excluir Comentario contra o Postgres real (Story 4.3, FR-23).
 *
 * A sonda central: **so um teste que LEIA A THREAD DEPOIS prova a exclusao.**
 * Contar linhas afetadas nao distingue "marcou" de "marcou o errado" — e o
 * "errado" aqui e concreto, porque o `UPDATE` precisa casar `id` E
 * `ticket_number`.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

/**
 * Story 4.3: excluir Comentario exige confirmacao (AD-7). Este duble sempre
 * aceita — o que este arquivo mede e a EXCLUSAO (o alvo do UPDATE, a thread
 * depois, o Log). A confirmacao tem testes proprios logo abaixo.
 */
let confirmacaoVale = true
let alvosEmitidos: string[] = []
const confirmacao = {
  async emitir(pedido: { alvo: string }) {
    alvosEmitidos.push(pedido.alvo)
    return 'token'
  },
  async consumir() {
    return confirmacaoVale
  },
}

const excluirSemConfirmar = excluirComentario({ repositorio, confirmacao })
const excluir = (input: { numero: number; id: number }, quem: Principal) =>
  excluirSemConfirmar({ ...input, confirmacao: 'token' }, quem)
const ler = (numero: number, quem: Principal) => verChamado({ repositorio })({ numero }, quem)

const idsDoChamado = async (numero: number): Promise<number[]> => {
  const linhas = await db.execute(
    sql`SELECT id FROM comments WHERE ticket_number = ${numero} ORDER BY id`,
  )
  return linhas.map((l) => Number(l.id))
}

beforeEach(async () => {
  confirmacaoVale = true
  alvosEmitidos = []
  await db.execute(sql`TRUNCATE tickets, comments, audit_entries RESTART IDENTITY`)
  await db.execute(sql`
    INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester)
    VALUES (1042, 'VPN', 'nao conecta', 'rede', 'aberto', 'media', 'marina@empresa.com'),
           (2000, 'Impressora', 'sem toner', 'hardware', 'aberto', 'media', 'carlos@empresa.com')
  `)
  await db.execute(sql`
    INSERT INTO comments (ticket_number, autor, corpo, internal)
    VALUES (1042, 'marina@empresa.com', 'primeiro do 1042', false),
           (1042, 'bruno@empresa.com', 'segundo do 1042', true),
           (2000, 'carlos@empresa.com', 'o do OUTRO chamado', false)
  `)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('o Comentario some da thread, e o corpo fica no banco (AC #2)', () => {
  it('some para quem o escreveu, para o Agente, para todo mundo', async () => {
    const [primeiro] = await idsDoChamado(1042)

    await excluir({ numero: 1042, id: primeiro ?? 0 }, bruno)

    const paraOAgente = await ler(1042, bruno)
    const paraOSolicitante = await ler(1042, marina)

    expect(paraOAgente.comentarios.map((c) => c.corpo)).toEqual(['segundo do 1042'])
    expect(paraOSolicitante.comentarios).toEqual([])
  })

  /** Soft-delete: a linha permanece, com a marca. Exclusao FISICA reprova aqui. */
  it('a linha continua no banco, com `deleted_at` preenchido', async () => {
    const [primeiro] = await idsDoChamado(1042)

    await excluir({ numero: 1042, id: primeiro ?? 0 }, bruno)

    const [linha] = await db.execute(
      sql`SELECT corpo, deleted_at FROM comments WHERE id = ${primeiro ?? 0}`,
    )
    expect(linha?.corpo).toBe('primeiro do 1042')
    expect(linha?.deleted_at).not.toBeNull()
  })
})

describe('o id sozinho NAO basta: o `numero` faz parte do alvo', () => {
  /**
   * A sonda que mais importa deste arquivo. Um `UPDATE ... WHERE id = $1` sem
   * o `ticket_number` deixaria o Agente excluir o Comentario de um Chamado que
   * ele nem citou — passando pelo gargalo de visibilidade do Chamado que ele
   * citou. E vazamento de ESCRITA, o irmao do que a 3.1 achou na leitura.
   */
  it('id de Comentario de OUTRO Chamado nao e excluido', async () => {
    const [doOutro] = await idsDoChamado(2000)

    await expect(excluir({ numero: 1042, id: doOutro ?? 0 }, bruno)).rejects.toThrow(
      /nao encontrado/i,
    )

    const [linha] = await db.execute(
      sql`SELECT deleted_at FROM comments WHERE id = ${doOutro ?? 0}`,
    )
    expect(linha?.deleted_at).toBeNull()
  })

  it('e a recusa nao vira registro no Log', async () => {
    const [doOutro] = await idsDoChamado(2000)

    await expect(excluir({ numero: 1042, id: doOutro ?? 0 }, bruno)).rejects.toThrow()

    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM audit_entries`,
    )
    expect(total).toBe(0)
  })
})

describe('a exclusao vai para o Log (AC #1, AD-3, AD-9)', () => {
  it('com a acao, o autor e a origem de quem excluiu', async () => {
    const [primeiro] = await idsDoChamado(1042)

    await excluir({ numero: 1042, id: primeiro ?? 0 }, bruno)

    const [entrada] = await db.execute(
      sql`SELECT ticket_number, acao, autor, origin FROM audit_entries ORDER BY id`,
    )
    expect(entrada?.acao).toBe('excluir_comentario')
    // NAO o autor do Comentario (marina): quem EXCLUIU.
    expect(entrada?.autor).toBe('bruno@empresa.com')
    expect(entrada?.origin).toBe('mcp')
    expect(entrada?.ticket_number).toBe(1042)
  })

  /** Exclusao que nao aconteceu nao vira Log — mesma regra da 1.7. */
  it('excluir duas vezes registra UMA vez', async () => {
    const [primeiro] = await idsDoChamado(1042)

    await excluir({ numero: 1042, id: primeiro ?? 0 }, bruno)
    await expect(excluir({ numero: 1042, id: primeiro ?? 0 }, bruno)).rejects.toThrow()

    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM audit_entries`,
    )
    expect(total).toBe(1)
  })
})

describe('quem pode excluir Comentario (AD-8)', () => {
  it('o Solicitante nao exclui — nem o proprio Comentario', async () => {
    const [primeiro] = await idsDoChamado(1042)

    // O primeiro Comentario e DELA, e o Chamado tambem.
    await expect(excluir({ numero: 1042, id: primeiro ?? 0 }, marina)).rejects.toThrow(
      /nao pode excluir/i,
    )

    const [linha] = await db.execute(
      sql`SELECT deleted_at FROM comments WHERE id = ${primeiro ?? 0}`,
    )
    expect(linha?.deleted_at).toBeNull()
  })

  it('quem nao ve o Chamado recebe "nao encontrado", nao "sem permissao"', async () => {
    const [doOutro] = await idsDoChamado(2000)

    // O Chamado 2000 e de carlos; marina nao o enxerga (FR-2).
    await expect(excluir({ numero: 2000, id: doOutro ?? 0 }, marina)).rejects.toThrow(
      /Chamado 2000 nao encontrado|nao encontrado/i,
    )
  })
})

describe('a confirmacao e obrigatoria (AC #4, AD-7)', () => {
  it('sem confirmacao nada e excluido, e vem o token', async () => {
    const [primeiro] = await idsDoChamado(1042)

    await expect(excluirSemConfirmar({ numero: 1042, id: primeiro ?? 0 }, bruno)).rejects.toThrow(
      /IRREVERSIVEL/i,
    )

    const [linha] = await db.execute(
      sql`SELECT deleted_at FROM comments WHERE id = ${primeiro ?? 0}`,
    )
    expect(linha?.deleted_at).toBeNull()
  })

  /**
   * O alvo carrega o PAR Chamado/Comentario, igual a autorizacao. Um alvo
   * `comentario:7` deixaria um token servir para o Comentario 7 de qualquer
   * Chamado — mais frouxo que a regra que ele deveria proteger.
   */
  it('o alvo do token amarra o Chamado E o Comentario', async () => {
    const [primeiro] = await idsDoChamado(1042)

    await expect(excluirSemConfirmar({ numero: 1042, id: primeiro ?? 0 }, bruno)).rejects.toThrow()

    expect(alvosEmitidos).toEqual([`comentario:1042/${primeiro}`])
  })

  it('confirmacao que nao serve nao exclui', async () => {
    const [primeiro] = await idsDoChamado(1042)
    confirmacaoVale = false

    await expect(excluir({ numero: 1042, id: primeiro ?? 0 }, bruno)).rejects.toThrow(
      /Confirmacao invalida/i,
    )

    const [linha] = await db.execute(
      sql`SELECT deleted_at FROM comments WHERE id = ${primeiro ?? 0}`,
    )
    expect(linha?.deleted_at).toBeNull()
  })

  /** Quem nao pode agir nao recebe cracha — a mesma ordem da Story 2.6. */
  it('o Solicitante nem chega a receber token', async () => {
    const [primeiro] = await idsDoChamado(1042)

    await expect(excluirSemConfirmar({ numero: 1042, id: primeiro ?? 0 }, marina)).rejects.toThrow(
      /nao pode excluir/i,
    )

    expect(alvosEmitidos).toEqual([])
  })
})
