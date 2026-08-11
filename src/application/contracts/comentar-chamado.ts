import { z } from 'zod'

/**
 * AD-6: fonte UNICA do contrato de I/O (Story 2.1, FR-3, FR-14). O adapter MCP
 * e o futuro adapter HTTP derivam validacao e tipos daqui — nenhum redefine o
 * shape.
 */
export const comentarChamadoInputSchema = z.object({
  numero: z.number().int().positive(),
  texto: z.string().min(1, 'O corpo do Comentario e obrigatorio'),
  /**
   * Default `false`, e o default e a decisao de seguranca: quem nao pediu
   * Comentario Interno nao pode criar um por acidente. Um campo obrigatorio
   * forcaria a IA a escolher em toda chamada, e um default `true` faria a
   * conversa do time nascer escondida do Solicitante sem ninguem pedir.
   */
  interno: z.boolean().default(false),
})

export type ComentarChamadoInput = z.input<typeof comentarChamadoInputSchema>

export const comentarChamadoOutputSchema = z.object({
  numero: z.number().int().positive(),
  autor: z.string(),
  interno: z.boolean(),
  /** ISO 8601 UTC, como toda data no wire (Conventions da spine). */
  criadoEm: z.iso.datetime(),
})

export type ComentarChamadoOutput = z.infer<typeof comentarChamadoOutputSchema>
