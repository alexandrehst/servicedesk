import type { Transporter } from 'nodemailer'
import { createTransport } from 'nodemailer'
import { beforeEach, describe, expect, it } from 'vitest'
import { criarNotificadorPorEmail, transporterSmtp, urlDoChamado } from './smtp.js'

/**
 * Duble do transporter: captura o que seria enviado.
 *
 * O port devolve `void`, entao a mensagem so e inspecionavel aqui. O
 * `jsonTransport` do Nodemailer aparece num teste separado, para provar que o
 * que montamos e uma mensagem que ele aceita de verdade.
 *
 * O que nenhum destes testes prova: que o e-mail CHEGA. Nao ha credencial SMTP
 * neste ambiente — registrado no Dev Agent Record.
 */
type Enviada = { from?: unknown; to?: unknown; subject?: string; text?: string }

let enviadas: Enviada[]

const transporterDuble = {
  async sendMail(mensagem: Enviada) {
    enviadas.push(mensagem)
    return {}
  },
} as unknown as Transporter

const notificador = criarNotificadorPorEmail({
  transporter: transporterDuble,
  remetente: 'servicedesk@empresa.com',
  baseUrl: 'https://desk.empresa.com',
})

const chamado = {
  destinatario: 'marina@empresa.com',
  numero: 1042,
  status: 'aberto',
  titulo: 'Notebook nao liga',
  link: 'https://desk.empresa.com/chamados/1042?acesso=token-cru',
}

/** Story 2.5 — o segundo e ultimo e-mail do MVP (FR-18). */
const resolvido = {
  destinatario: 'marina@empresa.com',
  numero: 1042,
  titulo: 'Notebook nao liga',
  resolvidoPor: 'bruno@empresa.com',
  duracao: '2 dias',
  link: 'https://desk.empresa.com/chamados/1042?acesso=token-de-resolucao',
}

beforeEach(() => {
  enviadas = []
})

describe('urlDoChamado', () => {
  it('monta a URL com o Numero e o token', () => {
    expect(urlDoChamado('https://desk.empresa.com', 1042, 'abc')).toBe(
      'https://desk.empresa.com/chamados/1042?acesso=abc',
    )
  })

  it('nao duplica a barra quando a base termina com uma', () => {
    expect(urlDoChamado('https://desk.empresa.com/', 1042, 'abc')).toBe(
      'https://desk.empresa.com/chamados/1042?acesso=abc',
    )
  })

  it('escapa o token', () => {
    // Token base64url nao traz caractere perigoso, mas a URL nao pode depender
    // disso: quem monta URL confiando no formato do dado acaba com parametro
    // quebrado no dia em que o formato muda.
    expect(urlDoChamado('https://x', 1, 'a b&c')).toContain('a%20b%26c')
  })
})

describe('e-mail de Chamado aberto (AC #1)', () => {
  it('leva Numero, Status e link', async () => {
    await notificador.enviarChamadoAberto(chamado)

    const enviada = enviadas[0]
    expect(enviada?.subject).toContain('#1042')
    expect(enviada?.text).toContain('Status: aberto')
    expect(enviada?.text).toContain(chamado.link)
  })

  it('vai para o Solicitante, com o remetente configurado', async () => {
    await notificador.enviarChamadoAberto(chamado)

    expect(enviadas[0]?.to).toBe('marina@empresa.com')
    expect(enviadas[0]?.from).toBe('servicedesk@empresa.com')
  })

  it('o Numero esta no assunto, que e por onde a pessoa acha o e-mail depois', async () => {
    await notificador.enviarChamadoAberto(chamado)

    expect(enviadas[0]?.subject).toBe('Chamado #1042 aberto — Notebook nao liga')
  })

  it('diz a validade do link, para a pessoa nao descobrir por tentativa', async () => {
    await notificador.enviarChamadoAberto(chamado)

    expect(enviadas[0]?.text).toContain('7 dias')
  })
})

