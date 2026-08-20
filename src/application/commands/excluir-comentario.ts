import { alvoDoComentario } from '../../domain/alvo-de-confirmacao.js'
import { DomainError } from '../../domain/errors.js'
import { pode } from '../../domain/papeis.js'
import { ticketNaoEncontrado, visivelPara } from '../../domain/visibilidade.js'
import type { ExcluirComentarioInput } from '../contracts/excluir.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import type { Confirmacao } from './acao-irreversivel.js'

/**
 * Command handler da exclusao logica de Comentario (Story 4.3, FR-23).
 *
 * A Story 1.7 criou `comments.deleted_at` e o filtro que o le
 * (`filtrarComentarios`), e deliberadamente NAO escreveu nele: registrou que
 * "excluir Comentario nao tem caso de uso — a escrita e da 4.3". Esta e a
 * escrita.
 *
 * AD-2: unico caminho. AD-3: marcacao e auditoria na mesma transacao.
 */
export type ExcluirComentarioDeps = {
  readonly repositorio: Pick<TicketRepository, 'buscarPorNumero' | 'excluirComentarioComAuditoria'>
  /**
   * AD-7. Nao ha restauracao: o corpo fica no banco, mas nenhuma leitura o
   * alcanca de volta. Uma conversa apagada por engano so volta por SQL manual.
   */
  readonly confirmacao: Confirmacao
}

/**
 * Mesma divisao da Story 1.7, e pelo mesmo motivo: nao pode VER o Chamado
 * recebe `TicketNaoEncontrado` (indistinguivel de inexistente); ve mas nao pode
 * EXCLUIR recebe `SemPermissao`, porque esconder existencia de quem ja a
 * conhece nao protege nada.
 */
const semPermissao = (): DomainError =>
  new DomainError('SemPermissao', 'Voce nao pode excluir Comentarios deste Chamado.')

/**
 * O Comentario nao existe, e de outro Chamado, ou ja foi excluido — os tres
 * casos recebem a MESMA resposta, pelo mesmo raciocinio de
 * `ticketNaoEncontrado`: distinguir "nao existe" de "existe e nao e seu" daria
 * um oraculo de existencia, e os ids sao sequenciais.
 */
const comentarioNaoEncontrado = (id: number): DomainError =>
  new DomainError('ComentarioNaoEncontrado', `Comentario ${id} nao encontrado neste Chamado.`)

const confirmacaoNecessaria = (numero: number, id: number, token?: string): DomainError =>
  new DomainError(
    'ConfirmationRequired',
    token === undefined
      ? `Confirmacao invalida ou expirada para excluir o Comentario ${id}. Peca uma nova.`
      : `Excluir o Comentario ${id} do Chamado #${numero} e IRREVERSIVEL: ele some da thread ` +
          `para todo mundo e nao ha restauracao. O registro da exclusao fica no Log. ` +
          `Mostre isto a quem decide e, com o aval, repita com confirmacao="${token}" ` +
          `(vale 5 minutos, uma vez so).`,
  )

export const excluirComentario =
  ({ repositorio, confirmacao }: ExcluirComentarioDeps) =>
  async (input: ExcluirComentarioInput, autor: Principal): Promise<{ id: number }> => {
    const bruto = await repositorio.buscarPorNumero(input.numero)

    // O gargalo e o do CHAMADO: quem nao ve o Chamado nao alcanca Comentario
    // nenhum dele. `visivelPara` ja descarta Chamado excluido (1.7) e alheio
    // (1.4).
    const visivel = bruto === null ? null : visivelPara(autor, bruto)

    if (visivel === null) {
      throw ticketNaoEncontrado(input.numero)
    }

    if (!pode(autor.role, 'excluiComentario')) {
      throw semPermissao()
    }

    if (input.confirmacao === undefined) {
      const token = await confirmacao.emitir({
        // O alvo carrega o PAR, como a autorizacao: um alvo mais frouxo que a
        // regra seria um buraco com cara de guardrail.
        alvo: alvoDoComentario(input.numero, input.id),
        ticketNumber: input.numero,
        acao: 'excluir_comentario',
        autor,
        de: null,
        para: null,
      })

      throw confirmacaoNecessaria(input.numero, input.id, token)
    }

    const valeu = await confirmacao.consumir(input.confirmacao, {
      alvo: alvoDoComentario(input.numero, input.id),
      acao: 'excluir_comentario',
      identity: autor.identity,
    })

    if (!valeu) {
      throw confirmacaoNecessaria(input.numero, input.id)
    }

    const excluiu = await repositorio.excluirComentarioComAuditoria(input.numero, input.id, autor)

    if (!excluiu) {
      throw comentarioNaoEncontrado(input.id)
    }

    return { id: input.id }
  }
