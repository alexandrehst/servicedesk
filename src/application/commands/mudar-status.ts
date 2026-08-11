import { DomainError } from '../../domain/errors.js'
import { pode } from '../../domain/papeis.js'
import type { Status } from '../../domain/ticket.js'
import { exigeConfirmacao, transicaoValida } from '../../domain/transicoes.js'
import { ticketNaoEncontrado, visivelPara } from '../../domain/visibilidade.js'
import type { MudarStatusInput, MudarStatusOutput } from '../contracts/mudar-status.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * Command handler de mudanca de Status (Story 2.2, FR-4).
 *
 * AD-2: unico caminho de escrita. AD-5: a maquina de estados que valida vive no
 * dominio, entao MCP e HTTP nao podem divergir. AD-10: a versao esperada e
 * verificada pelo BANCO, no proprio UPDATE.
 */
export type MudarStatusDeps = {
  readonly repositorio: TicketRepository
}

const semPermissao = (): DomainError =>
  new DomainError('SemPermissao', 'Voce nao pode mudar o Status deste Chamado.')

/**
 * A transicao existe, mas so com confirmacao explicita (Story 2.6, AD-7).
 *
 * A mensagem diz QUAL acao usar porque quem chegou aqui ja tem permissao de
 * mudar Status — a informacao nao entrega nada a quem esta sondando, e sem ela
 * a IA ficaria tentando a tool generica em loop.
 */
const exigeAcaoDedicada = (para: Status): DomainError =>
  new DomainError(
    'TransicaoInvalida',
    `Mudar para "${para}" e acao irreversivel e exige confirmacao explicita: use a acao dedicada.`,
  )

export const mudarStatus =
  ({ repositorio }: MudarStatusDeps) =>
  async (input: MudarStatusInput, autor: Principal): Promise<MudarStatusOutput> => {
    const bruto = await repositorio.buscarPorNumero(input.numero)
    const visivel = bruto === null ? null : visivelPara(autor, bruto)

    // `visivelPara` ja descarta excluido (1.7) e alheio (1.4).
    if (visivel === null) {
      throw ticketNaoEncontrado(input.numero)
    }

    // Autorizacao ANTES da validacao da transicao, e a ordem importa: um
    // Solicitante pedindo transicao invalida deve receber `SemPermissao`, e nao
    // `TransicaoInvalida`. O segundo lhe ensinaria como a maquina de estados
    // funciona, e ele nao tem direito de agir de qualquer forma.
    if (!pode(autor.role, 'mudaStatus')) {
      throw semPermissao()
    }

    const de = visivel.ticket.status
    const para = input.novoStatus

    // A porta dos fundos que nao pode existir: fechar, cancelar e reabrir tem
    // acoes dedicadas com confirmacao (2.6). Se `mudar_status` as executasse, a
    // IA encerraria Chamado sem human-in-the-loop.
    if (exigeConfirmacao(de, para)) {
      throw exigeAcaoDedicada(para)
    }

    if (!transicaoValida(de, para)) {
      throw new DomainError('TransicaoInvalida', `Nao e possivel mudar de "${de}" para "${para}".`)
    }

    const resultado = await repositorio.mudarStatusComAuditoria({
      numero: input.numero,
      de,
      para,
      esperada: input.versao,
      autor,
    })

    if (resultado === null) {
      // Nenhuma linha casou. Duas causas possiveis, e elas pedem acoes
      // OPOSTAS de quem chamou: releia para distinguir. Sem isso, um Chamado
      // excluido no meio do caminho viraria "conflito", e quem chamou tentaria
      // de novo para sempre.
      const agora = await repositorio.buscarPorNumero(input.numero)
      const aindaVisivel = agora === null ? null : visivelPara(autor, agora)

      if (aindaVisivel === null) {
        throw ticketNaoEncontrado(input.numero)
      }

      throw new DomainError(
        'Conflict',
        `O Chamado #${input.numero} mudou desde que voce o leu (versao atual: ${aindaVisivel.ticket.version}). Releia e tente de novo.`,
      )
    }

    return { numero: input.numero, de, para, versao: resultado.version }
  }
