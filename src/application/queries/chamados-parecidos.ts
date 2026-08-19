import { LIMIAR_DE_SEMELHANCA, textoParaSugestao } from '../../domain/semelhanca.js'
import { escopoDeLeitura, filaVisivelPara } from '../../domain/visibilidade.js'
import type {
  ChamadosParecidosInput,
  ChamadosParecidosOutput,
} from '../contracts/chamados-parecidos.js'
import { LIMITE_DE_SUGESTOES } from '../contracts/chamados-parecidos.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * Query handler da sugestao de parecidos (Story 3.5, FR-12, FR-13).
 *
 * FR-13: leitura pura, sem auditoria.
 *
 * AD-8 nas duas camadas, como na Fila (3.1): `escopoDeLeitura` decide antes de
 * ler e `filaVisivelPara` reaplica sobre o que voltou. A sugestao NAO e excecao
 * — sugerir Chamado de terceiro seria vazar Titulo alheio para quem esta apenas
 * abrindo um Chamado.
 */
export type ChamadosParecidosDeps = {
  readonly repositorio: Pick<TicketRepository, 'buscarParecidosBruto'>
}

export const chamadosParecidos =
  ({ repositorio }: ChamadosParecidosDeps) =>
  async (input: ChamadosParecidosInput, quem: Principal): Promise<ChamadosParecidosOutput> => {
    const bruta = await repositorio.buscarParecidosBruto({
      escopo: escopoDeLeitura(quem),
      texto: textoParaSugestao(input.texto),
      limiar: LIMIAR_DE_SEMELHANCA,
      limite: LIMITE_DE_SUGESTOES,
    })

    return {
      parecidos: filaVisivelPara(quem, bruta).itens.map((item) => ({
        numero: item.number,
        titulo: item.titulo,
        status: item.status,
        prioridade: item.prioridade,
        dono: item.assignee,
        criadoEm: item.criadoEm.toISOString(),
      })),
    }
  }
