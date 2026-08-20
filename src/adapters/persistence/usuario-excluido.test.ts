import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { abrirChamadoPorEmail } from '../../application/commands/abrir-chamado-por-email.js'
import { atribuirChamado } from '../../application/commands/atribuir-chamado.js'
import type { Principal } from '../../application/contracts/principal.js'
import { criarIdentityRepository } from './identity-repository.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * O Usuario excluido deixa de existir para o sistema (Story 4.3, AC #3).
 *
 * **Cada teste deste arquivo exercita UM caminho.** Isso e deliberado e vale
 * explicar, porque a forma preguicosa passaria: um unico teste que criasse o
 * Usuario, o excluisse e tentasse logar ficaria verde mesmo que so uma das
 * camadas filtrasse — e o projeto ja levou essa licao tres vezes (3.1, 3.6,
 * 4.2). **A redundancia que protege tambem esconde.**
 *
 * Sao tres camadas no `identity-repository`, e elas cobrem seis caminhos:
 *
 * | Camada | Quem depende dela |
 * | --- | --- |
 * | `buscarUsuarioPorEmail` | pedir login, consumir link, atribuir, intake |
 * | `buscarSessaoPorHash` | **a sessao JA ABERTA** |
 * | `buscarTokenMcpPorHash` | o agente autonomo |
 *
 * A sessao ja aberta e a sonda que mais importa: um teste que so faca login
 * novo passa mesmo com a sessao antiga valendo para sempre. E foi exatamente
 * para isso que a Story 1.3 guardou o papel em `users` e nao em `sessions` —
 * "para que rebaixamento e remocao valham imediatamente em vez de esperar a
 * sessao expirar". Esta story e o dia em que essa decisao e cobrada.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const repositorio = criarIdentityRepository(db)

const ANA = 'ana@empresa.com'
const AMANHA = new Date(Date.now() + 8 * 60 * 60 * 1000)

const excluirAna = () => db.execute(sql`UPDATE users SET deleted_at = now() WHERE email = ${ANA}`)

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, sessions, login_links, mcp_tokens RESTART IDENTITY`)
  await db.execute(sql`INSERT INTO users (email, papel) VALUES (${ANA}, 'agente')`)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('camada 1 — `buscarUsuarioPorEmail`', () => {
  it('o Usuario vivo e encontrado', async () => {
    expect(await repositorio.buscarUsuarioPorEmail(ANA)).toEqual({ email: ANA, papel: 'agente' })
  })

  /**
   * Fecha quatro caminhos de uma vez: pedir link de login, consumir link,
   * validar destinatario de atribuicao (2.3) e reconhecer remetente no intake
   * de e-mail (1.9).
   */
  it('o Usuario excluido some — e e indistinguivel de nunca ter existido', async () => {
    await excluirAna()

    expect(await repositorio.buscarUsuarioPorEmail(ANA)).toBeNull()
    expect(await repositorio.buscarUsuarioPorEmail('nunca@existiu.com')).toBeNull()
  })

  /** A linha PERMANECE: soft-delete, nao DELETE. */
  it('a linha continua no banco depois de excluida', async () => {
    await excluirAna()

    const [linha] = await db.execute(
      sql`SELECT email, papel, deleted_at FROM users WHERE email = ${ANA}`,
    )
    expect(linha?.email).toBe(ANA)
    expect(linha?.papel).toBe('agente')
    expect(linha?.deleted_at).not.toBeNull()
  })
})

describe('camada 2 — a sessao JA ABERTA', () => {
  /**
   * A sonda que um teste de "login novo" nunca pegaria. Sem ela, um Agente
   * desligado continuaria operando por ate 8 horas com a sessao que ja tinha.
   */
  it('a sessao aberta ANTES da exclusao para de valer na hora', async () => {
    await repositorio.criarSessao({ email: ANA, tokenHash: 'hash-da-sessao', expiraEm: AMANHA })

    // Antes: vale.
    expect(await repositorio.buscarSessaoPorHash('hash-da-sessao')).toMatchObject({
      email: ANA,
      papel: 'agente',
    })

    await excluirAna()

    // Depois: nao vale — sem esperar a sessao expirar.
    expect(await repositorio.buscarSessaoPorHash('hash-da-sessao')).toBeNull()
  })

  it('a linha da sessao NAO e apagada: ela para de resolver', async () => {
    await repositorio.criarSessao({ email: ANA, tokenHash: 'hash-da-sessao', expiraEm: AMANHA })
    await excluirAna()

    // Apagar a credencial seria exclusao FISICA — o que esta story proibe.
    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM sessions WHERE token_hash = 'hash-da-sessao'`,
    )
    expect(total).toBe(1)
  })
})

