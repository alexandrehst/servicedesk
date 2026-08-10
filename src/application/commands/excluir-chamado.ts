import { DomainError } from '../../domain/errors.js'
import { pode } from '../../domain/papeis.js'
import { ticketNaoEncontrado, visivelPara } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * Command handler de exclusao logica (Story 1.7, FR-23).
 *
 * AD-2: unico caminho de escrita. AD-3: a marcacao e o registro de auditoria
 * saem na mesma transacao, dentro do repositorio.
 */
export type ExcluirChamadoDeps = {
  readonly repositorio: TicketRepository
}

export type ExcluirChamadoInput = {
  readonly numero: number
}

/**
 * Dois erros diferentes, e a diferenca e deliberada.
 *
 * O projeto esconde existencia desde a Story 1.2 — mas a regra existe para nao
 * entregar informacao a quem NAO a tem. Quem abriu o Chamado ja sabe que ele
 * existe: devolver "nao encontrado" a essa pessoa nao protege nada e a faria
 * pensar que o Chamado sumiu. Entao:
 *
 * - nao pode VER  -> `TicketNaoEncontrado` (indistinguivel de inexistente)
 * - ve mas nao pode EXCLUIR -> `SemPermissao`
 *
 * A mensagem de `SemPermissao` nao diz qual papel seria necessario: isso e
 * mapa da politica de autorizacao para quem esta sondando.
 */
const semPermissao = (): DomainError =>
  new DomainError('SemPermissao', 'Voce nao pode excluir este Chamado.')

export const excluirChamado =
  ({ repositorio }: ExcluirChamadoDeps) =>
  async (input: ExcluirChamadoInput, autor: Principal): Promise<{ number: number }> => {
    const bruto = await repositorio.buscarPorNumero(input.numero)

    // `visivelPara` ja descarta Chamado excluido (Story 1.7) e alheio (1.4).
    // Excluir o que nao se pode ver e indistinguivel de excluir o que nao
    // existe — e e assim que deve ser.
    const visivel = bruto === null ? null : visivelPara(autor, bruto)

    if (visivel === null) {
      throw ticketNaoEncontrado(input.numero)
    }

    if (!pode(autor.role, 'excluiChamado')) {
      throw semPermissao()
    }

    const excluiu = await repositorio.excluirComAuditoria(input.numero, autor)

    if (!excluiu) {
      // Outro pedido marcou primeiro. Para quem chamou, o Chamado ja nao
      // estava la — mesmo desfecho de tentar excluir algo inexistente.
      throw ticketNaoEncontrado(input.numero)
    }

    return { number: input.numero }
  }
