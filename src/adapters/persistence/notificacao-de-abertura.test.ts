import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ticketAccessLinks, tickets, users } from '../../../drizzle/schema.js'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import type { Principal } from '../../application/contracts/principal.js'
import type { Logger } from '../../application/ports/logger.js'
import type { NotificadorDeChamado } from '../../application/ports/notificador-de-chamado.js'
import { ehDomainError } from '../../domain/errors.js'
import { criarLinkDeAcesso, resolverAcessoAoChamado } from '../../platform/acesso/link-de-acesso.js'
import { criarLogger } from '../../platform/logging/logger.js'
import { urlDoChamado } from '../email/smtp.js'
import { criarTicketAccessRepository } from './ticket-access-repository.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Integracao com Postgres REAL: o que esta story precisa provar e o que
 * acontece com o CHAMADO quando o e-mail falha — e isso so aparece olhando a
 * tabela depois.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const chamados = criarTicketRepository(db)
const acessos = criarTicketAccessRepository(db)

const AGORA = new Date('2026-08-10T12:00:00.000Z')
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const entrada = {
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
} as const

let enviados: { destinatario: string; numero: number; status: string; link: string }[]
let logado: string[]

/** Esta suite so ABRE Chamado — a resolucao tem suite propria (Story 2.5). */
const naoResolve = async (): Promise<never> => {
  throw new Error('esta suite nao resolve Chamado')
}

const notificador: NotificadorDeChamado = {
  async enviarChamadoAberto(m) {
    enviados.push({
      destinatario: m.destinatario,
      numero: m.numero,
      status: m.status,
      link: m.link,
    })
  },
  enviarChamadoResolvido: naoResolve,
}

const notificadorQuebrado: NotificadorDeChamado = {
  async enviarChamadoAberto() {
    throw new Error('SMTP recusou a conexao')
  },
  enviarChamadoResolvido: naoResolve,
}

const logger: Logger = criarLogger((linha) => logado.push(linha))

const notificacao = (quem: NotificadorDeChamado) => ({
  notificador: quem,
  criarLink: criarLinkDeAcesso({ repositorio: acessos, agora: () => AGORA }),
  montarUrl: (numero: number, token: string) =>
    urlDoChamado('https://desk.empresa.com', numero, token),
  logger,
})

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
    sql`TRUNCATE tickets, audit_entries, comments, ticket_access_links, users RESTART IDENTITY`,
  )
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
  await db.insert(users).values({ email: 'marina@empresa.com', papel: 'solicitante' })
  enviados = []
  logado = []
})

afterAll(async () => {
  await sqlClient.end()
})

describe('o e-mail sai na abertura (AC #1)', () => {
  it('leva Numero, Status e link para o Solicitante', async () => {
    const { number } = await abrirChamado({
      repositorio: chamados,
      notificacao: notificacao(notificador),
    })(entrada, marina)

    const email = enviados[0]
    expect(email?.destinatario).toBe('marina@empresa.com')
    expect(email?.numero).toBe(number)
    expect(email?.status).toBe('aberto')
    expect(email?.link).toContain(`/chamados/${number}?acesso=`)
  })

  it('o link do e-mail resolve exatamente aquele Chamado (AC #2)', async () => {
    const { number } = await abrirChamado({
      repositorio: chamados,
      notificacao: notificacao(notificador),
    })(entrada, marina)

    const token = new URL(enviados[0]?.link ?? '').searchParams.get('acesso') ?? ''
    const acesso = await resolverAcessoAoChamado({ repositorio: acessos, agora: () => AGORA })(
      token,
    )

    expect(acesso).toEqual({ ticketNumber: number, email: 'marina@empresa.com' })
  })

  it('o banco guarda o hash, nunca o token do link (AC #6)', async () => {
    await abrirChamado({ repositorio: chamados, notificacao: notificacao(notificador) })(
      entrada,
      marina,
    )

    const token = new URL(enviados[0]?.link ?? '').searchParams.get('acesso') ?? ''
    const linhas = await db.select().from(ticketAccessLinks)

    expect(token).not.toBe('')
    expect(JSON.stringify(linhas)).not.toContain(token)
  })
})

