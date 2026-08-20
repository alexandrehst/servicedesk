import type { AcaoIrreversivel } from '../../domain/acoes-irreversiveis.js'
import type { AlvoDeConfirmacao } from '../../domain/alvo-de-confirmacao.js'
import type { Status } from '../../domain/ticket.js'
import type { Principal } from '../contracts/principal.js'

/**
 * Port de saida da confirmacao de Acao irreversivel (Story 2.6, AD-7).
 *
 * Separado de `TicketRepository` de proposito: confirmacao nao e parte do
 * Chamado, e um fato sobre uma INTENCAO. Junta-los faria quem so precisa ler
 * Chamado carregar o vocabulario de token, hash e expiracao.
 *
 * Como em `TicketAccessRepository` (1.6), o adapter guarda e busca — quem tem o
 * relogio e quem decide o que e valido esta acima dele. A unica excecao e o
 * `agora` que viaja no consumo, e ela e deliberada: a validade precisa estar no
 * `WHERE` para que o consumo seja atomico.
 */
export type NovaConfirmacao = {
  /**
   * Story 4.3 — o OBJETO que este token autoriza. Montado no dominio
   * (`alvoDoChamado`, `alvoDoComentario`, `alvoDoUsuario`), nunca a mao.
   */
  readonly alvo: AlvoDeConfirmacao
  /**
   * O Chamado, para o Log do PEDIDO. **Nulo quando a acao nao e sobre um
   * Chamado** (excluir Usuario) — o alvo continua identificando o objeto; este
   * campo existe so porque o historico de um Chamado e lido por numero.
   */
  readonly ticketNumber: number | null
  readonly acao: AcaoDeConfirmacao
  /**
   * Quem pediu. A identidade vira o escopo do token (nao e transferivel) E o
   * autor do registro de auditoria (AD-9) — sao o mesmo fato, e separa-los
   * permitiria emitir para um e registrar outro.
   */
  readonly autor: Principal
  readonly tokenHash: string
  readonly expiraEm: Date
  /**
   * O estado atual e o pretendido, para o par de/para do Log (2.2).
   * **Nulos nas exclusoes (4.3)**: excluir nao muda Status de nada, e inventar
   * um par seria registrar um evento falso — a mesma regra que deixou `de`/
   * `para` nulos em `abrir_chamado`.
   */
  readonly de: Status | null
  readonly para: Status | null
}

export type ConsumoDeConfirmacao = {
  readonly tokenHash: string
  /**
   * O ESCOPO. Os tres campos entram no `WHERE` do consumo, e nao numa
   * comparacao em JavaScript depois de ler: sem eles, uma confirmacao de
   * "cancelar #1042" fecharia #1042, e a de um Agente serviria a outro.
   */
  readonly alvo: AlvoDeConfirmacao
  readonly acao: AcaoDeConfirmacao
  readonly identity: string
  readonly agora: Date
}

/**
 * O que pode exigir confirmacao (AD-7).
 *
 * As tres irreversiveis da 2.6 mais as tres exclusoes da 4.3. Uniao fechada
 * pelo mesmo motivo de `ACOES`: acao nova exige uma linha aqui, e o compilador
 * cobra.
 */
export type AcaoDeConfirmacao =
  | AcaoIrreversivel
  | 'excluir_chamado'
  | 'excluir_comentario'
  | 'excluir_usuario'

export type ConfirmacaoRepository = {
  /**
   * Emite a confirmacao e grava o PEDIDO no Log, na MESMA transacao (AD-3).
   *
   * Junto pelo mesmo motivo da abertura do Chamado: em duas transacoes, o
   * processo que morresse entre elas deixaria um token utilizavel sem rastro de
   * quem o pediu — e o unico proposito de auditar o pedido e poder comparar o
   * instante dele com o da execucao.
   */
  criarConfirmacaoComAuditoria(nova: NovaConfirmacao): Promise<void>

  /**
   * Marca a confirmacao como usada e diz se ela servia.
   *
   * `false` cobre os quatro casos — nao existe, nao e desta acao/Chamado/
   * identidade, expirou, ja foi usada — e quem chama NAO os distingue: a
   * resposta cega e a decisao da 1.3, repetida aqui.
   *
   * A marcacao acontece no proprio `UPDATE ... WHERE usado_em IS NULL`, como o
   * consumo do link de login (1.3) e o soft-delete (1.7). Ler-e-depois-marcar
   * deixaria dois pedidos simultaneos passarem pela leitura antes de qualquer
   * escrita, e a mesma confirmacao executaria duas acoes irreversiveis.
   */
  consumirConfirmacao(consumo: ConsumoDeConfirmacao): Promise<boolean>
}
