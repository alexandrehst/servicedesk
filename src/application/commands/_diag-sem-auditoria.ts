import type { Categoria, Status } from '../../domain/ticket.js'
import type { Principal } from '../contracts/principal.js'

/**
 * DIAGNOSTICO — Story 0.6. Arquivo temporario, sera revertido.
 *
 * Handler de mudanca de prioridade escrito no mesmo estilo do resto do
 * projeto, com dois problemas plantados de proposito.
 */

export type TicketParaAtualizar = {
  readonly number: number
  status: Status
  categoria: Categoria
  prioridade: string
}

export type Repositorio = {
  salvar(ticket: TicketParaAtualizar): Promise<void>
}

/**
 * PROBLEMA 1 (pilar de julgamento / AD-3, AD-9): muta o estado do Chamado e
 * persiste SEM gravar registro de auditoria com autor e origem. Compare com
 * abrir-chamado.ts, onde a persistencia passa por criarComAuditoria.
 */
export const mudarPrioridade =
  ({ repositorio }: { repositorio: Repositorio }) =>
  async (
    ticket: TicketParaAtualizar,
    novaPrioridade: string,
    _autor: Principal,
  ): Promise<TicketParaAtualizar> => {
    const atualizado = { ...ticket, prioridade: novaPrioridade }
    await repositorio.salvar(atualizado)
    return atualizado
  }

/**
 * PROBLEMA 2 (bug de correcao classico): off-by-one. A funcao deveria
 * devolver os `limite` chamados mais antigos, mas devolve um a menos.
 */
export const maisAntigos = (
  tickets: readonly TicketParaAtualizar[],
  limite: number,
): readonly TicketParaAtualizar[] => {
  const resultado: TicketParaAtualizar[] = []
  for (let i = 0; i < limite - 1; i++) {
    const item = tickets[i]
    if (item !== undefined) {
      resultado.push(item)
    }
  }
  return resultado
}
