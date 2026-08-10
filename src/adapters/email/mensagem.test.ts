import { describe, expect, it } from 'vitest'
import { analisarMensagem } from './mensagem.js'

/**
 * Mensagens `.eml` sinteticas, montadas a mao. E o equivalente do
 * `jsonTransport` da Story 1.6 para a direcao de entrada: exercita o parsing
 * de verdade — cabecalho dobrado, multipart, encoding — sem servidor IMAP,
 * que este ambiente nao tem.
 */

const eml = (linhas: readonly string[]): string => linhas.join('\r\n')

const basica = (extras: readonly string[] = []) =>
  eml([
    'From: Marina Souza <Marina@Empresa.com>',
    'To: suporte@empresa.com',
    'Subject: Notebook nao liga',
    'Message-ID: <abc123@empresa.com>',
    'Date: Mon, 10 Aug 2026 10:00:00 -0300',
    ...extras,
    '',
    'Apertei o botao e nada acontece.',
    '',
  ])

describe('campos da mensagem', () => {
  it('extrai remetente, assunto, corpo e Message-ID', async () => {
    const m = await analisarMensagem(basica())

    expect(m.de).toBe('Marina@Empresa.com')
    expect(m.assunto).toBe('Notebook nao liga')
    expect(m.corpo.trim()).toBe('Apertei o botao e nada acontece.')
    expect(m.messageId).toBe('<abc123@empresa.com>')
  })

  /** O display name nao e identidade — o que vale e o endereco. */
  it('separa o endereco do nome de exibicao', async () => {
    const m = await analisarMensagem(basica())
    expect(m.de).not.toContain('Marina Souza')
  })

  it('mensagem sem Message-ID devolve null, nao string vazia', async () => {
    const semId = eml([
      'From: marina@empresa.com',
      'Subject: Sem identificador',
      '',
      'Corpo qualquer.',
      '',
    ])

    expect((await analisarMensagem(semId)).messageId).toBeNull()
  })

  it('assunto ausente vira string vazia — quem decide o que fazer e o caso de uso', async () => {
    const semAssunto = eml(['From: marina@empresa.com', 'Message-ID: <x@y>', '', 'Corpo.', ''])

    expect((await analisarMensagem(semAssunto)).assunto).toBe('')
  })

  it('decodifica assunto em UTF-8 codificado (RFC 2047)', async () => {
    const acentuado = eml([
      'From: marina@empresa.com',
      'Subject: =?UTF-8?B?SW1wcmVzc29yYSBuw6NvIGltcHJpbWU=?=',
      'Message-ID: <x@y>',
      '',
      'Corpo.',
      '',
    ])

    expect((await analisarMensagem(acentuado)).assunto).toBe('Impressora não imprime')
  })
})

describe('multipart', () => {
  it('usa a parte de texto puro, nao a de HTML', async () => {
    const multipart = eml([
      'From: marina@empresa.com',
      'Subject: Com as duas partes',
      'Message-ID: <multi@empresa.com>',
      'Content-Type: multipart/alternative; boundary="LIMITE"',
      '',
      '--LIMITE',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'A versao em texto.',
      '',
      '--LIMITE',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>A versao em <b>HTML</b>.</p>',
      '',
      '--LIMITE--',
      '',
    ])

    const m = await analisarMensagem(multipart)

    expect(m.corpo.trim()).toBe('A versao em texto.')
    expect(m.corpo).not.toContain('<b>')
  })

  /**
   * Limitacao conhecida e deliberada: mensagem SO com HTML entra sem corpo, e
   * o caso de uso cai na regra do corpo vazio (descricao recebe o assunto).
   * Jogar HTML cru na Descricao seria pior — o Agente leria marcacao em vez do
   * relato.
   */
  it('mensagem so-HTML nao vaza marcacao para o corpo', async () => {
    const soHtml = eml([
      'From: marina@empresa.com',
      'Subject: So HTML',
      'Message-ID: <html@empresa.com>',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Relato em <b>HTML</b>.</p>',
      '',
    ])

    expect((await analisarMensagem(soHtml)).corpo).not.toContain('<p>')
  })
})

describe('veredito de autenticidade', () => {
  it('sem cabecalho de autenticacao o veredito e ausente', async () => {
    expect((await analisarMensagem(basica())).autenticacao).toBe('ausente')
  })

  it.each([
    'Authentication-Results: mx.empresa.com; dmarc=pass header.from=empresa.com',
    'Authentication-Results: mx.empresa.com; dkim=pass header.i=@empresa.com; spf=pass',
  ])('aprova quando %s', async (cabecalho) => {
    expect((await analisarMensagem(basica([cabecalho]))).autenticacao).toBe('aprovada')
  })

  it.each([
    'Authentication-Results: mx.empresa.com; dkim=fail; spf=fail; dmarc=fail',
    'Authentication-Results: mx.empresa.com; dkim=none; spf=softfail',
  ])('reprova quando %s', async (cabecalho) => {
    expect((await analisarMensagem(basica([cabecalho]))).autenticacao).toBe('reprovada')
  })

  /**
   * SPF sozinho NAO basta, e esta e a decisao mais sutil do adapter.
   *
   * SPF valida o envelope (`MAIL FROM`), e a identidade que o intake usa e o
   * cabecalho `From` — sao campos diferentes, e nada obriga que combinem. Um
   * dominio proprio com SPF valido pode enviar mensagem cujo `From` diz
   * `marina@empresa.com`. DKIM assina o cabecalho; DMARC exige alinhamento.
   */
  it('spf=pass sozinho nao aprova', async () => {
    const so_spf = 'Authentication-Results: mx.empresa.com; spf=pass smtp.mailfrom=fora.com'

    expect((await analisarMensagem(basica([so_spf]))).autenticacao).toBe('reprovada')
  })

  /**
   * O ATAQUE OBVIO: `Authentication-Results` e um cabecalho comum, e quem
   * envia pode escrever um. O servidor de recepcao adiciona o dele no TOPO
   * (cabecalhos sao prefixados), entao o primeiro e o unico confiavel.
   *
   * Ler "algum cabecalho diz pass" entregaria o intake a qualquer um.
   */
  it('ignora cabecalho forjado abaixo do que o servidor escreveu', async () => {
    const comForjado = basica([
      'Authentication-Results: mx.empresa.com; dkim=fail; dmarc=fail',
      'Authentication-Results: mx.forjado.com; dkim=pass; dmarc=pass',
    ])

    expect((await analisarMensagem(comForjado)).autenticacao).toBe('reprovada')
  })
})

describe('o resultado obedece ao contrato', () => {
  it('a saida passa pelo schema do intake', async () => {
    const m = await analisarMensagem(basica(['Authentication-Results: mx.e.com; dmarc=pass']))

    expect(m).toEqual({
      messageId: '<abc123@empresa.com>',
      de: 'Marina@Empresa.com',
      assunto: 'Notebook nao liga',
      corpo: expect.stringContaining('Apertei o botao'),
      autenticacao: 'aprovada',
    })
  })
})
