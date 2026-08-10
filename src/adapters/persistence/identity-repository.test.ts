import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { loginLinks, sessions, users } from '../../../drizzle/schema.js'
import type { NotificadorDeLogin } from '../../application/ports/notificador-de-login.js'
import { ehDomainError } from '../../domain/errors.js'
import {
  autenticarComLink,
  resolverPrincipal,
  solicitarLink,
} from '../../platform/auth/autenticacao.js'
import { hashToken } from '../../platform/auth/token.js'
import { criarIdentityRepository } from './identity-repository.js'

/**
 * Integracao com Postgres REAL. O que esta story precisa provar — uso unico do
 * link garantido por UPDATE atomico, papel lido por join no momento da
 * resolucao, e ausencia de token cru no banco — depende do banco de verdade.
 * Um duble provaria apenas que o duble funciona.
 *
 * Arquivo separado do `ticket-repository.test.ts` porque trunca tabelas
 * DIFERENTES. Dois arquivos truncando as mesmas tabelas rodariam em paralelo
 * no Vitest e um limparia a base do outro — foi o motivo de a Story 1.2 juntar
 * tudo num arquivo so.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const repositorio = criarIdentityRepository(db)

const AGORA = new Date('2026-08-10T12:00:00.000Z')

let enviados: { email: string; token: string }[] = []

const notificador: NotificadorDeLogin = {
  async enviarLinkDeLogin(email, token) {
    enviados.push({ email, token })
  },
}

const deps = { repositorio, notificador, agora: () => AGORA }

const erroDe = async (promessa: Promise<unknown>): Promise<Error> => {
  try {
    await promessa
  } catch (erro) {
    if (ehDomainError(erro)) {
      return erro
    }
    throw erro
  }
  throw new Error('Esperava erro de dominio, mas a operacao foi bem-sucedida.')
}

/** Percorre o fluxo real: pede o link, captura o token entregue, troca por sessao. */
const entrar = async (email: string) => {
  await solicitarLink(deps)({ email })
  const envio = enviados.at(-1)
  if (envio === undefined) throw new Error('nenhum link foi enviado')
  return { token: envio.token, sessao: await autenticarComLink(deps)({ token: envio.token }) }
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, login_links, sessions RESTART IDENTITY`)
  await db.insert(users).values([
    { email: 'ana@empresa.com', papel: 'agente' },
    { email: 'joao@empresa.com', papel: 'solicitante' },
  ])
  enviados = []
})

afterAll(async () => {
  await sqlClient.end()
})

describe('fluxo completo (AC #1, #2)', () => {
  it('e-mail cadastrado vira sessao que resolve o principal', async () => {
    const { sessao } = await entrar('ana@empresa.com')

    const principal = await resolverPrincipal(deps)(sessao.tokenDeSessao)

    expect(principal).toEqual({ identity: 'ana@empresa.com', role: 'agente' })
  })

  it('o papel vem do cadastro: o mesmo fluxo devolve solicitante para quem e solicitante', async () => {
    const { sessao } = await entrar('joao@empresa.com')

    expect(sessao.role).toBe('solicitante')
  })

  it('a sessao vale 8 horas a partir da troca', async () => {
    const { sessao } = await entrar('ana@empresa.com')

    expect(new Date(sessao.expiraEm).getTime()).toBe(AGORA.getTime() + 8 * 60 * 60 * 1000)
  })
})

describe('uso unico do link (AC #4)', () => {
  it('o mesmo token nao entra duas vezes', async () => {
    const { token } = await entrar('ana@empresa.com')

    const erro = await erroDe(autenticarComLink(deps)({ token }))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })

  it('a segunda tentativa nao cria sessao nova', async () => {
    const { token } = await entrar('ana@empresa.com')

    await erroDe(autenticarComLink(deps)({ token }))

    const linhas = await db.select().from(sessions)
    expect(linhas).toHaveLength(1)
  })

  it('duas trocas simultaneas do mesmo link produzem UMA sessao', async () => {
    await solicitarLink(deps)({ email: 'ana@empresa.com' })
    const envio = enviados.at(-1)
    if (envio === undefined) throw new Error('nenhum link foi enviado')

    // A garantia de uso unico e do UPDATE ... WHERE usado_em IS NULL. Ler e
    // depois marcar deixaria as duas chamadas passarem pela leitura antes de
    // qualquer escrita — e esta corrida geraria duas sessoes.
    const resultados = await Promise.allSettled([
      autenticarComLink(deps)({ token: envio.token }),
      autenticarComLink(deps)({ token: envio.token }),
    ])

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.select().from(sessions)).toHaveLength(1)
  })
})

describe('expiracao contra o banco (AC #4, #5)', () => {
  it('link com expira_em no passado nao vira sessao', async () => {
    await db.insert(loginLinks).values({
      email: 'ana@empresa.com',
      tokenHash: hashToken('token-velho'),
      expiraEm: new Date(AGORA.getTime() - 1_000),
    })

    const erro = await erroDe(autenticarComLink(deps)({ token: 'token-velho' }))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
    expect(await db.select().from(sessions)).toHaveLength(0)
  })

  it('sessao com expira_em no passado nao resolve principal', async () => {
    await db.insert(sessions).values({
      email: 'ana@empresa.com',
      tokenHash: hashToken('sessao-velha'),
      expiraEm: new Date(AGORA.getTime() - 1_000),
    })

    const erro = await erroDe(resolverPrincipal(deps)('sessao-velha'))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })
})

describe('nao vazar quem esta cadastrado (AC #3)', () => {
  it('e-mail fora do cadastro nao gera linha em login_links', async () => {
    await solicitarLink(deps)({ email: 'estranho@empresa.com' })

    expect(await db.select().from(loginLinks)).toHaveLength(0)
    expect(enviados).toHaveLength(0)
  })

  it('a resposta e identica a de um e-mail cadastrado', async () => {
    const conhecido = await solicitarLink(deps)({ email: 'ana@empresa.com' })
    const estranho = await solicitarLink(deps)({ email: 'estranho@empresa.com' })

    expect(estranho).toEqual(conhecido)
  })
})

describe('o banco nunca ve a credencial (AC #6)', () => {
  it('nem o token do link nem o da sessao aparecem em qualquer coluna', async () => {
    const { token, sessao } = await entrar('ana@empresa.com')

    const linhasDeLink = await db.select().from(loginLinks)
    const linhasDeSessao = await db.select().from(sessions)
    const tudo = JSON.stringify([linhasDeLink, linhasDeSessao])

    expect(tudo).not.toContain(token)
    expect(tudo).not.toContain(sessao.tokenDeSessao)
    // E o hash esta la — senao o teste acima passaria com as tabelas vazias.
    expect(tudo).toContain(hashToken(token))
    expect(tudo).toContain(hashToken(sessao.tokenDeSessao))
  })
})

describe('papel e existencia sao lidos no momento da resolucao', () => {
  it('rebaixar o usuario derruba o privilegio da sessao ja aberta', async () => {
    const { sessao } = await entrar('ana@empresa.com')

    await db.update(users).set({ papel: 'solicitante' }).where(eq(users.email, 'ana@empresa.com'))

    const principal = await resolverPrincipal(deps)(sessao.tokenDeSessao)
    // Papel congelado na sessao manteria o privilegio por ate 8 horas depois
    // do rebaixamento. Por isso `sessions` nao guarda papel.
    expect(principal.role).toBe('solicitante')
  })

  it('remover o usuario invalida a sessao dentro da validade', async () => {
    const { sessao } = await entrar('ana@empresa.com')

    await db.delete(users).where(eq(users.email, 'ana@empresa.com'))

    const erro = await erroDe(resolverPrincipal(deps)(sessao.tokenDeSessao))
    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })
})

describe('normalizacao de e-mail', () => {
  it('encontra o cadastro independentemente de caixa e espacos', async () => {
    await solicitarLink(deps)({ email: '  ANA@Empresa.COM  ' })

    const [linha] = await db.select().from(loginLinks)
    expect(linha?.email).toBe('ana@empresa.com')
  })
})
