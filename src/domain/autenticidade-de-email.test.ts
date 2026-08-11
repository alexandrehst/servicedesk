import { describe, expect, it } from 'vitest'
import { avaliarAutenticidade } from './autenticidade-de-email.js'

/**
 * A politica de confianca do canal de e-mail. Ela mora no dominio, e nao no
 * adapter, porque e uma decisao sobre em quem acreditar — equivalente em
 * criticidade a autorizacao do AD-8.
 *
 * Enquanto esteve no adapter IMAP, um segundo adapter de entrada (webhook)
 * teria que redescobrir estas regras; uma versao mais fraca abriria bypass num
 * canal que o caso de uso trata como fonte de identidade.
 */

describe('ausencia de veredito', () => {
  it.each([
    ['lista vazia', []],
    ['cabecalho em branco', ['   ']],
  ])('recusa %s — ausencia nao e permissao', (_caso, cabecalhos) => {
    expect(avaliarAutenticidade(cabecalhos)).toBe('ausente')
  })
})

/**
 * Os cabecalhos chegam como VALOR, sem o nome — e o que o `mailparser`
 * entrega. Alguns casos abaixo trazem o nome junto de proposito: a regra nao
 * pode depender de o adapter ter removido o prefixo.
 */
describe('metodos que aprovam', () => {
  it.each([
    'mx.empresa.com; dmarc=pass header.from=empresa.com',
    'mx.empresa.com; dkim=pass header.i=@empresa.com; spf=pass',
    'Authentication-Results: MX.EMPRESA.COM; DKIM=PASS',
  ])('aprova %s', (cabecalho) => {
    expect(avaliarAutenticidade([cabecalho])).toBe('aprovada')
  })

  it.each([
    'Authentication-Results: mx.empresa.com; dkim=fail; spf=fail; dmarc=fail',
    'Authentication-Results: mx.empresa.com; dkim=none; spf=softfail',
    'Authentication-Results: mx.empresa.com; dmarc=temperror',
  ])('reprova %s', (cabecalho) => {
    expect(avaliarAutenticidade([cabecalho])).toBe('reprovada')
  })

  /**
   * SPF valida o envelope (`MAIL FROM`), e a identidade que o intake usa e o
   * cabecalho `From` — campos diferentes, e nada obriga que combinem. Um
   * dominio com SPF proprio e valido pode enviar mensagem cujo `From` diga
   * `marina@empresa.com`. DKIM assina o cabecalho; DMARC exige alinhamento.
   */
  it('spf=pass sozinho nao aprova', () => {
    const soSpf = 'Authentication-Results: mx.empresa.com; spf=pass smtp.mailfrom=fora.com'

    expect(avaliarAutenticidade([soSpf])).toBe('reprovada')
  })

  /** `dkim=passed` ou `dkim=passing` nao sao `pass`. A borda da palavra importa. */
  it('nao confunde prefixo com o veredito', () => {
    expect(avaliarAutenticidade(['Authentication-Results: mx; dkim=passable'])).toBe('reprovada')
  })
})

describe('cabecalho forjado', () => {
  /**
   * O ATAQUE OBVIO: `Authentication-Results` e um cabecalho comum, e quem envia
   * pode escrever um. O servidor de recepcao adiciona o dele no TOPO, porque
   * cabecalhos sao prefixados — entao o primeiro e o unico confiavel.
   *
   * Ler "algum cabecalho diz pass" entregaria o intake a qualquer um.
   */
  it('ignora o que vem abaixo do cabecalho do servidor', () => {
    const cabecalhos = [
      'Authentication-Results: mx.empresa.com; dkim=fail; dmarc=fail',
      'Authentication-Results: mx.forjado.com; dkim=pass; dmarc=pass',
    ]

    expect(avaliarAutenticidade(cabecalhos)).toBe('reprovada')
  })

  it('o inverso tambem vale: o veredito do servidor manda mesmo se o resto falha', () => {
    const cabecalhos = [
      'Authentication-Results: mx.empresa.com; dmarc=pass',
      'Authentication-Results: relay.antigo.com; dkim=fail',
    ]

    expect(avaliarAutenticidade(cabecalhos)).toBe('aprovada')
  })
})
