import { DomainError } from '../../domain/errors.js'
import { ticketNaoEncontrado, visivelPara } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * O que toda mutacao de CAMPO do Chamado faz igual (AD-10, Story 2.2).
 *
 * Extraido na Story 2.3, quando o gate do Sonar apontou 9% de duplicacao em
 * codigo novo: `mudar-status.ts` e `atribuir-chamado.ts` repetiam o mesmo bloco
 * de quinze linhas, e 2.4, 2.5 e 2.6 o repetiriam de novo. O gate estava certo
 * — e a duplicacao aqui nao era estilo, era risco: cada copia e uma chance de
 * alguem "simplificar" a releitura e transformar Chamado excluido em conflito
 * eterno.
 */

/**
 * Traduz "o UPDATE nao afetou linha nenhuma" no erro certo.
 *
 * Zero linhas tem DUAS causas, e elas pedem acoes opostas de quem chamou:
 *
 * - a versao divergiu -> `Conflict`, releia e tente de novo
 * - o Chamado sumiu (excluido entre a leitura e a escrita) -> `TicketNaoEncontrado`, desista
 *
 * Por isso a releitura: sem ela, um Chamado excluido por outro Agente viraria
 * "conflito" e a IA tentaria para sempre.
 */
export const conflitoOuSumico = async (
  repositorio: Pick<TicketRepository, 'buscarPorNumero'>,
  numero: number,
  quem: Principal,
): Promise<never> => {
  const agora = await repositorio.buscarPorNumero(numero)
  const aindaVisivel = agora === null ? null : visivelPara(quem, agora)

  if (aindaVisivel === null) {
    throw ticketNaoEncontrado(numero)
  }

  throw new DomainError(
    'Conflict',
    `O Chamado #${numero} mudou desde que voce o leu (versao atual: ${aindaVisivel.ticket.version}). Releia e tente de novo.`,
  )
}
