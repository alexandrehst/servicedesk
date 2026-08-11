import { z } from 'zod'

/**
 * AD-6: fonte UNICA do contrato (Story 2.3, FR-5).
 */
export const atribuirChamadoInputSchema = z.object({
  numero: z.number().int().positive(),
  /** A versao lida em `ver_chamado` (AD-10, Story 2.2). Obrigatoria. */
  versao: z.number().int().positive(),
  /**
   * O Agente que recebe o Chamado. **Ausente = self-assign**.
   *
   * A ausencia ja diz "para mim" — inventar um valor magico (`'eu'`) ou um
   * booleano `selfAssign` seria mais uma coisa para validar, e o campo opcional
   * expressa exatamente isso.
   */
  agente: z.string().min(1).optional(),
})

export type AtribuirChamadoInput = z.infer<typeof atribuirChamadoInputSchema>

export const atribuirChamadoOutputSchema = z.object({
  numero: z.number().int().positive(),
  /** O Dono anterior. `null` na primeira atribuicao — o Chamado nao tinha Dono. */
  de: z.string().nullable(),
  para: z.string(),
  versao: z.number().int().positive(),
})

export type AtribuirChamadoOutput = z.infer<typeof atribuirChamadoOutputSchema>
