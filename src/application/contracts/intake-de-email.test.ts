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
  autenticacaoBruta: ['Authentication-Results: mx.empresa.com; dmarc=pass'],
} as const

describe('mensagemRecebidaSchema', () => {
  it('aceita uma mensagem completa e autenticada', () => {
    expect(mensagemRecebidaSchema.parse(mensagem)).toEqual(mensagem)
  })

  /**
   * O contrato carrega os cabecalhos CRUS, e nao um veredito pronto.
   *
   * Essa e a fronteira que o review do PR #43 corrigiu: com um campo
   * `autenticacao: 'aprovada'`, um adapter de entrada novo poderia calcular o
   * veredito com regra mais fraca — aceitar `spf=pass` sozinho, ou ler o
   * cabecalho errado — e o caso de uso nao teria como perceber. Entregando
   * texto, a unica implementacao possivel da politica e a do dominio.
   */
  it('nao aceita veredito pronto no lugar dos cabecalhos', () => {
    const comVeredito = { ...mensagem, autenticacaoBruta: 'aprovada' }
    expect(mensagemRecebidaSchema.safeParse(comVeredito).success).toBe(false)
  })

  it('aceita lista vazia — mensagem sem cabecalho de autenticacao', () => {
    expect(mensagemRecebidaSchema.safeParse({ ...mensagem, autenticacaoBruta: [] }).success).toBe(
      true,
    )
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

  /**
   * Campo ausente e recusa, e nao "sem cabecalho": um adapter que esquecesse de
   * preencher viraria, em silencio, um adapter sem verificacao de autenticidade.
   */
  it('recusa a mensagem sem o campo de autenticidade', () => {
    const { autenticacaoBruta: _, ...semVeredito } = mensagem
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
