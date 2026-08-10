import type { NovoTicket, Ticket } from '../../domain/ticket.js'
import type { Principal } from '../contracts/principal.js'

/**
 * Port de saida do repositorio de Chamados.
 *
 * AD-3: a assinatura recebe o principal e cria o Chamado JUNTO com o registro
 * de auditoria. Isso e deliberado — se fossem dois metodos separados, a
 * atomicidade dependeria da disciplina de quem chama. Aqui a implementacao
 * nao tem como gravar um sem o outro.
 */
export type TicketRepository = {
  /**
   * Persiste o Chamado e o registro de auditoria na MESMA transacao.
   * O Numero e atribuido pela persistencia (AD-4), nunca pelo chamador.
   */
  criarComAuditoria(novo: NovoTicket, autor: Principal): Promise<Ticket>
}
