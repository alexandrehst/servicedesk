import { z } from 'zod'
import { STATUS } from '../../domain/ticket.js'

/**
 * AD-6: fonte UNICA do contrato (Story 2.6, FR-15, FR-17).
 *
 * UM schema para as tres tools, pelo mesmo motivo de haver um command so: o que
 * difere entre fechar, cancelar e reabrir e DADO do dominio, nao forma de
 * entrada.
 */
export const acaoIrreversivelInputSchema = z.object({
  numero: z.number().int().positive(),
  /** A versao lida em `ver_chamado` (AD-10). Obrigatoria. */
  versao: z.number().int().positive(),
  /**
   * O sinal de confirmacao (AD-7). **Opcional no schema, obrigatorio no
   * dominio** — e a ausencia dele e justamente a primeira fase: sem
   * confirmacao, a resposta e `ConfirmationRequired` com o token a usar.
   *
   * Repare que NAO e um booleano. Um `confirmar: true` seria um campo que quem
   * chama preenche, e uma IA o preencheria na tentativa seguinte, sozinha — o
   * AD-7 existe para impedir exatamente isso. Aqui o valor precisa ter sido
   * EMITIDO pelo servidor para este Chamado, esta acao e esta identidade.
   */
  confirmacao: z.string().min(1).optional(),
  /**
   * FR-7: reabrir registra o motivo. Opcional aqui porque o schema e um so
   * para as tres acoes; quem exige e o dominio (`motivoValido`), para que todo
   * ponto de entrada herde a regra (AD-7).
   */
  motivo: z.string().min(1).optional(),
})

export type AcaoIrreversivelInput = z.infer<typeof acaoIrreversivelInputSchema>

export const acaoIrreversivelOutputSchema = z.object({
  numero: z.number().int().positive(),
  de: z.enum(STATUS),
  para: z.enum(STATUS),
  /** A versao NOVA. Reabrir devolve um Chamado que volta a ser mutavel. */
  versao: z.number().int().positive(),
})

export type AcaoIrreversivelOutput = z.infer<typeof acaoIrreversivelOutputSchema>
