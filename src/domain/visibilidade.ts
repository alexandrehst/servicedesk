import { DomainError } from './errors.js'
import type { Ticket } from './ticket.js'

/**
 * AD-8: regras de visibilidade vivem no dominio, nao em cada adapter. E o que
 * impede o MCP expor dado que a UI esconde.
 *
 * ZERO imports de application, adapters ou platform.
 */

export type Papel = 'solicitante' | 'agente'

export type QuemPergunta = {
  readonly identity: string
  readonly role: Papel
}

export type Comentario = {
  readonly autor: string
  readonly corpo: string
  readonly internal: boolean
  readonly criadoEm: Date
}

/**
 * UM erro para dois casos: Chamado inexistente e Chamado alheio.
 *
 * Isso e deliberado. Se o alheio devolvesse "nao autorizado" e o inexistente
 * "nao encontrado", bastaria sondar Numeros — que sao sequenciais (AD-4) —
 * para mapear a base inteira. A distincao seria um oraculo de existencia.
 */
export const ticketNaoEncontrado = (numero: number): DomainError =>
  new DomainError('TicketNaoEncontrado', `Chamado #${numero} nao encontrado.`)

/** Agente ve todos os Chamados; Solicitante ve apenas os proprios (FR-2). */
export const podeVerTicket = (quem: QuemPergunta, ticket: Ticket): boolean =>
  quem.role === 'agente' || ticket.requester === quem.identity

/** Solicitante nao recebe Comentario Interno (FR-2, AD-8). */
export const filtrarComentarios = (
  quem: QuemPergunta,
  comentarios: readonly Comentario[],
): readonly Comentario[] =>
  quem.role === 'agente' ? comentarios : comentarios.filter((c) => !c.internal)
