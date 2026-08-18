import { abrirTicket } from '../../domain/ticket.js'
import type { AbrirChamadoInput, AbrirChamadoOutput } from '../contracts/abrir-chamado.js'
import type { Principal } from '../contracts/principal.js'
import type { RegistroDeIntake, TicketRepository } from '../ports/ticket-repository.js'
import { type CanalDeNotificacao, notificarComLink } from './notificacao-de-chamado.js'

/**
 * Command handler de abertura de Chamado.
 *
 * AD-2: unico caminho de escrita. Nem o adapter MCP nem o HTTP tocam o
 * repositorio direto — ambos passam por aqui, entao nao ha como divergirem.
 *
 * Importa apenas de `domain` e de outros modulos de `application` (AD-1).
 */
export type AbrirChamadoDeps = {
  readonly repositorio: TicketRepository
  /**
   * Story 1.6 — notificacao do Solicitante (FR-18).
   *
   * Opcional de proposito: o caso de uso continua correto sem ela, e ha
   * caminhos (testes de dominio, futuros scripts de migracao) que abrem
   * Chamado sem ter para quem avisar. Torna-la obrigatoria transformaria uma
   * conveniencia em acoplamento.
   */
  readonly notificacao?: CanalDeNotificacao
}

export const abrirChamado =
  ({ repositorio, notificacao }: AbrirChamadoDeps) =>
  async (
    input: AbrirChamadoInput,
    autor: Principal,
    /**
     * Story 1.9 — a mensagem de e-mail que originou este Chamado, quando houve
     * uma. Segue para o repositorio, que grava o vinculo na MESMA transacao.
     *
     * Entra como parametro, e nao no `input`: nao e algo que o Solicitante
     * informa, e sim um fato do transporte. Poe-lo no contrato Zod o exporia
     * como campo da tool MCP, e um cliente poderia forjar o identificador de
     * uma mensagem para nao abrir o Chamado.
     */
    intake?: RegistroDeIntake,
  ): Promise<AbrirChamadoOutput> => {
    // O dominio valida e rejeita com erro tipado. Se lancar, nada e persistido
    // porque a persistencia so acontece depois desta linha.
    const novo = abrirTicket({
      titulo: input.titulo,
      descricao: input.descricao,
      categoria: input.categoria,
      requester: autor.identity,
    })

    const ticket = await repositorio.criarComAuditoria(novo, autor, intake)

    // Daqui para baixo a transacao do AD-3 JA FECHOU, e e deliberado.
    //
    // E-mail e I/O externo: dentro da transacao, ele prenderia a linha do
    // Chamado pelo tempo do SMTP e, se falhasse, desfaria a abertura. Um
    // Chamado que nao existe porque o servidor de e-mail caiu e pior que um
    // Chamado sem e-mail.
    if (notificacao !== undefined) {
      await notificarAbertura(notificacao, ticket, autor.identity)
    }

    return { number: ticket.number, status: ticket.status }
  }

/**
 * Falha de notificacao NAO propaga e NAO some — quem garante as duas coisas e
 * `notificarComLink` (extraido na 2.5). Aqui fica so o que e da ABERTURA: a
 * mensagem.
 */
const notificarAbertura = async (
  canal: CanalDeNotificacao,
  ticket: { readonly number: number; readonly status: string; readonly titulo: string },
  destinatario: string,
): Promise<void> =>
  notificarComLink(
    canal,
    { numero: ticket.number, destinatario, evento: 'falha_ao_notificar_abertura' },
    (notificador, link) =>
      notificador.enviarChamadoAberto({
        destinatario,
        numero: ticket.number,
        status: ticket.status,
        titulo: ticket.titulo,
        link,
      }),
  )
