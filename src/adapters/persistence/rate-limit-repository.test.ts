import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { auditEntries, mcpTokens, rateLimit, users } from '../../../drizzle/schema.js'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import type { Principal } from '../../application/contracts/principal.js'
import { ehDomainError } from '../../domain/errors.js'
import { resolverPrincipalDeTokenMcp } from '../../platform/auth/autenticacao.js'
import { hashToken } from '../../platform/auth/token.js'
import { criarLimitador, janelaDe, LIMITE_POR_MINUTO } from '../../platform/limites/rate-limit.js'
import { criarIdentityRepository } from './identity-repository.js'
import { criarRateLimitRepository } from './rate-limit-repository.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Integracao com Postgres REAL. O que esta story precisa provar — incremento
 * atomico sob concorrencia, contador que sobrevive ao processo, e a identidade
 * do token virando autor na auditoria — depende do banco de verdade.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 10 })
const db = drizzle(sqlClient)
const contador = criarRateLimitRepository(db)
const identidade = criarIdentityRepository(db)
const chamados = criarTicketRepository(db)

const AGORA = new Date('2026-08-10T12:00:30.000Z')
const limitar = criarLimitador({ repositorio: contador, agora: () => AGORA })

const TOKEN_DO_BOT = 'token-cru-do-bot'
const TOKEN_DA_ANA = 'token-cru-da-ana'

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
  await db.execute(
    sql`TRUNCATE rate_limit, mcp_tokens, users, tickets, audit_entries, comments RESTART IDENTITY`,
  )
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
  await db.insert(users).values([
    { email: 'bot-triagem@empresa.com', papel: 'agente' },
    { email: 'ana@empresa.com', papel: 'agente' },
  ])
  await db.insert(mcpTokens).values([
    {
      identity: 'bot-triagem@empresa.com',
      tokenHash: hashToken(TOKEN_DO_BOT),
      descricao: 'agente autonomo de triagem',
    },
    {
      identity: 'ana@empresa.com',
      tokenHash: hashToken(TOKEN_DA_ANA),
      descricao: 'cliente MCP da Ana',
    },
  ])
})

afterAll(async () => {
  await sqlClient.end()
})

describe('incremento atomico (AC #6)', () => {
  it('chamadas simultaneas nao se perdem', async () => {
    const simultaneas = 30

    await Promise.all(
      Array.from({ length: simultaneas }, () =>
        contador.registrarChamada('bot-triagem@empresa.com', janelaDe(AGORA)),
      ),
    )

    const [linha] = await db
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.identity, 'bot-triagem@empresa.com'))

    // SELECT-e-depois-UPDATE deixaria varias leituras verem o mesmo valor e
    // gravarem o mesmo incremento. O teste so pega isso com Promise.all: em
    // sequencia, o codigo errado passaria.
    expect(linha?.chamadas).toBe(simultaneas)
  })

  it('devolve o contador ja incrementado, nunca o valor anterior', async () => {
    const primeiro = await contador.registrarChamada('ana@empresa.com', janelaDe(AGORA))
    const segundo = await contador.registrarChamada('ana@empresa.com', janelaDe(AGORA))

    expect(primeiro).toBe(1)
    expect(segundo).toBe(2)
  })
})

describe('o UPSERT sem retorno falha alto', () => {
  it('lanca em vez de devolver zero chamadas', async () => {
    // Duble minimo do encadeamento do Drizzle, devolvendo NENHUMA linha — o
    // que um UPSERT que nao casou produziria.
    const dbVazio = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: async () => [],
          }),
        }),
      }),
    } as unknown as Parameters<typeof criarRateLimitRepository>[0]

    // Se isto devolvesse 0 em silencio, o contador ficaria eternamente abaixo
    // do teto e o rate limit simplesmente deixaria de existir — sem nenhum
    // teste vermelho, sem nenhum log. Falhar alto e a unica saida honesta.
    await expect(
      criarRateLimitRepository(dbVazio).registrarChamada('bot@empresa.com', janelaDe(AGORA)),
    ).rejects.toThrowError(/nao retornou linha/i)
  })
})

