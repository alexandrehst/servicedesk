import type { Origem } from '../../domain/origem.js'
import type { NovoTicket, Ticket } from '../../domain/ticket.js'
import type { ChamadoBruto, HistoricoBruto } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'

/**
 * Port de saida do repositorio de Chamados.
 *
 * AD-3: a assinatura recebe o principal e cria o Chamado JUNTO com o registro
 * de auditoria. Isso e deliberado — se fossem dois metodos separados, a
 * atomicidade dependeria da disciplina de quem chama. Aqui a implementacao
 * nao tem como gravar um sem o outro.
 */
export type TicketRepository = {
  /**
   * Persiste o Chamado e o registro de auditoria na MESMA transacao.
   * O Numero e atribuido pela persistencia (AD-4), nunca pelo chamador.
   */
  criarComAuditoria(novo: NovoTicket, autor: Principal): Promise<Ticket>

  /**
   * Leitura: devolve o Chamado com sua thread, ou `null` se o Numero nao
   * existe. A decisao de VISIBILIDADE nao acontece aqui — o adapter nao
   * conhece papel nem posse. Ele entrega o dado bruto e o dominio filtra
   * (AD-8). Assim MCP e HTTP nao podem divergir no que escondem.
   *
   * Story 1.4: o retorno e `ChamadoBruto`, e o conteudo dele so e alcancavel
   * por `visivelPara` do dominio. Um caso de uso que esqueca a autorizacao nao
   * compila — antes disso, o AD-8 dependia de quem escrevia lembrar.
   */
  buscarPorNumero(numero: number): Promise<ChamadoBruto | null>

  /**
   * Soft-delete (Story 1.7, FR-23): MARCA o Chamado e grava a auditoria na
   * mesma transacao (AD-3). A linha continua no banco.
   *
   * Devolve `false` quando nao havia o que excluir — Numero inexistente ou
   * ja excluido. A marcacao e atomica (`UPDATE ... WHERE deleted_at IS NULL`),
   * entao dois pedidos simultaneos produzem um vencedor so.
   */
  excluirComAuditoria(numero: number, autor: Principal): Promise<boolean>

  /**
   * Historico de acoes do Chamado (Story 1.8), embrulhado como todo dado de
   * leitura: so `historicoVisivelPara` abre.
   *
   * `origem` e RECORTE DE CONSULTA, nao autorizacao — por isso pode ir ao SQL.
   * A decisao de quem enxerga continua no dominio (AD-8); se ela descesse para
   * ca, MCP e HTTP poderiam divergir no que escondem.
   *
   * `null` quando o Numero nao existe. Chamado sem nenhuma acao registrada e
   * outra coisa: existe, e devolve lista vazia.
   */
  buscarHistoricoBruto(numero: number, origem?: Origem): Promise<HistoricoBruto | null>
}
