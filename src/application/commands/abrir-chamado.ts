import { abrirTicket } from '../../domain/ticket.js'
import type { AbrirChamadoInput, AbrirChamadoOutput } from '../contracts/abrir-chamado.js'
import type { Principal } from '../contracts/principal.js'
import type { Logger } from '../ports/logger.js'
import type { NotificadorDeChamado } from '../ports/notificador-de-chamado.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

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
  readonly notificacao?: {
    readonly notificador: NotificadorDeChamado
    /** Devolve o token cru do link de acesso daquele Chamado. */
    readonly criarLink: (entrada: {
      readonly ticketNumber: number
      readonly email: string
    }) => Promise<string>
    /** Monta a URL a partir do Numero e do token. */
    readonly montarUrl: (numero: number, token: string) => string
    readonly logger: Logger
  }
}

export const abrirChamado =
  ({ repositorio, notificacao }: AbrirChamadoDeps) =>
  async (input: AbrirChamadoInput, autor: Principal): Promise<AbrirChamadoOutput> => {
    // O dominio valida e rejeita com erro tipado. Se lancar, nada e persistido
    // porque a persistencia so acontece depois desta linha.
    const novo = abrirTicket({
      titulo: input.titulo,
      descricao: input.descricao,
      categoria: input.categoria,
      requester: autor.identity,
    })

    const ticket = await repositorio.criarComAuditoria(novo, autor)

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

type Notificacao = NonNullable<AbrirChamadoDeps['notificacao']>

/**
 * Falha de notificacao NAO propaga — a abertura ja aconteceu e desfaze-la nao
 * e opcao. Mas tambem NAO some: vira registro estruturado.
 *
 * Um `catch {}` vazio aqui seria violacao direta do pilar Observavel; e a
 * diferenca entre "o e-mail nao chegou e alguem sabe" e "o e-mail nao chegou".
 */
const notificarAbertura = async (
  { notificador, criarLink, montarUrl, logger }: Notificacao,
  ticket: { readonly number: number; readonly status: string; readonly titulo: string },
  destinatario: string,
): Promise<void> => {
  try {
    const token = await criarLink({ ticketNumber: ticket.number, email: destinatario })

    await notificador.enviarChamadoAberto({
      destinatario,
      numero: ticket.number,
      status: ticket.status,
      titulo: ticket.titulo,
      link: montarUrl(ticket.number, token),
    })
  } catch (erro) {
    // Sem token, sem link, sem corpo de e-mail no log (AD-9). O que basta para
    // agir: qual Chamado, para quem, e o que o transporte disse.
    logger.erro('falha_ao_notificar_abertura', {
      numero: ticket.number,
      destinatario,
      causa: erro instanceof Error ? erro.message : String(erro),
    })
  }
}
