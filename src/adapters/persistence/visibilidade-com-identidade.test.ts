import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { comments, users } from '../../../drizzle/schema.js'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import type { Principal } from '../../application/contracts/principal.js'
import type { NotificadorDeLogin } from '../../application/ports/notificador-de-login.js'
import { verChamado } from '../../application/queries/ver-chamado.js'
import { ehDomainError } from '../../domain/errors.js'
import {
  autenticarComLink,
  resolverPrincipal,
  solicitarLink,
} from '../../platform/auth/autenticacao.js'
import { criarIdentityRepository } from './identity-repository.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * O teste que faltava depois da Story 1.3: identidade REAL alimentando a
 * autorizacao do dominio.
 *
 * Ate aqui, cada metade estava provada sozinha — a 1.2 testou a regra de
 * visibilidade com principal de duble, e a 1.3 testou a autenticacao sem nunca
 * consultar um Chamado. Ninguem tinha mostrado que o papel gravado em `users`
 * atravessa a sessao, chega ao dominio e muda o que a pessoa enxerga. Um erro
 * na costura entre as duas passaria pelos dois conjuntos de testes.
 *
 * Nada de principal de configuracao aqui: todo principal deste arquivo sai de
 * `resolverPrincipal` sobre uma sessao que nasceu de um magic link trocado de
 * verdade.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const identidade = criarIdentityRepository(db)
const chamados = criarTicketRepository(db)

const AGORA = new Date('2026-08-10T12:00:00.000Z')
let enviados: { email: string; token: string }[] = []

const notificador: NotificadorDeLogin = {
  async enviarLinkDeLogin(email, token) {
    enviados.push({ email, token })
  },
}

const auth = { repositorio: identidade, notificador, agora: () => AGORA }

const erroDe = async (promessa: Promise<unknown>): Promise<Error> => {
  try {
    await promessa
  } catch (erro) {
    if (ehDomainError(erro)) return erro
    throw erro
  }
  throw new Error('Esperava erro de dominio, mas a operacao foi bem-sucedida.')
}

/** Fluxo real de login: pede o link, troca o token e guarda o da sessao. */
const entrar = async (email: string): Promise<string> => {
  await solicitarLink(auth)({ email })
  const envio = enviados.at(-1)
  if (envio === undefined) throw new Error(`nenhum link enviado para ${email}`)
  const { tokenDeSessao } = await autenticarComLink(auth)({ token: envio.token })
  return tokenDeSessao
}

/** O principal como o adapter MCP o monta: resolvido da sessao + origem. */
const principalDe = async (tokenDeSessao: string): Promise<Principal> => ({
  ...(await resolverPrincipal(auth)(tokenDeSessao)),
  origin: 'mcp',
})

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE users, login_links, sessions, tickets, audit_entries, comments RESTART IDENTITY`,
  )
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
  await db.insert(users).values([
    { email: 'marina@empresa.com', papel: 'solicitante' },
    { email: 'carlos@empresa.com', papel: 'solicitante' },
    { email: 'bruno@empresa.com', papel: 'agente' },
  ])
  enviados = []
})

afterAll(async () => {
  await sqlClient.end()
})

/** Marina abre um Chamado e o time deixa um Comentario interno nele. */
const chamadoDaMarina = async () => {
  const sessao = await entrar('marina@empresa.com')
  const marina = await principalDe(sessao)

  const { number } = await abrirChamado({ repositorio: chamados })(
    { titulo: 'Notebook nao liga', descricao: 'Sem resposta ao botao.', categoria: 'hardware' },
    marina,
  )

  await db.insert(comments).values([
    { ticketNumber: number, autor: 'marina@empresa.com', corpo: 'Parou hoje.', internal: false },
    {
      ticketNumber: number,
      autor: 'bruno@empresa.com',
      corpo: 'Fonte queimada, trocar antes de devolver.',
      internal: true,
    },
  ])

  return { number, marina }
}

const ver = (quem: Principal, numero: number) =>
  verChamado({ repositorio: chamados })({ numero }, quem)

describe('papel errado (AC #1)', () => {
  it('Solicitante nao ve o Chamado de outro Solicitante', async () => {
    const { number } = await chamadoDaMarina()
    const carlos = await principalDe(await entrar('carlos@empresa.com'))

    const erro = await erroDe(ver(carlos, number))

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })

  it('o erro do Chamado alheio e identico ao de um Numero inexistente', async () => {
    const { number } = await chamadoDaMarina()
    const carlos = await principalDe(await entrar('carlos@empresa.com'))

    const alheio = await erroDe(ver(carlos, number))
    const inexistente = await erroDe(ver(carlos, 999_999))

    // Comparados ENTRE SI e com o Numero normalizado: um Numero existente e um
    // inexistente sao diferentes por definicao, e o Numero nao e vazamento —
    // quem perguntou ja o conhecia. Qualquer OUTRA diferenca seria.
    const forma = (e: Error, n: number) => ({
      name: e.name,
      code: ehDomainError(e) ? e.code : undefined,
      message: e.message.replace(`#${n}`, '#N'),
    })

    expect(forma(alheio, number)).toEqual(forma(inexistente, 999_999))
  })
})

