import { describe, expect, it } from 'vitest'
import { gerarToken, hashToken } from './token.js'

describe('gerarToken', () => {
  it('produz token com 256 bits de entropia em base64url', () => {
    const token = gerarToken()

    // 32 bytes em base64url sem padding = 43 caracteres.
    expect(token).toHaveLength(43)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('nao repete', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => gerarToken()))

    // Token previsivel e credencial adivinhavel. 100 sorteios iguais so
    // aconteceriam com um gerador quebrado.
    expect(tokens.size).toBe(100)
  })
})

describe('hashToken', () => {
  it('e deterministico', () => {
    const token = gerarToken()

    expect(hashToken(token)).toBe(hashToken(token))
  })

  it('produz SHA-256 em hexadecimal', () => {
    expect(hashToken('token-qualquer')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('nao devolve o token nem parte dele', () => {
    const token = gerarToken()
    const hash = hashToken(token)

    // O hash e o que vai para o banco. Se ele carregasse o token, um dump da
    // tabela seria um dump de credenciais validas.
    expect(hash).not.toContain(token)
    expect(hash).not.toBe(token)
  })

  it('muda inteiramente com um caractere diferente', () => {
    expect(hashToken('abcdefgh')).not.toBe(hashToken('abcdefgi'))
  })
})