describe('e-mail de login (Story 1.3, transporte que faltava)', () => {
  it('leva o token dentro do link, e nao solto no texto', async () => {
    await notificador.enviarLinkDeLogin('marina@empresa.com', 'token-do-login')

    const texto = enviadas[0]?.text ?? ''
    expect(texto).toContain('/entrar?token=token-do-login')
    // O token aparece UMA vez, dentro da URL. Repetido solto no corpo, viraria
    // algo que a pessoa copia e cola em qualquer lugar.
    expect(texto.split('token-do-login')).toHaveLength(2)
  })

  it('avisa o prazo e o uso unico do link de login', async () => {
    await notificador.enviarLinkDeLogin('marina@empresa.com', 'x')

    expect(enviadas[0]?.text).toContain('15 minutos')
    expect(enviadas[0]?.text).toContain('uma vez')
  })

  it('o assunto nao carrega o token', async () => {
    await notificador.enviarLinkDeLogin('marina@empresa.com', 'token-secreto')

    // Assunto vaza mais facil: aparece em notificacao de celular, em previa de
    // cliente de e-mail e em log de servidor de e-mail.
    expect(enviadas[0]?.subject).not.toContain('token-secreto')
  })
})

describe('e-mail de Chamado resolvido (Story 2.5, AC #1)', () => {
  it('diz quem resolveu e o tempo total', async () => {
    await notificador.enviarChamadoResolvido(resolvido)

    const texto = enviadas[0]?.text ?? ''
    expect(texto).toContain('bruno@empresa.com')
    expect(texto).toContain('2 dias')
  })

  it('vai para o Solicitante, com o remetente configurado', async () => {
    await notificador.enviarChamadoResolvido(resolvido)

    expect(enviadas[0]?.to).toBe('marina@empresa.com')
    expect(enviadas[0]?.from).toBe('servicedesk@empresa.com')
  })

  it('o Numero esta no assunto, como no e-mail de abertura', async () => {
    await notificador.enviarChamadoResolvido(resolvido)

    expect(enviadas[0]?.subject).toBe('Chamado #1042 resolvido — Notebook nao liga')
  })

  it('leva o link de acesso ao Chamado', async () => {
    await notificador.enviarChamadoResolvido(resolvido)

    expect(enviadas[0]?.text).toContain(resolvido.link)
  })

  /**
   * O Solicitante nao ve o Log (1.8) e nao muda Status (2.2): se o e-mail nao
   * disser o que fazer quando o problema continua, ele responde no vazio. O
   * intake por e-mail (1.9) e o caminho que existe.
   */
  it('diz o que fazer se o problema continuar', async () => {
    await notificador.enviarChamadoResolvido(resolvido)

    expect(enviadas[0]?.text?.toLowerCase()).toContain('responda')
  })
})

describe('a mensagem montada e aceita pelo Nodemailer de verdade', () => {
  it('o jsonTransport serializa o e-mail de Chamado sem reclamar', async () => {
    const real = createTransport({ jsonTransport: true })
    const comTransporteReal = criarNotificadorPorEmail({
      transporter: real,
      remetente: 'servicedesk@empresa.com',
      baseUrl: 'https://desk.empresa.com',
    })

    // O duble acima aceita qualquer objeto; este teste garante que o formato
    // tambem passa pelo Nodemailer — cabecalhos, destinatario, corpo.
    await expect(comTransporteReal.enviarChamadoAberto(chamado)).resolves.toBeUndefined()
    await expect(comTransporteReal.enviarChamadoResolvido(resolvido)).resolves.toBeUndefined()
  })
})

describe('transporterSmtp', () => {
  it('usa TLS implicito na 465 e negociado nas demais', () => {
    const base = {
      host: 'smtp.empresa.com',
      user: 'u',
      pass: 'p',
      remetente: 'a@b.com',
      baseUrl: 'https://x',
    }

    const naSegura = transporterSmtp({ ...base, port: 465 })
    const naComum = transporterSmtp({ ...base, port: 587 })

    // Fixar `true` quebraria a 587; fixar `false` desligaria o TLS da 465.
    expect((naSegura.options as { secure?: boolean }).secure).toBe(true)
    expect((naComum.options as { secure?: boolean }).secure).toBe(false)
  })
})
