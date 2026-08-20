import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CaixaDeEntrada } from '../application/ports/caixa-de-entrada.js'
import { hashToken } from '../platform/auth/token.js'
import { criarAplicacao } from './aplicacao.js'
import { lerConfig } from './config.js'
import { montar } from './montar.js'

/**
 * A aplicacao, sem o fio com o sistema operacional (Story 5.1).
 *
 * Este arquivo nasceu de um achado de cobertura: `servidor-mcp.ts` estava com
 * 0%, e a resposta preguicosa seria exclui-lo do Sonar. O problema real era que
 * ele misturava **decisao** (o intake sobe? o que avisar? em que ordem
 * encerrar?) com **fio** (`process.on`, `process.exit`, o transporte). A
 * decisao veio para ca e ganhou teste; o fio ficou la, e continua sem — porque
 * um duble confirmando que `connect` foi chamado nao prova que o servidor fala
 * MCP (licao da 4.2).
 */
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'

const TOKEN = 'token-da-aplicacao'
const BOT = 'bot-da-aplicacao@empresa.com'

const IMAP = {
  IMAP_HOST: 'imap.empresa.com',
  IMAP_PORT: '993',
  IMAP_USER: 'u',
  IMAP_PASS: 'p',
  IMAP_CAIXA: 'INBOX',
}

const base = { DATABASE_URL, SERVICEDESK_MCP_TOKEN: TOKEN }

/** Caixa de mentira: o teste nao abre conexao IMAP de verdade. */
const caixaVazia = (): CaixaDeEntrada => ({
  async buscarNaoProcessadas() {
    return []
  },
  async marcarProcessadas() {},
})

const montagemDeTeste = () => montar(lerConfig(base))

beforeAll(async () => {
  const m = montagemDeTeste()
  await m.db.execute(sql`DELETE FROM mcp_tokens WHERE identity = ${BOT}`)
  await m.db.execute(sql`DELETE FROM users WHERE email = ${BOT}`)
  await m.db.execute(sql`INSERT INTO users (email, papel) VALUES (${BOT}, 'agente')`)
  await m.db.execute(sql`
    INSERT INTO mcp_tokens (identity, token_hash, descricao)
    VALUES (${BOT}, ${hashToken(TOKEN)}, 'teste')
  `)
  await m.fechar()
})

afterAll(async () => {
  const m = montagemDeTeste()
  await m.db.execute(sql`DELETE FROM mcp_tokens WHERE identity = ${BOT}`)
  await m.db.execute(sql`DELETE FROM users WHERE email = ${BOT}`)
  await m.fechar()
})

describe('o intake so sobe se estiver configurado (AC #5)', () => {
  it('sem IMAP, nao ha agendador', async () => {
    const config = lerConfig(base)
    const montagem = montagemDeTeste()

    const app = criarAplicacao(config, montagem)

    expect(app.agendador).toBeNull()
    await app.encerrar('teste')
  })

  it('com IMAP, o agendador existe', async () => {
    const config = lerConfig({ ...base, ...IMAP, INTAKE_INTERVALO_MS: '999999' })
    const montagem = montagemDeTeste()

    const app = criarAplicacao(config, montagem, { criarCaixa: caixaVazia })

    expect(app.agendador).not.toBeNull()
    await app.encerrar('teste')
  })
})

describe('o que fica desligado VAI PARA O LOG (AC #4)', () => {
  /**
   * A sonda que importa. Verificar que o agendador e `null` passaria com o
   * intake sumindo em silencio — e um intake desligado e um intake quebrado se
   * parecem de fora.
   */
  it('sem SMTP e sem IMAP, os dois avisos sao registrados', async () => {
    const config = lerConfig(base)
    const montagem = montagemDeTeste()
    const avisos: string[] = []
    montagem.logger.aviso = (evento, dados) => {
      avisos.push(`${evento}:${String(dados.recurso)}`)
    }

    const app = criarAplicacao(config, montagem)

    expect(avisos).toHaveLength(2)
    expect(avisos.join(' ')).toMatch(/e-mail/i)
    expect(avisos.join(' ')).toMatch(/intake/i)
    await app.encerrar('teste')
  })
})

