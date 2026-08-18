import type { Logger } from '../ports/logger.js'
import type { NotificadorDeChamado } from '../ports/notificador-de-chamado.js'

/**
 * O que TODA notificacao de Chamado faz igual (Story 1.6, extraido na 2.5).
 *
 * Ate aqui o bloco `criarLink -> montarUrl -> enviar -> catch/log` existia uma
 * vez so, dentro de `abrir-chamado.ts`. A resolucao faz exatamente o mesmo com
 * outra mensagem, e copia-lo seriam vinte linhas duplicadas em codigo novo — o
 * que o gate do Sonar reprovou no PR #50 e que, mais do que estilo, e risco:
 * cada copia e uma chance de alguem "simplificar" o `catch` e transformar
 * falha de e-mail em falha de escrita, ou em silencio.
 */
export type CanalDeNotificacao = {
  readonly notificador: NotificadorDeChamado
  /** Devolve o token cru do link de acesso daquele Chamado (7 dias, 1.6). */
  readonly criarLink: (entrada: {
    readonly ticketNumber: number
    readonly email: string
  }) => Promise<string>
  /** Monta a URL a partir do Numero e do token. */
  readonly montarUrl: (numero: number, token: string) => string
  readonly logger: Logger
}

export type DestinoDaNotificacao = {
  readonly numero: number
  readonly destinatario: string
  /** O evento que vai ao log SE o envio falhar. */
  readonly evento: string
}

/**
 * Emite o link, envia a mensagem e absorve a falha.
 *
 * As duas garantias, e a ordem entre elas importa:
 *
 * - a falha **nao propaga** — a escrita ja aconteceu (Chamado aberto, Status
 *   mudado) e desfaze-la porque o SMTP caiu seria pior que nao avisar;
 * - a falha **nao some** — um `catch {}` vazio aqui seria violacao direta do
 *   pilar Observavel, e a diferenca entre "o e-mail nao chegou e alguem sabe"
 *   e "o e-mail nao chegou".
 *
 * Sem token, sem link e sem corpo de e-mail no log (AD-9). O que basta para
 * agir: qual Chamado, para quem, e o que o transporte disse.
 */
export const notificarComLink = async (
  { notificador, criarLink, montarUrl, logger }: CanalDeNotificacao,
  { numero, destinatario, evento }: DestinoDaNotificacao,
  enviar: (notificador: NotificadorDeChamado, link: string) => Promise<void>,
): Promise<void> => {
  try {
    const token = await criarLink({ ticketNumber: numero, email: destinatario })

    await enviar(notificador, montarUrl(numero, token))
  } catch (erro) {
    logger.erro(evento, {
      numero,
      destinatario,
      causa: erro instanceof Error ? erro.message : String(erro),
    })
  }
}
