import { z } from 'zod'
import { CATEGORIAS } from '../../domain/ticket.js'

/**
 * AD-6: fonte UNICA dos contratos de I/O. O adapter MCP e o adapter HTTP
 * derivam validacao e tipos daqui — nenhum redefine o shape. E o que impede
 * o schema da tool MCP divergir do contrato da API.
 *
 * A lista de categorias vem do dominio, nao e duplicada aqui.
 */
export const abrirChamadoInputSchema = z.object({
  titulo: z.string().min(1, 'Titulo e obrigatorio'),
  descricao: z.string().min(1, 'Descricao e obrigatoria'),
  categoria: z.enum(CATEGORIAS),
})

export type AbrirChamadoInput = z.infer<typeof abrirChamadoInputSchema>

export const abrirChamadoOutputSchema = z.object({
  number: z.number().int().positive(),
  status: z.string(),
})

export type AbrirChamadoOutput = z.infer<typeof abrirChamadoOutputSchema>
