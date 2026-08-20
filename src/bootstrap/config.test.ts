import { describe, expect, it } from 'vitest'
import { ConfigInvalida, INTAKE_INTERVALO_PADRAO_MS, lerConfig } from './config.js'

/**
 * A config e a borda (Story 5.1).
 *
 * O que estes testes precisam provar nao e "lanca em algum lugar" — e que o
 * processo **nao sobe** sem o obrigatorio, e que o opcional ausente **desliga e
 * avisa**. A segunda metade e a que importa mais: desligado e quebrado se
 * parecem de fora, e a Story 1.9 ja tinha registrado isso ao criar `aviso` no
 * `Logger` ("uma recusa invisivel faz um intake quebrado parecer um intake sem
 * demanda").
 */
const MINIMO = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  SERVICEDESK_MCP_TOKEN: 'token',
}

const SMTP = {
  SMTP_HOST: 'smtp.empresa.com',
  SMTP_PORT: '587',
  SMTP_USER: 'u',
  SMTP_PASS: 'p',
  EMAIL_REMETENTE: 'servicedesk@empresa.com',
  BASE_URL: 'https://sd.empresa.com',
}

const IMAP = {
  IMAP_HOST: 'imap.empresa.com',
  IMAP_PORT: '993',
  IMAP_USER: 'u',
  IMAP_PASS: 'p',
  IMAP_CAIXA: 'INBOX',
}

describe('o obrigatorio (AC #3)', () => {
  it('sem DATABASE_URL o processo NAO sobe, e a mensagem diz o que falta', () => {
    expect(() => lerConfig({ SERVICEDESK_MCP_TOKEN: 'x' })).toThrow(ConfigInvalida)
    expect(() => lerConfig({ SERVICEDESK_MCP_TOKEN: 'x' })).toThrow(/DATABASE_URL/)
  })

  it('sem o token do MCP tambem nao sobe', () => {
    expect(() => lerConfig({ DATABASE_URL: 'x' })).toThrow(/SERVICEDESK_MCP_TOKEN/)
  })

  /** String vazia e o caso que passa despercebido: `FOO=` no `.env`. */
  it('vazio nao conta como preenchido', () => {
    expect(() => lerConfig({ ...MINIMO, DATABASE_URL: '' })).toThrow(/DATABASE_URL/)
  })

  it('com o minimo, sobe', () => {
    const config = lerConfig(MINIMO)

    expect(config.databaseUrl).toBe(MINIMO.DATABASE_URL)
    expect(config.mcpToken).toBe('token')
    expect(config.intakeIntervaloMs).toBe(INTAKE_INTERVALO_PADRAO_MS)
  })
})

describe('o opcional ausente DESLIGA e AVISA (AC #4)', () => {
  it('sem SMTP, o e-mail some — e aparece em recursosDesligados', () => {
    const config = lerConfig(MINIMO)

    expect(config.smtp).toBeNull()
    // A sonda que importa: sem esta linha, o e-mail sumiria em silencio e o
    // teste acima passaria igual.
    expect(config.recursosDesligados.join(' ')).toMatch(/e-mail/i)
  })

  it('sem IMAP, o intake some — e aparece em recursosDesligados', () => {
    const config = lerConfig(MINIMO)

    expect(config.imap).toBeNull()
    expect(config.recursosDesligados.join(' ')).toMatch(/intake/i)
  })

  it('com tudo configurado, nada fica desligado', () => {
    const config = lerConfig({ ...MINIMO, ...SMTP, ...IMAP })

    expect(config.smtp?.host).toBe('smtp.empresa.com')
    expect(config.smtp?.port).toBe(587)
    expect(config.imap?.caixa).toBe('INBOX')
    expect(config.recursosDesligados).toEqual([])
  })
})

describe('bloco pela METADE e engano, nao intencao', () => {
  /**
   * O caso perigoso. `SMTP_HOST` sem `SMTP_PASS` e alguem que TENTOU configurar
   * e-mail — tratar como "desligado" esconderia o erro de digitacao, e o
   * operador so descobriria quando percebesse que nenhum e-mail chegou.
   *
   * Ninguem preenche metade das credenciais de proposito.
   */
  it('SMTP incompleto FALHA, e diz o que falta', () => {
    const { SMTP_PASS: _, ...semSenha } = SMTP

    expect(() => lerConfig({ ...MINIMO, ...semSenha })).toThrow(ConfigInvalida)
    expect(() => lerConfig({ ...MINIMO, ...semSenha })).toThrow(/pass/)
  })

  it('IMAP incompleto FALHA', () => {
    const { IMAP_CAIXA: _, ...semCaixa } = IMAP

    expect(() => lerConfig({ ...MINIMO, ...semCaixa })).toThrow(/caixa/)
  })

  /** SMTP sem BASE_URL seria um e-mail que chega e nao leva a lugar nenhum. */
  it('SMTP sem BASE_URL nao passa: o link do e-mail seria inutil', () => {
    const { BASE_URL: _, ...semBase } = SMTP

    expect(() => lerConfig({ ...MINIMO, ...semBase })).toThrow(/baseUrl/)
  })
})

describe('o intervalo do intake', () => {
  it('respeita o valor informado', () => {
    expect(lerConfig({ ...MINIMO, INTAKE_INTERVALO_MS: '5000' }).intakeIntervaloMs).toBe(5000)
  })

  it('recusa valor invalido em vez de cair no padrao em silencio', () => {
    expect(() => lerConfig({ ...MINIMO, INTAKE_INTERVALO_MS: 'daqui a pouco' })).toThrow()
    expect(() => lerConfig({ ...MINIMO, INTAKE_INTERVALO_MS: '0' })).toThrow()
  })
})
