import { abrirTicket } from '../../domain/ticket.js'
import type { AbrirChamadoInput, AbrirChamadoOutput } from '../contracts/abrir-chamado.js'
import type { Principal } from '../contracts/principal.js'
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
}

export const abrirChamado =
  ({ repositorio }: AbrirChamadoDeps) =>
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

    return { number: ticket.number, status: ticket.status }
  }
