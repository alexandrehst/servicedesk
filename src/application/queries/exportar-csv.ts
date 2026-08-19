import { alcanceDaBusca } from '../../domain/busca.js'
import { filtroDeDono } from '../../domain/recorte-da-fila.js'
import { escopoDeLeitura, exportacaoVisivelPara } from '../../domain/visibilidade.js'
import { paraCsv } from '../../platform/csv/csv.js'
import type { ExportarCsvFiltros, ExportarCsvOutput } from '../contracts/exportar-csv.js'
import { COLUNAS_DO_EXPORT } from '../contracts/exportar-csv.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * Query handler do export (Story 4.1, FR-24, FR-13).
 *
 * FR-13: leitura pura, sem auditoria.
 *
 * AD-8 nas duas camadas, como toda leitura de conjunto — e aqui a segunda
 * importa mais que nunca: um vazamento na Fila aparece numa tela e some; num
 * CSV, ele vira ARQUIVO, e arquivo e encaminhado.
 */
export type ExportarCsvDeps = {
  readonly repositorio: Pick<TicketRepository, 'buscarParaExportarBruto'>
}

export const exportarCsv =
  ({ repositorio }: ExportarCsvDeps) =>
  async (input: ExportarCsvFiltros, quem: Principal): Promise<ExportarCsvOutput> => {
    const bruta = await repositorio.buscarParaExportarBruto(
      escopoDeLeitura(quem),
      {
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.categoria === undefined ? {} : { categoria: input.categoria }),
        ...(input.texto === undefined ? {} : { busca: alcanceDaBusca(quem, input.texto) }),
        dono: filtroDeDono(quem, {
          ...(input.recorte === undefined ? {} : { recorte: input.recorte }),
          ...(input.dono === undefined ? {} : { dono: input.dono }),
        }),
      },
      { limite: input.limite, deslocamento: input.deslocamento },
    )

    const { itens, temMais } = exportacaoVisivelPara(quem, bruta)

    return {
      csv: paraCsv(
        COLUNAS_DO_EXPORT,
        itens.map((item) => ({
          numero: item.number,
          titulo: item.titulo,
          descricao: item.descricao,
          categoria: item.categoria,
          status: item.status,
          prioridade: item.prioridade,
          solicitante: item.requester,
          dono: item.assignee,
          criado_em: item.criadoEm,
          numero_legado: item.numeroLegado,
        })),
        { cabecalho: input.cabecalho },
      ),
      linhas: itens.length,
      temMais,
    }
  }
