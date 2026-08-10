import { historicoVisivelPara, ticketNaoEncontrado } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { VerHistoricoInput, VerHistoricoOutput } from '../contracts/ver-historico.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * Query handler do historico de um Chamado (Story 1.8, FR-22).
 *
 * FR-13: leitura nao altera estado e NAO grava auditoria — inclusive nao
 * audita a si mesma. O Log cresceria a cada consulta e a revisao viraria
 * ruido: quem procura o que a IA fez encontraria, sobretudo, gente procurando
 * o que a IA fez.
 */
export type VerHistoricoDeps = {
  readonly repositorio: TicketRepository
}

export const verHistorico =
  ({ repositorio }: VerHistoricoDeps) =>
  async (input: VerHistoricoInput, quem: Principal): Promise<VerHistoricoOutput> => {
    const bruto = await repositorio.buscarHistoricoBruto(input.numero, input.origem)

    // Mesmo gargalo das outras leituras: `historicoVisivelPara` decide, e
    // devolve `null` tanto para "nao pode ver o Chamado" quanto para "pode ver
    // o Chamado mas nao o Log". Inexistente cai no mesmo erro por construcao.
    const entradas = bruto === null ? null : historicoVisivelPara(quem, bruto)

    if (entradas === null) {
      throw ticketNaoEncontrado(input.numero)
    }

    return {
      numero: input.numero,
      entradas: entradas.map((e) => ({
        acao: e.acao,
        autor: e.autor,
        origin: e.origin,
        registradoEm: e.registradoEm.toISOString(),
      })),
    }
  }