describe('o intake usa o canal de notificacao quando ele existe (AC #4)', () => {
  /**
   * O ramo que faltava cobrir, e ele nao e cosmetico: e o caminho em que um
   * Chamado aberto POR E-MAIL dispara o e-mail de confirmacao. Sem ele, o
   * intake abriria o Chamado e o Solicitante nao saberia — que e exatamente o
   * cenario que a Story 1.9 e a 1.6 existem para evitar juntas.
   */
  it('com SMTP e IMAP, o intake sobe COM o canal ligado', async () => {
    const config = lerConfig({
      ...base,
      ...IMAP,
      INTAKE_INTERVALO_MS: '999999',
      SMTP_HOST: 'smtp.empresa.com',
      SMTP_PORT: '587',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      EMAIL_REMETENTE: 'sd@empresa.com',
      BASE_URL: 'https://sd.empresa.com',
    })
    const montagem = montar(config)

    // O canal existe na montagem — e e ele que o intake recebe.
    expect(montagem.deps.notificacao).toBeDefined()

    const app = criarAplicacao(config, montagem, { criarCaixa: caixaVazia })

    expect(app.agendador).not.toBeNull()
    // E nada foi dado como desligado.
    expect(config.recursosDesligados).toEqual([])
    await app.encerrar('teste')
  })
})

describe('o encerramento (AC #1)', () => {
  /**
   * A ordem importa: fechar o pool antes de parar o agendador deixaria uma
   * varredura em voo falando com um banco ja fechado — e o erro apareceria
   * como falha de intake, escondendo a causa real.
   */
  it('para o agendador ANTES de fechar o pool', async () => {
    const config = lerConfig({ ...base, ...IMAP, INTAKE_INTERVALO_MS: '999999' })
    const montagem = montagemDeTeste()
    const ordem: string[] = []

    const fecharDeVerdade = montagem.fechar
    Object.assign(montagem, {
      fechar: async () => {
        ordem.push('fechar')
        await fecharDeVerdade()
      },
    })

    const app = criarAplicacao(config, montagem, { criarCaixa: caixaVazia })
    const pararDeVerdade = app.agendador?.parar
    Object.assign(app.agendador ?? {}, {
      parar: () => {
        ordem.push('parar')
        pararDeVerdade?.()
      },
    })

    await app.encerrar('SIGTERM')

    expect(ordem).toEqual(['parar', 'fechar'])
  })

  /**
   * Achado do review no PR #85: `agendador?.parar()` estava FORA do `try`, e
   * uma rejeicao dele nao seria interceptada por ninguem — os handlers de
   * SIGINT/SIGTERM sao registrados DEPOIS do `principal().catch(...)`. O
   * processo cairia por `unhandledRejection` cru, sem passar pelo logger: o
   * mesmo defeito que este PR ja tinha corrigido para o `fechar()`, reaberto
   * por outra via.
   *
   * O contrato agora e: **`encerrar` NUNCA rejeita.**
   */
  it('falha ao PARAR o agendador tambem vai para o log, sem rejeitar', async () => {
    const config = lerConfig({ ...base, ...IMAP, INTAKE_INTERVALO_MS: '999999' })
    const montagem = montagemDeTeste()
    const erros: { evento: string; dados: Record<string, string | number> }[] = []
    montagem.logger.erro = (evento, dados) => {
      erros.push({ evento, dados })
    }

    const app = criarAplicacao(config, montagem, { criarCaixa: caixaVazia })
    Object.assign(app.agendador ?? {}, {
      parar: () => {
        throw new Error('clearInterval explodiu')
      },
    })

    // Nao rejeita — devolve o codigo de saida.
    expect(await app.encerrar('SIGTERM')).toBe(1)
    expect(erros[0]?.evento).toBe('falha_ao_encerrar')
    expect(erros[0]?.dados.causa).toBe('clearInterval explodiu')

    await montagem.fechar()
  })

  it('devolve 0 no encerramento limpo', async () => {
    const app = criarAplicacao(lerConfig(base), montagemDeTeste())

    expect(await app.encerrar('SIGTERM')).toBe(0)
  })

  /**
   * O achado do `claude-review` no PR #85: sem o `catch`, a falha ao fechar o
   * pool virava `unhandledRejection` cru — invisivel para quem monitora pelo
   * log estruturado, que e o unico canal onde todo o resto do sistema aparece.
   */
  it('falha ao fechar o pool vai para o LOG, e o codigo de saida e 1', async () => {
    const montagem = montagemDeTeste()
    const erros: { evento: string; dados: Record<string, string | number> }[] = []
    montagem.logger.erro = (evento, dados) => {
      erros.push({ evento, dados })
    }
    const fecharDeVerdade = montagem.fechar
    Object.assign(montagem, {
      fechar: async () => {
        await fecharDeVerdade()
        throw new Error('pool nao respondeu')
      },
    })

    const app = criarAplicacao(lerConfig(base), montagem)

    expect(await app.encerrar('SIGTERM')).toBe(1)
    expect(erros[0]?.evento).toBe('falha_ao_encerrar')
    expect(erros[0]?.dados.sinal).toBe('SIGTERM')
    expect(erros[0]?.dados.causa).toBe('pool nao respondeu')
  })
})
