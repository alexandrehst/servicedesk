import { alvoDoChamado } from '../../domain/alvo-de-confirmacao.js'
import { DomainError } from '../../domain/errors.js'
import { pode } from '../../domain/papeis.js'
import { ticketNaoEncontrado, visivelPara } from '../../domain/visibilidade.js'
import type { ExcluirChamadoInput } from '../contracts/excluir.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import type { Confirmacao } from './acao-irreversivel.js'

/**
 * Command handler de exclusao logica (Story 1.7, FR-23).
 *
 * AD-2: unico caminho de escrita. AD-3: a marcacao e o registro de auditoria
 * saem na mesma transacao, dentro do repositorio.
 */
export type ExcluirChamadoDeps = {
  readonly repositorio: TicketRepository
  /**
   * Story 4.3 — o AD-7 passou a valer aqui, e a Story 1.7 escreveu por que:
   *
   * > "A exclusao E irreversivel na pratica enquanto nao houver restauracao
   * > (Story 4.3). No dia em que a 4.3 expuser a exclusao por alguma
   * > superficie, o AD-7 passa a valer — esta anotado aqui para que essa
   * > decisao nao seja tomada por omissao."
   *
   * Esta story expoe `excluir_chamado` como tool. A confirmacao entra junto,
   * na mesma mudanca — nao depois.
   */
  readonly confirmacao: Confirmacao
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

const confirmacaoNecessaria = (numero: number, token?: string): DomainError =>
  new DomainError(
    'ConfirmationRequired',
    token === undefined
      ? `Confirmacao invalida ou expirada para excluir o Chamado #${numero}. Peca uma nova.`
      : `Excluir o Chamado #${numero} e IRREVERSIVEL: nao ha restauracao neste sistema, e ` +
          `ele sai da Fila, da busca e do export para todo mundo. O registro permanece no Log. ` +
          `Mostre isto a quem decide e, com o aval, repita com confirmacao="${token}" ` +
          `(vale 5 minutos, uma vez so).`,
  )

export const excluirChamado =
  ({ repositorio, confirmacao }: ExcluirChamadoDeps) =>
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

    if (input.confirmacao === undefined) {
      const token = await confirmacao.emitir({
        alvo: alvoDoChamado(input.numero),
        ticketNumber: input.numero,
        acao: 'excluir_chamado',
        autor,
        // Excluir nao e transicao de Status: inventar um par seria evento falso.
        de: null,
        para: null,
      })

      throw confirmacaoNecessaria(input.numero, token)
    }

    const valeu = await confirmacao.consumir(input.confirmacao, {
      alvo: alvoDoChamado(input.numero),
      acao: 'excluir_chamado',
      identity: autor.identity,
    })

    if (!valeu) {
      throw confirmacaoNecessaria(input.numero)
    }

    const excluiu = await repositorio.excluirComAuditoria(input.numero, autor)

    if (!excluiu) {
      // Outro pedido marcou primeiro. Para quem chamou, o Chamado ja nao
      // estava la — mesmo desfecho de tentar excluir algo inexistente.
      throw ticketNaoEncontrado(input.numero)
    }

    return { number: input.numero }
  }
