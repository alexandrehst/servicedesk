import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { users } from '../../../drizzle/schema.js'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { abrirChamadoPorEmail } from '../../application/commands/abrir-chamado-por-email.js'
import type { MensagemRecebida } from '../../application/contracts/intake-de-email.js'
import type { Principal } from '../../application/contracts/principal.js'
import type { Logger } from '../../application/ports/logger.js'
import { verHistorico } from '../../application/queries/ver-historico.js'
import { criarIdentityRepository } from './identity-repository.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * O caminho inteiro contra o Postgres REAL: mensagem -> cadastro -> command da
 * Story 1.1 -> auditoria -> historico da Story 1.8.
 *
 * O que so aparece aqui e a AC #5: o `origin` gravado pelo intake precisa ser
 * distinguivel no Log, e isso atravessa cinco modulos e uma coluna do banco.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)
const identidades = criarIdentityRepository(db)

const registros: { nivel: string; evento: string }[] = []
const logger: Logger = {
  erro: (evento) => registros.push({ nivel: 'erro', evento }),
  aviso: (evento) => registros.push({ nivel: 'aviso', evento }),
}

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }

const processar = abrirChamadoPorEmail({
  identidades,
  repositorio,
  abrir: abrirChamado({ repositorio }),
  logger,
})

const mensagem = (parcial: Partial<MensagemRecebida> = {}): MensagemRecebida => ({
  messageId: '<abc@empresa.com>',
  de: 'marina@empresa.com',
  assunto: 'Notebook nao liga',
  corpo: 'Apertei o botao e nada acontece.',
  autenticacao: 'aprovada',
  ...parcial,
})

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE tickets, audit_entries, comments, email_intake, users RESTART IDENTITY`,
  )
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
  await db.insert(users).values([
    { email: 'marina@empresa.com', papel: 'solicitante' },
    { email: 'bruno@empresa.com', papel: 'agente' },
  ])
  registros.length = 0
})

afterAll(async () => {
  await sqlClient.end()
})

describe('do e-mail ao Chamado (AC #1)', () => {
  it('a mensagem vira Chamado com o Solicitante do cadastro', async () => {
    const resultado = await processar(mensagem())

    expect(resultado).toEqual({ tipo: 'aberto', numero: 1000 })

    const chamado = await repositorio.buscarPorNumero(1000)
    expect(chamado).not.toBeNull()
  })

  it('o Chamado nasce sem triagem de categoria', async () => {
    await processar(mensagem())

    const linhas = await db.execute(sql`SELECT categoria FROM tickets WHERE number = 1000`)
    expect(linhas[0]?.categoria).toBe('nao_classificado')
  })
})

describe('o Log distingue o canal (AC #5)', () => {
  it('a auditoria da abertura por e-mail tem origin email', async () => {
    await processar(mensagem())

    const { entradas } = await verHistorico({ repositorio })({ numero: 1000 }, bruno)

    expect(entradas).toHaveLength(1)
    expect(entradas[0]).toMatchObject({ acao: 'abrir_chamado', origin: 'email' })
  })

  /**
   * O autor e a identidade do CADASTRO (AD-9). Se fosse o texto do cabecalho,
   * bastaria escrever qualquer coisa no `From` para assinar a acao de outro —
   * e a auditoria registraria a mentira como fato.
   */
  it('o autor e a identidade do cadastro, nao o texto do cabecalho', async () => {
    await processar(mensagem({ de: '  MARINA@Empresa.COM  ' }))

    const { entradas } = await verHistorico({ repositorio })({ numero: 1000 }, bruno)
    expect(entradas[0]?.autor).toBe('marina@empresa.com')
  })

  /**
   * A revisao da Story 1.8 filtra por origem. Este teste prova que o canal
   * novo e recortavel — que era exatamente o motivo de nao reaproveitar `api`.
   */
  it('o filtro de origem separa o que entrou por e-mail do que entrou por MCP', async () => {
    await processar(mensagem())
    await abrirChamado({ repositorio })(
      { titulo: 'Via MCP', descricao: 'Aberto pela IA.', categoria: 'rede' },
      { identity: 'bot@empresa.com', role: 'agente', origin: 'mcp' },
    )

    const porEmail = await verHistorico({ repositorio })({ numero: 1000, origem: 'email' }, bruno)
    const porMcp = await verHistorico({ repositorio })({ numero: 1000, origem: 'mcp' }, bruno)

    expect(porEmail.entradas).toHaveLength(1)
    expect(porMcp.entradas).toHaveLength(0)
  })
})

describe('reentrega contra o banco de verdade (AC #4)', () => {
  it('a mesma mensagem duas vezes gera um Chamado so', async () => {
    const primeira = await processar(mensagem())
    const segunda = await processar(mensagem())

    expect(primeira).toEqual({ tipo: 'aberto', numero: 1000 })
    expect(segunda).toEqual({ tipo: 'duplicado', numero: 1000 })

    const linhas = await db.execute(sql`SELECT count(*)::int AS total FROM tickets`)
    expect(linhas[0]?.total).toBe(1)
  })

  it('mensagens diferentes do mesmo remetente geram Chamados diferentes', async () => {
    await processar(mensagem({ messageId: '<um@empresa.com>' }))
    await processar(mensagem({ messageId: '<dois@empresa.com>' }))

    const linhas = await db.execute(sql`SELECT count(*)::int AS total FROM tickets`)
    expect(linhas[0]?.total).toBe(2)
  })
})

describe('recusa nao deixa rastro no banco (AC #2, #3)', () => {
  it.each([
    ['autenticidade', mensagem({ autenticacao: 'reprovada' })],
    ['remetente desconhecido', mensagem({ de: 'estranho@fora.com' })],
  ] as const)('%s nao cria Chamado nem auditoria', async (_caso, entrada) => {
    await processar(entrada)

    const tickets = await db.execute(sql`SELECT count(*)::int AS total FROM tickets`)
    const auditoria = await db.execute(sql`SELECT count(*)::int AS total FROM audit_entries`)
    const intake = await db.execute(sql`SELECT count(*)::int AS total FROM email_intake`)

    expect(tickets[0]?.total).toBe(0)
    expect(auditoria[0]?.total).toBe(0)
    expect(intake[0]?.total).toBe(0)
  })

  /**
   * Escrita que nao aconteceu nao vira auditoria (Story 1.7) — mas a recusa
   * tambem nao pode ser invisivel: ela vira registro, no canal de aviso.
   */
  it('a recusa vira registro, e nao erro', async () => {
    await processar(mensagem({ de: 'estranho@fora.com' }))

    expect(registros).toEqual([{ nivel: 'aviso', evento: 'intake_de_email_recusado' }])
  })
})
