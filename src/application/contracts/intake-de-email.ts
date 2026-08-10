import { z } from 'zod'

/**
 * AD-6 — contrato do intake por e-mail (Story 1.9, FR-1).
 *
 * Esta e a fronteira mais exposta do projeto. Todo caso de uso anterior recebia
 * dado de um cliente autenticado por token; aqui o dado vem de uma mensagem que
 * qualquer pessoa do mundo pode enviar, e a identidade esta escrita num
 * cabeçalho de texto.
 *
 * Por isso o veredito de autenticidade e um campo do contrato, e nao um detalhe
 * do adapter: quem processa a mensagem NAO pode esquecer de perguntar.
 */

/**
 * O que o servidor de recepcao concluiu sobre SPF/DKIM.
 *
 * O ServiceDesk nao valida criptografia de e-mail por conta propria — isso e um
 * sistema inteiro, e o MTA corporativo (Workspace, Microsoft 365, Postfix) ja o
 * fez e escreveu o resultado em `Authentication-Results`. Aqui so se consome o
 * veredito.
 *
 * `ausente` e um estado de primeira classe, e nao um sinonimo de `reprovada`,
 * porque as duas causas sao diferentes e o operador precisa distingui-las no
 * log: "o remetente falhou na verificacao" e "ninguem verificou" pedem acoes
 * opostas — a primeira e ataque provavel, a segunda e servidor mal configurado.
 * Para a decisao de abrir Chamado, porem, as duas recusam.
 */
export const RESULTADOS_DE_AUTENTICACAO = ['aprovada', 'reprovada', 'ausente'] as const
export const autenticacaoSchema = z.enum(RESULTADOS_DE_AUTENTICACAO)
export type ResultadoDeAutenticacao = z.infer<typeof autenticacaoSchema>

export const mensagemRecebidaSchema = z.object({
  /**
   * `null` quando o cabecalho nao veio — e opcional no RFC 5322.
   *
   * Nao e string vazia de proposito: `''` casaria com a proxima mensagem sem
   * cabecalho, e duas mensagens sem relacao viveriam como duplicata uma da
   * outra. Ausencia precisa ser um valor que nao se repete por acidente.
   */
  messageId: z.string().min(1).nullable(),
  /** O `From` cru, como veio. NAO e identidade — vira uma depois do cadastro. */
  de: z.string(),
  assunto: z.string(),
  corpo: z.string(),
  autenticacao: autenticacaoSchema,
})

export type MensagemRecebida = z.infer<typeof mensagemRecebidaSchema>

/**
 * Por que uma mensagem nao virou Chamado.
 *
 * Recusa e resultado, nao excecao: um lote de e-mails nao pode parar no
 * primeiro remetente desconhecido. E o motivo e enumerado para o log poder ser
 * agregado — "quantas recusas por autenticidade esta semana?" e a pergunta que
 * detecta tanto ataque quanto servidor mal configurado.
 */
export const MOTIVOS_DE_RECUSA = [
  'autenticidade',
  'remetente_desconhecido',
  'sem_message_id',
  'mensagem_vazia',
] as const
export type MotivoDeRecusa = (typeof MOTIVOS_DE_RECUSA)[number]

export type ResultadoDoIntake =
  | { readonly tipo: 'aberto'; readonly numero: number }
  /** Reentrega da mesma mensagem: aponta o Chamado que ja existe. */
  | { readonly tipo: 'duplicado'; readonly numero: number }
  | { readonly tipo: 'recusado'; readonly motivo: MotivoDeRecusa }
