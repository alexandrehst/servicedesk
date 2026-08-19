import { z } from 'zod'
import { RECORTES } from '../../domain/recorte-da-fila.js'
import { CATEGORIAS, STATUS } from '../../domain/ticket.js'

/**
 * AD-6: fonte UNICA do contrato do export (Story 4.1, FR-24).
 *
 * Tool PROPRIA, com limites PROPRIOS. O teto de 100 da Fila (3.1) existe para
 * nao estourar o contexto da IA numa leitura de trabalho — um export de 100
 * linhas nao migra nada e nao prova independencia de fornecedor.
 */

/** Decisoes registradas em 2026-08-19. */
export const LIMITE_PADRAO_EXPORT = 1_000
export const LIMITE_MAXIMO_EXPORT = 5_000

/** As colunas do arquivo, na ordem. Acrescentar uma e decisao explicita. */
export const COLUNAS_DO_EXPORT = [
  'numero',
  'titulo',
  'descricao',
  'categoria',
  'status',
  'prioridade',
  'solicitante',
  'dono',
  'criado_em',
  'numero_legado',
] as const

export const exportarCsvInputSchema = z.object({
  // Os MESMOS filtros da Fila: FR-24 diz que o export "cobre os filtros
  // aplicados", entao eles nao podem ser um subconjunto.
  status: z.enum(STATUS).optional(),
  dono: z.string().min(1).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  recorte: z.enum(RECORTES).optional(),
  texto: z.string().min(1).optional(),
  limite: z.number().int().positive().max(LIMITE_MAXIMO_EXPORT).default(LIMITE_PADRAO_EXPORT),
  deslocamento: z.number().int().min(0).default(0),
  /**
   * Quem pagina precisa juntar os pedacos, e um cabecalho repetido no meio do
   * arquivo o corrompe. Da segunda pagina em diante, `false`.
   */
  cabecalho: z.boolean().default(true),
})

export type ExportarCsvInput = z.input<typeof exportarCsvInputSchema>
export type ExportarCsvFiltros = z.output<typeof exportarCsvInputSchema>

export const exportarCsvOutputSchema = z.object({
  /** O arquivo, como texto. Ver a nota sobre o canal no Dev Agent Record. */
  csv: z.string(),
  linhas: z.number().int().min(0),
  /** Ha mais para exportar: continue com `deslocamento` e `cabecalho: false`. */
  temMais: z.boolean(),
})

export type ExportarCsvOutput = z.infer<typeof exportarCsvOutputSchema>
