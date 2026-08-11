import { DomainError } from './errors.js'

/**
 * Comentario de um Chamado (Story 2.1, FR-3).
 *
 * ZERO imports de application, adapters ou platform — nucleo puro, como
 * `ticket.ts`. O job `arch` reprova se isso mudar.
 */

/**
 * Comentario ainda NAO persistido. Sem `criadoEm` e sem `id` de proposito, pelo
 * mesmo motivo que `NovoTicket` nao tem `number` (AD-4): quem os atribui e a
 * persistencia, e deixa-los fora do tipo torna impossivel gera-los em codigo
 * por engano.
 */
export type NovoComentario = {
  readonly autor: string
  readonly corpo: string
  /**
   * Comentario Interno nao chega ao Solicitante (AD-8). O filtro ja existe em
   * `filtrarComentarios` desde a Story 1.2 — esta story so passou a escrever
   * o campo que ele le.
   */
  readonly internal: boolean
}

export type CriarComentarioInput = {
  readonly corpo: string
  readonly autor: string
  readonly interno: boolean
}

/**
 * Funcao pura: valida e monta, ou lanca erro tipado. Sem I/O — nada e
 * persistido quando a validacao falha porque nada aqui persiste.
 */
export const criarComentario = ({
  corpo,
  autor,
  interno,
}: CriarComentarioInput): NovoComentario => {
  const corpoLimpo = corpo.trim()

  if (corpoLimpo.length === 0) {
    throw new DomainError('CorpoObrigatorio', 'O corpo do Comentario nao pode ser vazio.')
  }

  return { autor, corpo: corpoLimpo, internal: interno }
}
