import { z } from 'zod'
import { CATEGORIAS, STATUS } from '../../domain/ticket.js'

/**
 * AD-6: fonte UNICA do contrato do resumo (Story 3.3, FR-10).
 *
 * `resumo_fila()` NAO tem parametros. Filtrar o resumo (por periodo, por
 * Categoria) nao foi pedido, e a Fila (`buscar_chamados`) ja responde a
 * pergunta recortada — duas superficies para a mesma coisa e o que a 3.2
 * evitou.
 */
export const resumoFilaInputSchema = z.object({})

export type ResumoFilaInput = z.infer<typeof resumoFilaInputSchema>

/**
 * Eixos FECHADOS viram `Record` completo: todo Status e toda Categoria
 * aparecem, com ZERO onde nao ha Chamado. Um painel que omite o eixo vazio
 * obriga quem le a saber a lista de cor, e some justamente com a informacao
 * "nao ha nada aqui".
 */
const contadorPorChave = <const T extends readonly [string, ...string[]]>(chaves: T) =>
  z.object(
    Object.fromEntries(chaves.map((chave) => [chave, z.number().int().min(0)])) as {
      [K in T[number]]: z.ZodNumber
    },
  )

export const resumoFilaOutputSchema = z.object({
  porStatus: contadorPorChave(STATUS),
  porCategoria: contadorPorChave(CATEGORIAS),
  /** Eixo ABERTO: so identidades com Chamado. */
  porDono: z.record(z.string(), z.number().int().min(0)),
  /** Campo proprio (Story 3.2): "sem Dono" e o gargalo, nao uma chave nula. */
  semDono: z.number().int().min(0),
})

export type ResumoFilaOutput = z.infer<typeof resumoFilaOutputSchema>
