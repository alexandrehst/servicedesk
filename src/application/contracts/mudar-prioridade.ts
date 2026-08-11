import { z } from 'zod'
import { PRIORIDADES } from '../../domain/ticket.js'

/**
 * AD-6: fonte UNICA do contrato (Story 2.4, FR-6). A lista vem do dominio —
 * repeti-la aqui criaria uma segunda definicao que poderia divergir.
 */
export const mudarPrioridadeInputSchema = z.object({
  numero: z.number().int().positive(),
  prioridade: z.enum(PRIORIDADES),
  /** A versao lida em `ver_chamado` (AD-10). Obrigatoria. */
  versao: z.number().int().positive(),
})

export type MudarPrioridadeInput = z.infer<typeof mudarPrioridadeInputSchema>

export const mudarPrioridadeOutputSchema = z.object({
  numero: z.number().int().positive(),
  de: z.enum(PRIORIDADES),
  para: z.enum(PRIORIDADES),
  versao: z.number().int().positive(),
})

export type MudarPrioridadeOutput = z.infer<typeof mudarPrioridadeOutputSchema>
