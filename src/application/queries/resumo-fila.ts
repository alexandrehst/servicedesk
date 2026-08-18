import { escopoDeLeitura, resumoVisivelPara } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { ResumoFilaInput, ResumoFilaOutput } from '../contracts/resumo-fila.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * Query handler do resumo (Story 3.3, FR-10, FR-13).
 *
 * FR-13: leitura nao altera estado e nao grava auditoria.
 *
 * AD-8 com UMA camada e meia. O escopo continua sendo decidido pelo dominio e
 * traduzido pelo adapter — mas nao ha itens para reaplicar `podeVerTicket`
 * depois. O que `resumoVisivelPara` confere e o ESCOPO que o adapter devolveu
 * junto dos numeros: se ele nao for o de quem pergunta, o resumo e recusado em
 * vez de entregue.
 */
export type ResumoFilaDeps = {
  readonly repositorio: Pick<TicketRepository, 'buscarResumoBruto'>
}

export const resumoFila =
  ({ repositorio }: ResumoFilaDeps) =>
  async (_input: ResumoFilaInput, quem: Principal): Promise<ResumoFilaOutput> => {
    const bruto = await repositorio.buscarResumoBruto(escopoDeLeitura(quem))

    return resumoVisivelPara(quem, bruto).contadores
  }
