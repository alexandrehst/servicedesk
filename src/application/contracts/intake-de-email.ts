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
  /**
   * Os cabecalhos `Authentication-Results` COMO VIERAM, em ordem — o primeiro
   * e o do servidor de recepcao.
   *
   * O adapter entrega texto; ele NAO conclui nada. A conclusao e
   * `avaliarAutenticidade`, no dominio, e essa separacao e o ponto: enquanto a
   * politica morou no adapter IMAP, um segundo adapter de entrada (o webhook
   * que esta story antecipa) teria que redescobri-la, e uma versao mais fraca
   * dela abriria bypass num canal que o caso de uso trata como fonte de
   * identidade. Mesmo raciocinio do AD-8 — quem decide sobre confianca nao e o
   * adapter.
   */
  autenticacaoBruta: z.array(z.string()).readonly(),
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
