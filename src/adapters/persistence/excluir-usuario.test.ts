import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { excluirUsuario } from '../../application/commands/excluir-usuario.js'
import type { Principal } from '../../application/contracts/principal.js'
import { verHistorico } from '../../application/queries/ver-historico.js'
import { criarIdentityRepository } from './identity-repository.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Excluir Usuario contra o Postgres real (Story 4.3, AC #1, #3, #4).
 *
 * Duas coisas so aparecem aqui, e nenhuma delas num duble:
 *
 * 1. **O primeiro registro do Log sem Chamado.** `audit_entries.ticket_number`
 *    virou nulo na 0014, e a pergunta que ninguem responde de graca e se ele
 *    continua FORA do historico de todo Chamado.
 * 2. **A exclusao nao apaga nada** — nem o Usuario, nem os Chamados dele, nem
 *    as credenciais.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const identidades = criarIdentityRepository(db)
const repositorio = criarTicketRepository(db)

const ANA = 'ana@empresa.com'
const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

/** Confirmacao de mentira: o que importa aqui e a exclusao, nao o AD-7. */
let alvosEmitidos: string[]
let confirmacaoVale: boolean
const confirmacao = {
  async emitir(pedido: { alvo: string }) {
    alvosEmitidos.push(pedido.alvo)
    return 'token'
  },
  async consumir() {
    return confirmacaoVale
  },
}

const excluir = () => excluirUsuario({ identidades, repositorio, confirmacao })

