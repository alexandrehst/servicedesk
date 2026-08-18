import type { Origem } from './origem.js'

/**
 * Uma acao registrada no Log (Story 1.8, FR-22, AD-9).
 *
 * ZERO imports de application, adapters ou platform.
 *
 * Quem decide se este historico pode ser visto e `historicoVisivelPara`, em
 * `visibilidade.ts` — junto das outras decisoes de visibilidade, e onde mora a
 * chave que abre o dado bruto.
 */
/**
 * O vocabulario do Log (Story 2.1).
 *
 * Vive no dominio porque a acao registrada e **rotulo de negocio**, nao detalhe
 * de armazenamento: e por ela que a revisao da Story 1.8 responde "o que a IA
 * fez neste Chamado?". Enquanto cada adapter escolhia a propria string, um
 * segundo caminho de escrita — outro adapter, um script de migracao — poderia
 * gravar rotulo diferente para a mesma acao, e o filtro do historico passaria
 * ao largo dela sem ninguem notar.
 *
 * Lista fechada pelo mesmo motivo de `STATUS`, `CATEGORIAS` e `ORIGENS`: acao
 * nova exige uma linha aqui, e o compilador cobra.
 */
export const ACOES = [
  'abrir_chamado',
  'excluir_chamado',
  'comentar_chamado',
  'comentar_chamado_interno',
  'mudar_status',
  'atribuir_chamado',
  'mudar_prioridade',
  // Story 2.6 — as tres Acoes irreversiveis (AD-7) e o PEDIDO de confirmacao
  // que precede cada uma delas.
  'fechar_chamado',
  'cancelar_chamado',
  'reabrir_chamado',
  // Registrar o pedido nao contradiz "escrita que nao aconteceu nao vira
  // auditoria" (1.7): a exclusao que nao afetou linha NAO aconteceu, mas o
  // pedido de confirmacao aconteceu — um token foi emitido e existe no banco.
  // Sem ele, o Log mostraria so o encerramento, e nao haveria como distinguir
  // "o humano confirmou" de "a IA se auto-confirmou em 200ms".
  'solicitar_confirmacao',
] as const

export type AcaoDeAuditoria = (typeof ACOES)[number]

/**
 * Qual rotulo um Comentario grava no Log.
 *
 * A distincao publico/interno importa para quem audita: um Comentario Interno
 * criado pela IA e conversa do time, com publico diferente do publico. Mas
 * quem faz o mapeamento e o DOMINIO — antes desta funcao, o adapter Postgres
 * ramificava sobre `novo.internal` dentro do INSERT, e era o unico lugar do
 * sistema que sabia o que aquele booleano significa para a auditoria.
 */
export const acaoDeComentario = (interno: boolean): AcaoDeAuditoria =>
  interno ? 'comentar_chamado_interno' : 'comentar_chamado'

export type EntradaDeAuditoria = {
  readonly acao: string
  /** A IDENTIDADE de quem agiu — nunca o nome da tool (AD-9). */
  readonly autor: string
  readonly origin: Origem
  /**
   * Story 2.2 — o par de uma mudanca de valor (Status agora; Dono e Prioridade
   * nas 2.3 e 2.4). `null` quando a acao nao muda valor nenhum.
   */
  readonly de: string | null
  readonly para: string | null
  readonly registradoEm: Date
}
