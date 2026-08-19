import { z } from 'zod'
import { itemDaFilaSchema } from './buscar-chamados.js'

/**
 * AD-6: fonte UNICA do contrato da sugestao (Story 3.5, FR-12, FR-13).
 *
 * Tool PROPRIA, e nao um modo de `buscar_chamados`: o nome e o que a IA le para
 * decidir, e "buscar" e o que ela faz quando o humano pede, enquanto
 * "parecidos" e o que ela consulta antes de abrir. A saida tambem difere —
 * poucos itens, sem paginacao, ordenados por semelhanca e nao por data.
 */

/** Poucos: a sugestao e conselho na abertura, nao uma segunda Fila. */
export const LIMITE_DE_SUGESTOES = 5

export const chamadosParecidosInputSchema = z.object({
  /**
   * O texto de abertura — tipicamente titulo, ou titulo mais descricao. O
   * minimo real (tres caracteres, o tamanho de um trigrama) e do dominio.
   */
  texto: z.string().min(1),
})

export type ChamadosParecidosInput = z.infer<typeof chamadosParecidosInputSchema>

export const chamadosParecidosOutputSchema = z.object({
  /**
   * A MESMA linha de resumo da Fila (3.1) — quem quer o conteudo chama
   * `ver_chamado`. Vazio quando nada passa do limiar: lista vazia e resposta
   * melhor que palpite.
   */
  parecidos: z.array(itemDaFilaSchema),
})

export type ChamadosParecidosOutput = z.infer<typeof chamadosParecidosOutputSchema>
