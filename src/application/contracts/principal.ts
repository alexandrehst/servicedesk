import { z } from 'zod'

/**
 * AD-8 e AD-9: todo caso de uso recebe um principal autenticado, e a
 * IDENTIDADE DO TOKEN — nunca o nome da tool — e o autor gravado na auditoria.
 *
 * A origem distingue "humano via IA" de chamada da API, o que e a diferenca
 * que o Log de auditoria precisa registrar.
 */
export const origemSchema = z.enum(['api', 'mcp'])
export type Origem = z.infer<typeof origemSchema>

export const papelSchema = z.enum(['solicitante', 'agente'])
export type Papel = z.infer<typeof papelSchema>

export const principalSchema = z.object({
  identity: z.string().min(1),
  role: papelSchema,
  origin: origemSchema,
})

export type Principal = z.infer<typeof principalSchema>
