import {
  filtrarComentarios,
  podeVerTicket,
  ticketNaoEncontrado,
} from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { VerChamadoInput, VerChamadoOutput } from '../contracts/ver-chamado.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * Query handler de consulta de Chamado.
 *
 * FR-13: leitura NAO altera estado e NAO grava auditoria. Repare que este
 * handler nao recebe nada que permita escrever — o port so oferece leitura
 * aqui, entao a garantia e estrutural, nao de disciplina.
 *
 * AD-8: a visibilidade e decidida por funcoes do dominio. O adapter entrega o
 * dado bruto; quem esconde e o nucleo. E o que impede o MCP expor o que a UI
 * esconderia.
 */
export type VerChamadoDeps = {
  readonly repositorio: TicketRepository
}

export const verChamado =
  ({ repositorio }: VerChamadoDeps) =>
  async (input: VerChamadoInput, quem: Principal): Promise<VerChamadoOutput> => {
    const encontrado = await repositorio.buscarPorNumero(input.numero)

    // Inexistente e alheio devolvem o MESMO erro. Distinguir os dois daria a
    // quem perguntasse um oraculo de existencia — e o Numero e sequencial.
    if (encontrado === null || !podeVerTicket(quem, encontrado.ticket)) {
      throw ticketNaoEncontrado(input.numero)
    }

    const { ticket, comentarios } = encontrado

    return {
      number: ticket.number,
      titulo: ticket.titulo,
      descricao: ticket.descricao,
      categoria: ticket.categoria,
      status: ticket.status,
      requester: ticket.requester,
      assignee: ticket.assignee,
      criadoEm: ticket.criadoEm.toISOString(),
      comentarios: filtrarComentarios(quem, comentarios).map((c) => ({
        autor: c.autor,
        corpo: c.corpo,
        internal: c.internal,
        criadoEm: c.criadoEm.toISOString(),
      })),
    }
  }
