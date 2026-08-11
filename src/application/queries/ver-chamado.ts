import { ticketNaoEncontrado, visivelPara } from '../../domain/visibilidade.js'
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
    const bruto = await repositorio.buscarPorNumero(input.numero)

    // `visivelPara` e o unico jeito de abrir o que o port devolveu, e ele
    // devolve `null` tanto para Chamado alheio quanto para ausente. Inexistente
    // e alheio caem no MESMO erro por construcao, nao por disciplina de quem
    // escreveu este handler — distinguir os dois daria um oraculo de
    // existencia sobre Numeros sequenciais.
    const visivel = bruto === null ? null : visivelPara(quem, bruto)

    if (visivel === null) {
      throw ticketNaoEncontrado(input.numero)
    }

    const { ticket, comentarios } = visivel

    return {
      number: ticket.number,
      titulo: ticket.titulo,
      descricao: ticket.descricao,
      categoria: ticket.categoria,
      status: ticket.status,
      prioridade: ticket.prioridade,
      requester: ticket.requester,
      assignee: ticket.assignee,
      criadoEm: ticket.criadoEm.toISOString(),
      versao: ticket.version,
      // Ja filtrados por `visivelPara`: filtrar de novo aqui seria a mesma
      // regra em dois lugares, e dois lugares divergem.
      comentarios: comentarios.map((c) => ({
        autor: c.autor,
        corpo: c.corpo,
        internal: c.internal,
        criadoEm: c.criadoEm.toISOString(),
      })),
    }
  }
