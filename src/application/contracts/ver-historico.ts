import { z } from 'zod'
import { origemSchema } from './principal.js'

/**
 * AD-6: fonte unica do contrato de historico (Story 1.8, FR-22).
 *
 * `origem` reusa o `origemSchema` — se um dia surgir uma terceira origem, ela
 * aparece aqui sozinha, em vez de exigir que alguem lembre de mexer nos dois
 * lugares.
 */
export const verHistoricoInputSchema = z.object({
  numero: z.number().int().positive(),
  /**
   * Recorte opcional. `origem: 'mcp'` responde a pergunta que motiva a story:
   * "o que a IA executou aqui?" — e e o que torna acao destrutiva invisivel
   * revisavel.
   */
  origem: origemSchema.optional(),
})

export type VerHistoricoInput = z.infer<typeof verHistoricoInputSchema>

export const entradaDeHistoricoSchema = z.object({
  acao: z.string(),
  /** A identidade de quem agiu (AD-9), nunca o nome da tool. */
  autor: z.string(),
  origin: origemSchema,
  /**
   * Story 2.2 — o par de/para de uma mudanca de valor. OPCIONAIS porque nem
   * toda acao muda valor: `abrir_chamado` e `comentar_chamado` nao tem par, e
   * preencher com 'nenhum' seria inventar um evento que nao houve.
   */
  de: z.string().nullable().optional(),
  para: z.string().nullable().optional(),
  registradoEm: z.iso.datetime(),
})

export const verHistoricoOutputSchema = z.object({
  numero: z.number().int().positive(),
  entradas: z.array(entradaDeHistoricoSchema),
})

export type VerHistoricoOutput = z.infer<typeof verHistoricoOutputSchema>
