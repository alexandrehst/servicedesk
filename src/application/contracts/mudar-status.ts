import { z } from 'zod'
import { STATUS } from '../../domain/ticket.js'

/**
 * AD-6: fonte UNICA do contrato (Story 2.2, FR-4). A lista de Status vem do
 * dominio — repeti-la aqui criaria uma segunda definicao que poderia divergir.
 */
export const mudarStatusInputSchema = z.object({
  numero: z.number().int().positive(),
  novoStatus: z.enum(STATUS),
  /**
   * A versao que o chamador leu (AD-10). **Obrigatoria** de proposito: versao
   * opcional com default "a ultima" seria concorrencia otimista que nao
   * protege ninguem — o segundo Agente sobrescreveria o primeiro em silencio,
   * que e exatamente o que o AD-10 existe para impedir.
   *
   * Quem chama obtem a versao em `ver_chamado`.
   */
  versao: z.number().int().positive(),
})

export type MudarStatusInput = z.infer<typeof mudarStatusInputSchema>

export const mudarStatusOutputSchema = z.object({
  numero: z.number().int().positive(),
  de: z.enum(STATUS),
  para: z.enum(STATUS),
  /** A versao NOVA — quem for mudar de novo precisa dela. */
  versao: z.number().int().positive(),
})

export type MudarStatusOutput = z.infer<typeof mudarStatusOutputSchema>
