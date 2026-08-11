import { DomainError } from '../../domain/errors.js'
import { pode } from '../../domain/papeis.js'
import { ticketNaoEncontrado, visivelPara } from '../../domain/visibilidade.js'
import type { MudarPrioridadeInput, MudarPrioridadeOutput } from '../contracts/mudar-prioridade.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { conflitoOuSumico } from './mutacao-versionada.js'

/**
 * Command handler de Prioridade (Story 2.4, FR-6).
 *
 * A validacao do VALOR e do contrato Zod (AD-6, lista fechada do dominio); o
 * que sobra aqui e autorizacao, a recusa de "mudanca que nao muda", e a
 * concorrencia otimista.
 */
export type MudarPrioridadeDeps = {
  readonly repositorio: Pick<TicketRepository, 'buscarPorNumero' | 'mudarPrioridadeComAuditoria'>
}

const semPermissao = (): DomainError =>
  new DomainError('SemPermissao', 'Voce nao pode mudar a Prioridade deste Chamado.')

export const mudarPrioridade =
  ({ repositorio }: MudarPrioridadeDeps) =>
  async (input: MudarPrioridadeInput, autor: Principal): Promise<MudarPrioridadeOutput> => {
    const bruto = await repositorio.buscarPorNumero(input.numero)
    const visivel = bruto === null ? null : visivelPara(autor, bruto)

    if (visivel === null) {
      throw ticketNaoEncontrado(input.numero)
    }

    // Autorizacao antes de qualquer validacao de valor: um Solicitante pedindo
    // prioridade igual a atual deve receber `SemPermissao`, e nao aprender pela
    // mensagem de erro qual e a prioridade do Chamado.
    if (!pode(autor.role, 'mudaPrioridade')) {
      throw semPermissao()
    }

    const de = visivel.ticket.prioridade
    const para = input.prioridade

    // Nao e mudanca — e gravaria no Log um evento que nao aconteceu (mesmo
    // raciocinio da auto-transicao na 2.2 e da reatribuicao na 2.3).
    if (de === para) {
      throw new DomainError(
        'PrioridadeInalterada',
        `O Chamado #${input.numero} ja esta com prioridade "${para}".`,
      )
    }

    const resultado = await repositorio.mudarPrioridadeComAuditoria({
      numero: input.numero,
      de,
      para,
      // Da ENTRADA, nunca do Chamado lido: usar a lida faria o command estar
      // sempre "certo" sobre a versao, e nao haveria conflito nenhum.
      esperada: input.versao,
      autor,
    })

    if (resultado === null) {
      return conflitoOuSumico(repositorio, input.numero, autor)
    }

    return { numero: input.numero, de, para, versao: resultado.version }
  }
