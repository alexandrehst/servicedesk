import { z } from 'zod'

/**
 * AD-6: fonte unica do contrato. A tool MCP e o futuro adapter HTTP derivam
 * daqui — nenhum redefine o shape.
 *
 * Datas saem como STRING ISO 8601 UTC (Consistency Conventions da spine). O
 * Postgres devolve Date; a conversao acontece no query handler.
 */
export const verChamadoInputSchema = z.object({
  numero: z.number().int().positive(),
})

export type VerChamadoInput = z.infer<typeof verChamadoInputSchema>

export const comentarioSchema = z.object({
  autor: z.string(),
  corpo: z.string(),
  internal: z.boolean(),
  criadoEm: z.iso.datetime(),
})

export const verChamadoOutputSchema = z.object({
  number: z.number().int().positive(),
  titulo: z.string(),
  descricao: z.string(),
  categoria: z.string(),
  status: z.string(),
  requester: z.string(),
  assignee: z.string().nullable(),
  criadoEm: z.iso.datetime(),
  comentarios: z.array(comentarioSchema),
})

export type VerChamadoOutput = z.infer<typeof verChamadoOutputSchema>