describe('o limite contra o banco (AC #2, #5)', () => {
  it('a chamada 61 e recusada e a 60 passa', async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) {
      await limitar('bot-triagem@empresa.com')
    }

    const erro = await erroDe(limitar('bot-triagem@empresa.com'))

    expect(ehDomainError(erro) && erro.code).toBe('LimiteExcedido')
  })

  it('o contador sobrevive a um limitador novo, como sobreviveria a um restart', async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) {
      await limitar('bot-triagem@empresa.com')
    }

    // Instancia nova, sem nenhum estado em memoria — e o que um processo
    // reiniciado no meio da janela teria. Contador em memoria zeraria aqui, e
    // um cliente em loop contornaria o limite reiniciando o servidor.
    const outroProcesso = criarLimitador({ repositorio: contador, agora: () => AGORA })

    const erro = await erroDe(outroProcesso('bot-triagem@empresa.com'))
    expect(ehDomainError(erro) && erro.code).toBe('LimiteExcedido')
  })

  it('a janela seguinte reabre', async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) {
      await limitar('bot-triagem@empresa.com')
    }
    await erroDe(limitar('bot-triagem@empresa.com'))

    const minutoSeguinte = criarLimitador({
      repositorio: contador,
      agora: () => new Date('2026-08-10T12:01:00.000Z'),
    })

    await expect(minutoSeguinte('bot-triagem@empresa.com')).resolves.toBeUndefined()
  })

  it('o limite de um cliente nao derruba o outro', async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) {
      await limitar('bot-triagem@empresa.com')
    }
    await erroDe(limitar('bot-triagem@empresa.com'))

    await expect(limitar('ana@empresa.com')).resolves.toBeUndefined()
  })
})

describe('token de maquina contra o banco (AC #1, #4)', () => {
  const auth = {
    repositorio: identidade,
    notificador: { async enviarLinkDeLogin() {} },
    agora: () => AGORA,
  }

  it('resolve o principal do bot com o papel do cadastro', async () => {
    const principal = await resolverPrincipalDeTokenMcp(auth)(TOKEN_DO_BOT)

    expect(principal).toEqual({ identity: 'bot-triagem@empresa.com', role: 'agente' })
  })

  it('token revogado para de resolver', async () => {
    await db
      .update(mcpTokens)
      .set({ revogadoEm: new Date(AGORA.getTime() - 1_000) })
      .where(eq(mcpTokens.identity, 'bot-triagem@empresa.com'))

    const erro = await erroDe(resolverPrincipalDeTokenMcp(auth)(TOKEN_DO_BOT))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })

  it('token de bot removido do cadastro para de resolver', async () => {
    await db.delete(users).where(eq(users.email, 'bot-triagem@empresa.com'))

    const erro = await erroDe(resolverPrincipalDeTokenMcp(auth)(TOKEN_DO_BOT))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })

  it('o banco guarda o hash, nunca o token', async () => {
    const linhas = await db.select().from(mcpTokens)

    expect(JSON.stringify(linhas)).not.toContain(TOKEN_DO_BOT)
    expect(JSON.stringify(linhas)).toContain(hashToken(TOKEN_DO_BOT))
  })
})

describe('a auditoria distingue humano via IA de agente autonomo (AC #3)', () => {
  const auth = {
    repositorio: identidade,
    notificador: { async enviarLinkDeLogin() {} },
    agora: () => AGORA,
  }

  const abrirComo = async (token: string) => {
    const principal: Principal = {
      ...(await resolverPrincipalDeTokenMcp(auth)(token)),
      origin: 'mcp',
    }
    return abrirChamado({ repositorio: chamados })(
      { titulo: 'VPN fora do ar', descricao: 'Nao conecta.', categoria: 'rede' },
      principal,
    )
  }

  it('cada acao e atribuida a identidade do token que a fez', async () => {
    const doBot = await abrirComo(TOKEN_DO_BOT)
    const daAna = await abrirComo(TOKEN_DA_ANA)

    const [autorDoBot] = await db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.ticketNumber, doBot.number))
    const [autorDaAna] = await db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.ticketNumber, daAna.number))

    // A distincao do AD-9 e exatamente esta: nao ha campo "e um bot?" — o que
    // separa os dois casos e a IDENTIDADE, e por isso o token do agente
    // autonomo precisa ter identidade propria em vez de reusar a da pessoa.
    expect(autorDoBot?.autor).toBe('bot-triagem@empresa.com')
    expect(autorDaAna?.autor).toBe('ana@empresa.com')
    expect(autorDoBot?.autor).not.toBe(autorDaAna?.autor)
  })

  it('o nome da tool nao aparece como autor (FR-21, AD-9)', async () => {
    const { number } = await abrirComo(TOKEN_DO_BOT)

    const [registro] = await db
      .select()
      .from(auditEntries)
      .where(and(eq(auditEntries.ticketNumber, number), eq(auditEntries.origin, 'mcp')))

    expect(registro?.autor).not.toBe('abrir_chamado')
    expect(registro?.acao).toBe('abrir_chamado')
  })
})
