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

/**
 * O adapter entrega os cabecalhos; quem os JULGA e `avaliarAutenticidade`, no
 * dominio (ver `domain/autenticidade-de-email.test.ts`). O que se testa aqui e
 * so a extracao — e, sobretudo, a ORDEM, porque a regra "so o primeiro vale"
 * depende dela.
 */
describe('cabecalhos de autenticidade', () => {
  it('mensagem sem o cabecalho devolve lista vazia', async () => {
    expect((await analisarMensagem(basica())).autenticacaoBruta).toEqual([])
  })

  /**
   * O `mailparser` entrega o VALOR do cabecalho, sem o nome — e e o valor que
   * o dominio julga.
   */
  it('um cabecalho vira lista de um, com o valor', async () => {
    const valor = 'mx.empresa.com; dmarc=pass'

    expect(
      (await analisarMensagem(basica([`Authentication-Results: ${valor}`]))).autenticacaoBruta,
    ).toEqual([valor])
  })

  /**
   * A ordem e a defesa contra cabecalho forjado: o servidor de recepcao escreve
   * o dele no topo. Se o adapter embaralhasse ou invertesse, a regra do dominio
   * julgaria o cabecalho errado — e o teste do dominio continuaria verde.
   */
  it('preserva a ordem: o do servidor vem primeiro', async () => {
    const doServidor = 'Authentication-Results: mx.empresa.com; dkim=fail'
    const forjado = 'Authentication-Results: mx.forjado.com; dkim=pass'

    const m = await analisarMensagem(basica([doServidor, forjado]))

    expect(m.autenticacaoBruta[0]).toContain('mx.empresa.com')
    expect(m.autenticacaoBruta).toHaveLength(2)
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
      autenticacaoBruta: ['mx.e.com; dmarc=pass'],
    })
  })
})
