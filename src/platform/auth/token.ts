import { createHash, randomBytes } from 'node:crypto'

/**
 * Geracao e hash de credencial (Story 1.3).
 *
 * Duas regras que valem para o magic link e para a sessao:
 *
 * 1. O token cru existe UMA vez — no e-mail e na resposta da troca. Nunca
 *    persistido, nunca logado, nunca auditado (AD-9: o que vai ao Log de
 *    auditoria e a identidade, jamais a credencial).
 * 2. O que o banco guarda e o hash. Um dump de `login_links` ou `sessions`
 *    nao entrega nenhuma credencial utilizavel.
 */

/** 32 bytes = 256 bits. Um token adivinhavel e uma porta destrancada. */
const BYTES_DE_ENTROPIA = 32

export const gerarToken = (): string => randomBytes(BYTES_DE_ENTROPIA).toString('base64url')

/**
 * SHA-256 sem salt — deliberado, e a diferenca em relacao a senha.
 *
 * Salt existe para inviabilizar rainbow table sobre segredo de baixa entropia
 * (senhas humanas vem de um espaco pequeno e previsivel). Aqui o segredo tem
 * 256 bits sorteados: nao ha dicionario a percorrer nem tabela a pre-computar.
 * KDF lento (argon2/bcrypt) tambem nao se aplica — o custo protegeria contra
 * forca bruta que ja e inviavel, e seria pago a cada chamada de tool.
 */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex')
