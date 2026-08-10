import { createTransport, type Transporter } from 'nodemailer'
import type {
  ChamadoAberto,
  NotificadorDeChamado,
} from '../../application/ports/notificador-de-chamado.js'
import type { NotificadorDeLogin } from '../../application/ports/notificador-de-login.js'

/**
 * Driven adapter de e-mail (Story 1.6, FR-18).
 *
 * Implementa os DOIS ports de notificacao — o de login (Story 1.3, que ficou
 * sem transporte ate aqui) e o de Chamado. Ports separados, adapter unico: o
 * contrato de cada mensagem e diferente, o transporte e o mesmo.
 *
 * O transporter e injetado. Em producao vem de `transporterSmtp()`; nos testes
 * usa-se o `jsonTransport` do proprio Nodemailer, que monta a mensagem de
 * verdade — cabecalhos, destinatario, corpo — sem abrir conexao. E o que
 * permite verificar o e-mail sem servidor SMTP, que este ambiente nao tem.
 */
export type SmtpConfig = {
  readonly host: string
  readonly port: number
  readonly user: string
  readonly pass: string
  readonly remetente: string
  /** Base do portal, usada para montar o link do e-mail (o portal e Fase 1.5). */
  readonly baseUrl: string
}

export const transporterSmtp = (config: SmtpConfig): Transporter =>
  createTransport({
    host: config.host,
    port: config.port,
    // Porta 465 e TLS implicito; as demais negociam STARTTLS. Fixar `true`
    // quebraria o servidor comum de 587, e fixar `false` desligaria o TLS de
    // quem usa 465.
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  })

export type EmailDeps = {
  readonly transporter: Transporter
  readonly remetente: string
  readonly baseUrl: string
}

/**
 * Monta a URL que vai no e-mail. O token viaja aqui e **so** aqui — nao entra
 * no assunto, no texto solto nem em log (AD-9).
 */
export const urlDoChamado = (baseUrl: string, numero: number, token: string): string =>
  `${baseUrl.replace(/\/$/, '')}/chamados/${numero}?acesso=${encodeURIComponent(token)}`

export const criarNotificadorPorEmail = ({
  transporter,
  remetente,
  baseUrl,
}: EmailDeps): NotificadorDeLogin & NotificadorDeChamado => ({
  async enviarLinkDeLogin(email, token) {
    await transporter.sendMail({
      from: remetente,
      to: email,
      subject: 'Seu link de acesso ao ServiceDesk',
      text: [
        'Use o link abaixo para entrar. Ele vale por 15 minutos e so pode ser usado uma vez.',
        '',
        `${baseUrl.replace(/\/$/, '')}/entrar?token=${encodeURIComponent(token)}`,
        '',
        'Se voce nao pediu este acesso, ignore este e-mail.',
      ].join('\n'),
    })
  },

  async enviarChamadoAberto(mensagem: ChamadoAberto) {
    // Numero no assunto: e por ele que a pessoa acha o e-mail depois, e e o
    // identificador de negocio do Chamado (AD-4).
    await transporter.sendMail({
      from: remetente,
      to: mensagem.destinatario,
      subject: `Chamado #${mensagem.numero} aberto — ${mensagem.titulo}`,
      text: [
        `Seu Chamado foi registrado com o numero #${mensagem.numero}.`,
        '',
        `Titulo: ${mensagem.titulo}`,
        `Status: ${mensagem.status}`,
        '',
        'Acompanhe pelo link (valido por 7 dias):',
        mensagem.link,
      ].join('\n'),
    })
  },
})
