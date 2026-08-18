import { filtroDeDono } from '../../domain/recorte-da-fila.js'
import { escopoDeLeitura, filaVisivelPara } from '../../domain/visibilidade.js'
import type { BuscarChamadosFiltros, BuscarChamadosOutput } from '../contracts/buscar-chamados.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * Query handler da Fila (Story 3.1, FR-8, FR-13).
 *
 * FR-13: leitura NAO altera estado e NAO grava auditoria.
 *
 * AD-8 em DUAS camadas, e a divisao e a decisao central da story:
 *
 * 1. `escopoDeLeitura` decide o que a pessoa alcanca, ANTES de ler, e entrega o
 *    resultado como dado — o adapter o traduz para `WHERE` sem decidir nada.
 * 2. `filaVisivelPara` reaplica a decisao sobre o que voltou. Se o `WHERE`
 *    errar, o custo cai de "vazamento" para "consulta ineficiente".
 */
export type BuscarChamadosDeps = {
  readonly repositorio: Pick<TicketRepository, 'buscarFilaBruta'>
}

export const buscarChamados =
  ({ repositorio }: BuscarChamadosDeps) =>
  async (input: BuscarChamadosFiltros, quem: Principal): Promise<BuscarChamadosOutput> => {
    const bruta = await repositorio.buscarFilaBruta(
      escopoDeLeitura(quem),
      {
        // Espalhados condicionalmente por causa de `exactOptionalPropertyTypes`:
        // passar `undefined` explicito e diferente de nao passar o campo.
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.categoria === undefined ? {} : { categoria: input.categoria }),
        // Story 3.2 — o dominio decide QUAL filtro de Dono aplicar, inclusive
        // recusando `recorte` + `dono`. Aqui so se repassa o resultado.
        dono: filtroDeDono(quem, {
          ...(input.recorte === undefined ? {} : { recorte: input.recorte }),
          ...(input.dono === undefined ? {} : { dono: input.dono }),
        }),
      },
      { limite: input.limite, deslocamento: input.deslocamento, ordem: input.ordem },
    )

    const { itens, temMais } = filaVisivelPara(quem, bruta)

    return {
      itens: itens.map((item) => ({
        numero: item.number,
        titulo: item.titulo,
        status: item.status,
        prioridade: item.prioridade,
        dono: item.assignee,
        criadoEm: item.criadoEm.toISOString(),
      })),
      temMais,
    }
  }