describe('papel certo (AC #2, #3)', () => {
  it('o dono ve o proprio Chamado, sem os Comentarios internos', async () => {
    const { number, marina } = await chamadoDaMarina()

    const saida = await ver(marina, number)

    expect(saida.number).toBe(number)
    expect(saida.comentarios).toHaveLength(1)
    expect(saida.comentarios.every((c) => !c.internal)).toBe(true)
  })

  it('o Agente ve o Chamado alheio e a thread inteira', async () => {
    const { number } = await chamadoDaMarina()
    const bruno = await principalDe(await entrar('bruno@empresa.com'))

    const saida = await ver(bruno, number)

    expect(saida.number).toBe(number)
    expect(saida.comentarios).toHaveLength(2)
    expect(saida.comentarios.some((c) => c.internal)).toBe(true)
  })

  it('a identidade autenticada e a que vira requester do Chamado (AD-9)', async () => {
    const { number, marina } = await chamadoDaMarina()

    const saida = await ver(marina, number)

    // Nao ha entrada de `requester` no contrato: ele sai do principal. Este
    // teste trava isso ponta a ponta, com a identidade vinda da sessao.
    expect(saida.requester).toBe('marina@empresa.com')
  })
})

describe('o papel vem do cadastro, nao da sessao (AC #3)', () => {
  it('promover o usuario muda o que a MESMA sessao enxerga', async () => {
    const { number } = await chamadoDaMarina()
    const sessaoDoCarlos = await entrar('carlos@empresa.com')

    const antes = await erroDe(ver(await principalDe(sessaoDoCarlos), number))
    expect(ehDomainError(antes) && antes.code).toBe('TicketNaoEncontrado')

    await db.update(users).set({ papel: 'agente' }).where(eq(users.email, 'carlos@empresa.com'))

    // Mesma sessao, mesmo token, mesmo Chamado — muda so a linha em `users`.
    // Se o papel estivesse congelado na sessao, esta consulta ainda falharia.
    const depois = await ver(await principalDe(sessaoDoCarlos), number)
    expect(depois.number).toBe(number)
    expect(depois.comentarios).toHaveLength(2)
  })

  it('rebaixar o usuario esconde de volta o Chamado alheio', async () => {
    const { number } = await chamadoDaMarina()
    const sessaoDoBruno = await entrar('bruno@empresa.com')

    expect((await ver(await principalDe(sessaoDoBruno), number)).number).toBe(number)

    await db.update(users).set({ papel: 'solicitante' }).where(eq(users.email, 'bruno@empresa.com'))

    const erro = await erroDe(ver(await principalDe(sessaoDoBruno), number))
    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })
})
