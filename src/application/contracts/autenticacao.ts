import { z } from 'zod'
import { papelSchema } from './principal.js'

/**
 * AD-6: fonte unica dos contratos de autenticacao. O adapter MCP e o futuro
 * adapter HTTP derivam daqui — nenhum redefine o shape.
 *
 * FR-19: magic link. O usuario pede um link para o e-mail corporativo e troca
 * o token recebido por uma sessao.
 */

export const solicitarLinkInputSchema = z.object({
  email: z.email(),
})

export type SolicitarLinkInput = z.infer<typeof solicitarLinkInputSchema>

/**
 * A saida e a MESMA para e-mail cadastrado e nao cadastrado. Nao ha campo
 * `encontrado` nem mensagem variavel: qualquer diferenca transformaria a tela
 * de login num verificador de quem trabalha na empresa.
 */
export const solicitarLinkOutputSchema = z.object({
  mensagem: z.string(),
})

export type SolicitarLinkOutput = z.infer<typeof solicitarLinkOutputSchema>

export const autenticarComLinkInputSchema = z.object({
  token: z.string().min(1),
})

export type AutenticarComLinkInput = z.infer<typeof autenticarComLinkInputSchema>

/**
 * O `tokenDeSessao` trafega AQUI e so aqui: e o unico instante em que a
 * credencial de sessao existe em texto claro fora do cliente. O banco guarda
 * apenas o hash dela.
 */
export const sessaoCriadaOutputSchema = z.object({
  tokenDeSessao: z.string(),
  identity: z.string(),
  role: papelSchema,
  expiraEm: z.iso.datetime(),
})

export type SessaoCriadaOutput = z.infer<typeof sessaoCriadaOutputSchema>