beforeEach(async () => {
  alvosEmitidos = []
  confirmacaoVale = true
  await db.execute(sql`TRUNCATE users, sessions, mcp_tokens, login_links RESTART IDENTITY`)
  await db.execute(sql`TRUNCATE tickets, comments, audit_entries RESTART IDENTITY`)
  await db.execute(sql`
    INSERT INTO users (email, papel)
    VALUES (${ANA}, 'agente'), ('bruno@empresa.com', 'agente'), ('marina@empresa.com', 'solicitante')
  `)
  await db.execute(sql`
    INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester, assignee)
    VALUES (1042, 'VPN', 'nao conecta', 'rede', 'em_andamento', 'media', 'marina@empresa.com', ${ANA}),
           (1043, 'Impressora', 'sem toner', 'hardware', 'fechado', 'media', 'marina@empresa.com', ${ANA}),
           (1044, 'Wifi', 'lento', 'rede', 'aberto', 'media', ${ANA}, NULL)
  `)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('a exclusao marca, e nao apaga (AC #1)', () => {
  it('o Usuario continua no banco, com `deleted_at`', async () => {
    await excluir()({ email: ANA, confirmacao: 'token' }, bruno)

    const [linha] = await db.execute(
      sql`SELECT email, papel, deleted_at FROM users WHERE email = ${ANA}`,
    )
    expect(linha?.email).toBe(ANA)
    expect(linha?.papel).toBe('agente')
    expect(linha?.deleted_at).not.toBeNull()
  })

  /** O historico do trabalho e o oposto do que a FR-23 quer perder. */
  it('os Chamados dela PERMANECEM — como Dona e como Solicitante', async () => {
    await excluir()({ email: ANA, confirmacao: 'token' }, bruno)

    const comoDona = await db.execute(
      sql`SELECT number FROM tickets WHERE assignee = ${ANA} ORDER BY number`,
    )
    const comoSolicitante = await db.execute(
      sql`SELECT number FROM tickets WHERE requester = ${ANA}`,
    )

    expect(comoDona.map((l) => l.number)).toEqual([1042, 1043])
    expect(comoSolicitante.map((l) => l.number)).toEqual([1044])
  })

  /** Anonimizar faria o Chamado e o Log mentirem sobre quem pediu o que. */
  it('o e-mail dela nao e anonimizado em lugar nenhum', async () => {
    await excluir()({ email: ANA, confirmacao: 'token' }, bruno)

    const [linha] = await db.execute(sql`SELECT requester FROM tickets WHERE number = 1044`)
    expect(linha?.requester).toBe(ANA)
  })
})

describe('o relatorio do que ficou parado', () => {
  /**
   * Nao ha redistribuicao automatica — um UPDATE em massa disparado por uma
   * exclusao e o efeito colateral invisivel que o AD-2 evita. O honesto e
   * contar e avisar.
   */
  it('conta os Chamados NAO encerrados dela, e nao mexe neles', async () => {
    const saida = await excluir()({ email: ANA, confirmacao: 'token' }, bruno)

    // 1042 esta em_andamento; 1043 esta fechado (historico, nao trabalho).
    expect(saida.chamadosSemDono).toBe(1)

    const [linha] = await db.execute(sql`SELECT assignee FROM tickets WHERE number = 1042`)
    expect(linha?.assignee).toBe(ANA)
  })
})

describe('o primeiro registro do Log que NAO e sobre um Chamado (AC #1)', () => {
  it('a exclusao e auditada com `ticket_number` nulo', async () => {
    await excluir()({ email: ANA, confirmacao: 'token' }, bruno)

    const [entrada] = await db.execute(
      sql`SELECT ticket_number, acao, autor, origin, de, para FROM audit_entries ORDER BY id`,
    )

    expect(entrada?.ticket_number).toBeNull()
    expect(entrada?.acao).toBe('excluir_usuario')
    expect(entrada?.autor).toBe('bruno@empresa.com')
    expect(entrada?.origin).toBe('mcp')
    // Quem FOI excluida. Sem isto o Log diria que alguem excluiu alguem.
    expect(entrada?.de).toBe(ANA)
  })

  /**
   * A sonda que a migration 0014 exige: entrada sem Chamado nao pode vazar
   * para o historico de Chamado nenhum. O `WHERE` por igualdade ja a exclui —
   * mas "ja exclui" e afirmacao, e afirmacao nao e teste (licao da 4.2).
   */
  it('ela NAO aparece no historico de nenhum Chamado', async () => {
    await excluir()({ email: ANA, confirmacao: 'token' }, bruno)

    const historico = await verHistorico({ repositorio })({ numero: 1042 }, bruno)
    expect(historico.entradas).toEqual([])

    // E existe no Log: o teste acima passaria com a auditoria inteira ausente.
    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM audit_entries WHERE acao = 'excluir_usuario'`,
    )
    expect(total).toBe(1)
  })
})

describe('as credenciais param de valer sem serem apagadas (AC #3)', () => {
  it('a sessao aberta antes deixa de resolver, e a linha fica', async () => {
    await identidades.criarSessao({
      email: ANA,
      tokenHash: 'sessao-da-ana',
      expiraEm: new Date(Date.now() + 8 * 60 * 60 * 1000),
    })

    await excluir()({ email: ANA, confirmacao: 'token' }, bruno)

    expect(await identidades.buscarSessaoPorHash('sessao-da-ana')).toBeNull()

    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM sessions WHERE token_hash = 'sessao-da-ana'`,
    )
    expect(total).toBe(1)
  })
})

describe('quem pode excluir Usuario, e o que nao se pode (AD-8)', () => {
  it('o Solicitante nao exclui ninguem', async () => {
    await expect(excluir()({ email: ANA, confirmacao: 'token' }, marina)).rejects.toThrow(
      /nao pode excluir/i,
    )

    const [linha] = await db.execute(sql`SELECT deleted_at FROM users WHERE email = ${ANA}`)
    expect(linha?.deleted_at).toBeNull()
  })

  it('ninguem exclui a si mesmo', async () => {
    await expect(
      excluir()({ email: 'bruno@empresa.com', confirmacao: 'token' }, bruno),
    ).rejects.toThrow(/a si mesmo/i)
  })

  /**
   * Inexistente e ja-excluido dao a MESMA resposta: distinguir transformaria a
   * tool num verificador de quem trabalha aqui.
   */
  it('e-mail que nao existe e Usuario ja excluido respondem igual', async () => {
    const inexistente = await excluir()(
      { email: 'ninguem@empresa.com', confirmacao: 'token' },
      bruno,
    ).catch((e: Error) => e.message)

    await excluir()({ email: ANA, confirmacao: 'token' }, bruno)
    const jaExcluida = await excluir()({ email: ANA, confirmacao: 'token' }, bruno).catch(
      (e: Error) => e.message,
    )

    expect(inexistente).toBe(jaExcluida)
  })

  it('quem nao pode excluir nao recebe cracha: nenhum token e emitido', async () => {
    await expect(excluir()({ email: ANA }, marina)).rejects.toThrow(/nao pode excluir/i)

    expect(alvosEmitidos).toEqual([])
  })
})

describe('a confirmacao e obrigatoria (AC #4, AD-7)', () => {
  it('sem confirmacao, nada e excluido — e vem o token', async () => {
    await expect(excluir()({ email: ANA }, bruno)).rejects.toThrow(/IRREVERSIVEL/i)

    expect(alvosEmitidos).toEqual([`usuario:${ANA}`])

    const [linha] = await db.execute(sql`SELECT deleted_at FROM users WHERE email = ${ANA}`)
    expect(linha?.deleted_at).toBeNull()
  })

  it('confirmacao que nao serve nao exclui', async () => {
    confirmacaoVale = false

    await expect(excluir()({ email: ANA, confirmacao: 'token-ruim' }, bruno)).rejects.toThrow(
      /Confirmacao invalida/i,
    )

    const [linha] = await db.execute(sql`SELECT deleted_at FROM users WHERE email = ${ANA}`)
    expect(linha?.deleted_at).toBeNull()
  })

  it('o token e emitido para o Usuario EXATO, nao para "excluir usuario"', async () => {
    await expect(excluir()({ email: ANA }, bruno)).rejects.toThrow()
    await expect(excluir()({ email: 'marina@empresa.com' }, bruno)).rejects.toThrow()

    // Alvos diferentes: um token nao serve para o outro.
    expect(alvosEmitidos).toEqual([`usuario:${ANA}`, 'usuario:marina@empresa.com'])
  })
})

describe('o REPOSITORIO sozinho, sem o command na frente', () => {
  /**
   * A oitava vez que este padrao aparece no projeto: **o gargalo do command
   * mascara o defeito do adapter.**
   *
   * `excluirUsuario` chama `buscarUsuarioPorEmail` antes, e ele ja filtra o
   * excluido — entao o adapter nunca recebe um ja-excluido por esse caminho, e
   * uma mutacao que tirasse o `deleted_at IS NULL` do `UPDATE` sobreviveria a
   * suite inteira. Sobreviveu, de fato, na primeira rodada de
   * `mutacoes-43.py`.
   *
   * O port e publico: o adapter HTTP da Fase 1.5 pode chamar direto. A garantia
   * tem de estar NELE, e por isso este teste pula o command.
   */
  it('excluir duas vezes registra UMA vez', async () => {
    const primeira = await identidades.excluirUsuarioComAuditoria(ANA, bruno)
    const segunda = await identidades.excluirUsuarioComAuditoria(ANA, bruno)

    expect(primeira).toBe(true)
    // Nao havia mais o que excluir — e "nao aconteceu" nao vira Log (1.7).
    expect(segunda).toBe(false)

    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM audit_entries WHERE acao = 'excluir_usuario'`,
    )
    expect(total).toBe(1)
  })

  it('e a data da exclusao nao e sobrescrita pela segunda tentativa', async () => {
    await identidades.excluirUsuarioComAuditoria(ANA, bruno)
    const [antes] = await db.execute(sql`SELECT deleted_at FROM users WHERE email = ${ANA}`)

    await identidades.excluirUsuarioComAuditoria(ANA, bruno)
    const [depois] = await db.execute(sql`SELECT deleted_at FROM users WHERE email = ${ANA}`)

    // Sobrescrever moveria a data para frente e faria o Log e a coluna
    // discordarem sobre QUANDO a pessoa perdeu o acesso.
    expect(depois?.deleted_at).toEqual(antes?.deleted_at)
  })

  it('e-mail que nunca existiu devolve false, sem gravar nada', async () => {
    const excluiu = await identidades.excluirUsuarioComAuditoria('ninguem@empresa.com', bruno)

    expect(excluiu).toBe(false)

    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM audit_entries`,
    )
    expect(total).toBe(0)
  })
})