describe('camada 3 — o token MCP', () => {
  /**
   * O agente autonomo tem identidade propria (1.5), e e o caminho que MAIS
   * importa fechar: ele age sozinho, sem ninguem olhando.
   */
  it('o token MCP de quem foi excluido para de resolver', async () => {
    await db.execute(sql`
      INSERT INTO mcp_tokens (identity, token_hash, descricao)
      VALUES (${ANA}, 'hash-do-token', 'agente autonomo da ana')
    `)

    expect(await repositorio.buscarTokenMcpPorHash('hash-do-token')).toMatchObject({
      identity: ANA,
      papel: 'agente',
    })

    await excluirAna()

    expect(await repositorio.buscarTokenMcpPorHash('hash-do-token')).toBeNull()
  })
})

describe('as tres camadas sao independentes', () => {
  /**
   * O teste que prova que nenhuma esta carregando a outra: as tres credenciais
   * existem ao mesmo tempo, e as tres param juntas. Se apenas uma camada
   * filtrasse, duas destas asserções falhariam — e e por isso que elas estao
   * no MESMO teste, em vez de espalhadas.
   */
  it('sessao, token MCP e cadastro param todos na mesma exclusao', async () => {
    await repositorio.criarSessao({ email: ANA, tokenHash: 'sessao', expiraEm: AMANHA })
    await db.execute(sql`
      INSERT INTO mcp_tokens (identity, token_hash, descricao)
      VALUES (${ANA}, 'token-mcp', 'x')
    `)

    await excluirAna()

    expect(await repositorio.buscarUsuarioPorEmail(ANA)).toBeNull()
    expect(await repositorio.buscarSessaoPorHash('sessao')).toBeNull()
    expect(await repositorio.buscarTokenMcpPorHash('token-mcp')).toBeNull()
  })
})

describe('os caminhos que dependem das camadas (AC #3)', () => {
  const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
  const ticketRepo = criarTicketRepository(db)

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE tickets, comments, audit_entries, email_intake RESTART IDENTITY`)
    await db.execute(sql`INSERT INTO users (email, papel) VALUES ('bruno@empresa.com', 'agente')`)
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester)
      VALUES (1042, 'VPN', 'nao conecta', 'rede', 'aberto', 'media', 'marina@empresa.com')
    `)
  })

  /** Story 2.3: o destinatario e verificado no cadastro. Excluido nao esta la. */
  it('nao se atribui Chamado a quem foi excluido', async () => {
    const atribuir = atribuirChamado({ repositorio: ticketRepo, identidades: repositorio })

    // Antes da exclusao, a atribuicao funciona.
    await atribuir({ numero: 1042, agente: ANA, versao: 1 }, bruno)

    await excluirAna()

    await expect(atribuir({ numero: 1042, agente: ANA, versao: 2 }, bruno)).rejects.toThrow()

    // E o Chamado continua com o Dono que ja tinha: a recusa nao mexe em nada.
    const [linha] = await db.execute(sql`SELECT assignee FROM tickets WHERE number = 1042`)
    expect(linha?.assignee).toBe(ANA)
  })

  /**
   * Story 1.9: remetente fora do cadastro e RECUSADO, e a recusa e `aviso`, nao
   * `erro` — um Usuario excluido e o mesmo caso, e nao pode virar excecao.
   */
  it('o e-mail de quem foi excluido nao abre Chamado, e isso nao e erro', async () => {
    const avisos: string[] = []
    const logger = {
      erro: () => {
        throw new Error('remetente excluido nao e erro operacional')
      },
      aviso: (evento: string) => {
        avisos.push(evento)
      },
    }
    const abrirPorEmail = abrirChamadoPorEmail({
      repositorio: ticketRepo,
      identidades: repositorio,
      abrir: abrirChamado({ repositorio: ticketRepo }),
      logger,
    })

    await excluirAna()

    const resultado = await abrirPorEmail({
      messageId: 'msg-1',
      de: ANA,
      assunto: 'VPN caiu de novo',
      corpo: 'nao conecta',
      // DMARC passa: a recusa que este teste mede e a do CADASTRO, nao a de
      // autenticidade — senao ele ficaria verde pelo motivo errado.
      autenticacaoBruta: ['Authentication-Results: mx.empresa.com; dmarc=pass'],
    })

    expect(resultado.tipo).toBe('recusado')
    expect(avisos.length).toBeGreaterThan(0)

    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM tickets WHERE requester = ${ANA}`,
    )
    expect(total).toBe(0)
  })
})
