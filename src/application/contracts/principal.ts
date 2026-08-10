import { z } from 'zod'
import { ORIGENS } from '../../domain/origem.js'
import { PAPEIS } from '../../domain/papeis.js'

/**
 * AD-8 e AD-9: todo caso de uso recebe um principal autenticado, e a
 * IDENTIDADE DO TOKEN — nunca o nome da tool — e o autor gravado na auditoria.
 *
 * A origem distingue "humano via IA" de chamada da API, o que e a diferenca
 * que o Log de auditoria precisa registrar.
 */
/** Deriva de `ORIGENS` do dominio (Story 1.8) — uma lista, nao duas. */
export const origemSchema = z.enum(ORIGENS)
export type Origem = z.infer<typeof origemSchema>

/**
 * Deriva de `PAPEIS` do dominio (Story 1.4). Repetir a lista aqui criaria uma
 * terceira definicao de papel — dominio, contrato e banco — e as tres
 * poderiam divergir sem que nada reprovasse.
 */
export const papelSchema = z.enum(PAPEIS)
export type Papel = z.infer<typeof papelSchema>

export const principalSchema = z.object({
  identity: z.string().min(1),
  role: papelSchema,
  origin: origemSchema,
})

export type Principal = z.infer<typeof principalSchema>
