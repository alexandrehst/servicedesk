import { describe, expect, it } from 'vitest'
import { mensagemRecebidaSchema } from './intake-de-email.js'
import { principalSchema } from './principal.js'

/**
 * O contrato do intake e a fronteira mais exposta do projeto: e por aqui que
 * entra dado que ninguem controla. O que estes testes travam e o shape — o dia
 * em que alguem afrouxar a validacao da autenticidade, um teste reprova.
 */

const mensagem = {
  messageId: '<abc@empresa.com>',
  de: 'marina@empresa.com',
  assunto: 'Notebook nao liga',
  corpo: 'Apertei o botao e nada acontece.',
  autenticacao: 'aprovada',
} as const

describe('mensagemRecebidaSchema', () => {
  it('aceita uma mensagem completa e autenticada', () => {
    expect(mensagemRecebidaSchema.parse(mensagem)).toEqual(mensagem)
  })

  /**
   * O enum fechado e a defesa: um adapter que devolvesse `'ok'`, `true` ou
   * `'pass'` por engano seria recusado aqui, e nao viraria "autenticado" por
   * acidente de truthiness.
   */
  it.each(['ok', 'pass', 'true', '', 'APROVADA'])('recusa autenticacao %j', (autenticacao) => {
    expect(mensagemRecebidaSchema.safeParse({ ...mensagem, autenticacao }).success).toBe(false)
  })

  it.each(['aprovada', 'reprovada', 'ausente'])('aceita o veredito %s', (autenticacao) => {
    expect(mensagemRecebidaSchema.safeParse({ ...mensagem, autenticacao }).success).toBe(true)
  })

  /**
   * `Message-ID` e OPCIONAL no RFC 5322. Ausencia e `null`, nao string vazia:
   * string vazia e um identificador que casaria com a proxima mensagem sem
   * cabecalho, e duas mensagens diferentes viveriam como duplicata uma da
   * outra. Quem recusa e o processador, nao o schema.
   */
  it('representa Message-ID ausente como null', () => {
    expect(mensagemRecebidaSchema.safeParse({ ...mensagem, messageId: null }).success).toBe(true)
  })

  it('recusa a mensagem sem o campo de autenticidade', () => {
    const { autenticacao: _, ...semVeredito } = mensagem
    expect(mensagemRecebidaSchema.safeParse(semVeredito).success).toBe(false)
  })
})

describe('principal do intake', () => {
  /**
   * Prova que a lista do dominio (`ORIGENS`, Story 1.8) chega ao contrato sem
   * uma segunda declaracao: acrescentar `email` la bastou.
   */
  it('aceita origin email — a derivacao de ORIGENS funciona', () => {
    const principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'email' }
    expect(principalSchema.safeParse(principal).success).toBe(true)
  })
})
