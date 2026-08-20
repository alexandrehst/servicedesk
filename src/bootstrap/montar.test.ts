import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarServidorMcp } from '../adapters/mcp/server.js'
import { hashToken } from '../platform/auth/token.js'
import { lerConfig } from './config.js'
import { montar } from './montar.js'

/**
 * A raiz de composicao, montada de VERDADE (Story 5.1).
 *
 * O que este arquivo prova nao e que `montar` devolve um objeto — e que a
 * fiacao chega ao banco: a autenticacao resolve um token real, o servidor
 * registra as tools esperadas, e o principal carrega `origin: 'mcp'`.
 *
 * O que ele NAO testa e o transporte stdio. Isso e a biblioteca, e o teste
 * seria um duble confirmando que `connect` foi chamado — que nao prova nada. A
 * licao da 4.2: um duble prova o contrato que voce imaginou, nao o que existe.
 */
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'

const TOKEN = 'token-de-montagem'
const BOT = 'bot-da-montagem@empresa.com'

const config = lerConfig({ DATABASE_URL, SERVICEDESK_MCP_TOKEN: TOKEN })
const montagem = montar(config)

beforeAll(async () => {
  await montagem.db.execute(sql`DELETE FROM mcp_tokens WHERE identity = ${BOT}`)
  await montagem.db.execute(sql`DELETE FROM users WHERE email = ${BOT}`)
  await montagem.db.execute(sql`INSERT INTO users (email, papel) VALUES (${BOT}, 'agente')`)
  await montagem.db.execute(sql`
    INSERT INTO mcp_tokens (identity, token_hash, descricao)
    VALUES (${BOT}, ${hashToken(TOKEN)}, 'teste de montagem')
  `)
})

afterAll(async () => {
  await montagem.db.execute(sql`DELETE FROM mcp_tokens WHERE identity = ${BOT}`)
  await montagem.db.execute(sql`DELETE FROM users WHERE email = ${BOT}`)
  await montagem.fechar()
})

describe('a fiacao chega ao banco (AC #2)', () => {
  it('a autenticacao resolve o token de maquina contra `users`', async () => {
    const principal = await montagem.deps.autenticar()

    expect(principal).toEqual({ identity: BOT, role: 'agente' })
  })

  /**
   * A decisao central da story: resolver a CADA chamada, nunca guardar.
   *
   * O tipo de `autenticar` nao recebe parametro e e chamado por tool — o
   * comentario nele diz que "uma conexao MCP dura horas, e resolver uma unica
   * vez faria a sessao de 8 horas valer para sempre". Guardar o principal em
   * memoria na montagem seria exatamente essa sessao eterna.
   *
   * A prova: revogar o token no banco e chamar de novo. Se estivesse em cache,
   * continuaria valendo.
   */
  it('revogar o token derruba o acesso na chamada SEGUINTE, sem reiniciar', async () => {
    expect(await montagem.deps.autenticar()).toEqual({ identity: BOT, role: 'agente' })

    await montagem.db.execute(
      sql`UPDATE mcp_tokens SET revogado_em = now() WHERE identity = ${BOT}`,
    )

    await expect(montagem.deps.autenticar()).rejects.toThrow()

    await montagem.db.execute(sql`UPDATE mcp_tokens SET revogado_em = NULL WHERE identity = ${BOT}`)
    expect(await montagem.deps.autenticar()).toEqual({ identity: BOT, role: 'agente' })
  })

  it('o rate limit conta de verdade', async () => {
    // Nao estoura o limite (60/min); o que importa e que a chamada FUNCIONA —
    // ou seja, que o repositorio de limites esta ligado.
    await expect(montagem.deps.limitarChamadas(BOT)).resolves.toBeUndefined()
  })
})

describe('o servidor sobe com as tools esperadas (AC #1)', () => {
  it('as tools de escrita e de leitura estao registradas', async () => {
    const servidor = criarServidorMcp(montagem.deps)

    for (const tool of [
      'abrir_chamado',
      'comentar_chamado',
      'mudar_status',
      'fechar_chamado',
      'buscar_chamados',
      'ver_chamado',
      'exportar_csv',
      'importar_csv',
      'excluir_usuario',
      'relatorio_de_operacao',
    ]) {
      expect(servidor.toolInputSchemaJson(tool), `tool ausente: ${tool}`).toBeDefined()
    }
  })
})

describe('o que fica desligado sem configuracao (AC #4)', () => {
  it('sem SMTP, o canal de notificacao NAO e montado', () => {
    expect(montagem.deps.notificacao).toBeUndefined()
    // E o operador fica sabendo: a config registra o que ficou de fora.
    expect(config.recursosDesligados.join(' ')).toMatch(/e-mail/i)
  })

  it('com SMTP, o canal E montado', () => {
    const comEmail = montar(
      lerConfig({
        DATABASE_URL,
        SERVICEDESK_MCP_TOKEN: TOKEN,
        SMTP_HOST: 'smtp.empresa.com',
        SMTP_PORT: '587',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        EMAIL_REMETENTE: 'sd@empresa.com',
        BASE_URL: 'https://sd.empresa.com',
      }),
    )

    expect(comEmail.deps.notificacao).toBeDefined()

    // A URL do link e montada com a BASE_URL configurada — e o token viaja
    // nela e SO nela (AD-9). Sem esta assercao, um `montarUrl` que ignorasse a
    // base passaria, e o e-mail chegaria com link para lugar nenhum.
    const url = comEmail.deps.notificacao?.montarUrl(1042, 'tok')

    expect(url).toContain('https://sd.empresa.com')
    expect(url).toContain('1042')
    expect(url).toContain('tok')

    void comEmail.fechar()
  })
})