describe('o e-mail nao derruba a abertura (AC #3, #4)', () => {
  it('SMTP fora do ar: o Chamado continua no banco', async () => {
    const saida = await abrirChamado({
      repositorio: chamados,
      notificacao: notificacao(notificadorQuebrado),
    })(entrada, marina)

    const [linha] = await db.select().from(tickets).where(eq(tickets.number, saida.number))

    // Um Chamado que nao existe porque o servidor de e-mail caiu e pior que um
    // Chamado sem e-mail. E por isso que a notificacao fica FORA da transacao.
    expect(linha?.number).toBe(saida.number)
    expect(saida.status).toBe('aberto')
  })

  it('a falha nao e engolida: vira registro estruturado', async () => {
    const { number } = await abrirChamado({
      repositorio: chamados,
      notificacao: notificacao(notificadorQuebrado),
    })(entrada, marina)

    expect(logado).toHaveLength(1)
    const registro = JSON.parse(logado[0] ?? '{}') as Record<string, unknown>
    expect(registro.evento).toBe('falha_ao_notificar_abertura')
    expect(registro.numero).toBe(number)
    expect(registro.causa).toContain('SMTP')
  })

  it('o registro de falha nao carrega token nem link', async () => {
    await abrirChamado({
      repositorio: chamados,
      notificacao: notificacao(notificadorQuebrado),
    })(entrada, marina)

    const [linha] = await db.select().from(ticketAccessLinks)
    expect(linha).toBeDefined()
    // O link ja tinha sido criado quando o envio falhou. O log nao pode
    // carrega-lo: log e um lugar por onde segredo vaza (AD-9).
    expect(logado[0]).not.toContain('acesso=')
    expect(logado[0]).not.toContain(linha?.tokenHash ?? 'impossivel')
  })

  it('falha que nao e Error tambem vira registro legivel', async () => {
    const lancaTexto: NotificadorDeChamado = {
      async enviarChamadoAberto() {
        // Biblioteca de terceiro que rejeita com string em vez de Error e algo
        // que acontece; o log nao pode virar "[object Object]" por causa disso.
        throw 'conexao recusada'
      },
      enviarChamadoResolvido: naoResolve,
    }

    await abrirChamado({ repositorio: chamados, notificacao: notificacao(lancaTexto) })(
      entrada,
      marina,
    )

    const registro = JSON.parse(logado[0] ?? '{}') as Record<string, unknown>
    expect(registro.causa).toBe('conexao recusada')
  })

  it('abrir sem notificacao configurada continua funcionando', async () => {
    const saida = await abrirChamado({ repositorio: chamados })(entrada, marina)

    expect(saida.number).toBeGreaterThan(0)
    expect(enviados).toHaveLength(0)
  })
})

describe('busca de link inexistente (AC #5)', () => {
  it('hash que nao esta na tabela devolve null', async () => {
    expect(await acessos.buscarLinkDeAcessoPorHash('hash-que-nao-existe')).toBeNull()
  })
})

describe('validade do link contra o banco (AC #2, #5)', () => {
  it('depois de 7 dias o link para de valer', async () => {
    await abrirChamado({ repositorio: chamados, notificacao: notificacao(notificador) })(
      entrada,
      marina,
    )
    const token = new URL(enviados[0]?.link ?? '').searchParams.get('acesso') ?? ''

    const seteDiasDepois = new Date(AGORA.getTime() + 7 * 24 * 60 * 60 * 1000)
    const erro = await erroDe(
      resolverAcessoAoChamado({ repositorio: acessos, agora: () => seteDiasDepois })(token),
    )

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })

  it('no sexto dia ainda vale', async () => {
    await abrirChamado({ repositorio: chamados, notificacao: notificacao(notificador) })(
      entrada,
      marina,
    )
    const token = new URL(enviados[0]?.link ?? '').searchParams.get('acesso') ?? ''

    const seisDiasDepois = new Date(AGORA.getTime() + 6 * 24 * 60 * 60 * 1000)
    const acesso = await resolverAcessoAoChamado({
      repositorio: acessos,
      agora: () => seisDiasDepois,
    })(token)

    expect(acesso.email).toBe('marina@empresa.com')
  })
})
