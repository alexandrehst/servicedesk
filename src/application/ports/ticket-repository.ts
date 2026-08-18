import type { AcaoIrreversivel } from '../../domain/acoes-irreversiveis.js'
import type { AcaoDeAuditoria } from '../../domain/auditoria.js'
import type { NovoComentario } from '../../domain/comentario.js'
import type { Origem } from '../../domain/origem.js'
import type { Categoria, NovoTicket, Prioridade, Status, Ticket } from '../../domain/ticket.js'
import type {
  ChamadoBruto,
  EscopoDeLeitura,
  FilaBruta,
  HistoricoBruto,
} from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'

/**
 * Port de saida do repositorio de Chamados.
 *
 * AD-3: a assinatura recebe o principal e cria o Chamado JUNTO com o registro
 * de auditoria. Isso e deliberado — se fossem dois metodos separados, a
 * atomicidade dependeria da disciplina de quem chama. Aqui a implementacao
 * nao tem como gravar um sem o outro.
 */
/**
 * Story 1.9 — o que liga uma mensagem de e-mail ao Chamado que ela gerou.
 *
 * E um tipo proprio, e nao uma `string` solta no parametro, para que a chamada
 * diga o que esta passando: `criarComAuditoria(novo, autor, { messageId })` nao
 * se confunde com nenhum outro identificador do sistema.
 */
export type RegistroDeIntake = {
  readonly messageId: string
}

export type TicketRepository = {
  /**
   * Persiste o Chamado e o registro de auditoria na MESMA transacao.
   * O Numero e atribuido pela persistencia (AD-4), nunca pelo chamador.
   *
   * `intake` (Story 1.9) grava, na MESMA transacao, o vinculo com a mensagem
   * de e-mail que originou o Chamado. Junto pelo mesmo motivo da auditoria:
   * em duas transacoes, o processo que morresse entre elas deixaria o Chamado
   * criado e a mensagem sem registro — e a reentrega abriria o segundo.
   *
   * Lanca `MensagemJaProcessada` quando o `messageId` ja existe. A transacao
   * inteira e desfeita, entao nao sobra Chamado orfao.
   *
   * Opcional: MCP e API abrem Chamado sem mensagem nenhuma por tras.
   */
  criarComAuditoria(novo: NovoTicket, autor: Principal, intake?: RegistroDeIntake): Promise<Ticket>

  /**
   * O Numero do Chamado que aquela mensagem ja gerou, ou `null` se e a
   * primeira vez que ela chega.
   *
   * Resolve o caso comum da reentrega sem depender de excecao. Nao substitui o
   * UNIQUE: entre esta leitura e o insert cabe outra entrega da mesma mensagem.
   */
  buscarIntakePorMessageId(messageId: string): Promise<number | null>

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
   * Anexa um Comentario ao Chamado e grava a auditoria na MESMA transacao
   * (Story 2.1, AD-3). Devolve o instante atribuido pela persistencia.
   *
   * NAO recebe versao esperada, e isso e decisao registrada (refinamento do
   * AD-10 na 2.1): comentar e escrita ADITIVA — dois Agentes comentando ao
   * mesmo tempo produzem dois Comentarios corretos, e nao ha update a perder.
   * Concorrencia otimista aqui inventaria conflito.
   */
  criarComentarioComAuditoria(
    numero: number,
    novo: NovoComentario,
    autor: Principal,
    /**
     * O rotulo que vai ao Log, ja resolvido pelo dominio
     * (`acaoDeComentario`). O adapter NAO o deduz: se ele ramificasse sobre
     * `novo.internal`, seria o unico lugar do sistema a saber o que aquele
     * booleano significa para a auditoria — e um segundo caminho de escrita
     * poderia gravar rotulo divergente sem nada reprovar.
     */
    acao: AcaoDeAuditoria,
  ): Promise<{ readonly criadoEm: Date }>

  /**
   * Muda o Status e grava a auditoria na MESMA transacao (Story 2.2, AD-3).
   *
   * `esperada` e a versao que o chamador leu (AD-10). A checagem acontece no
   * proprio `UPDATE ... WHERE version = $esperada` — nao em JavaScript entre
   * uma leitura e uma escrita, que deixaria a janela que o AD-10 existe para
   * fechar. A garantia e do BANCO, como no `consumirLinkDeLogin` (1.3).
   *
   * O par `de`/`para` chega PRONTO do command: o adapter grava, nao deduz
   * (achado do `claude-review` no PR #46).
   *
   * Devolve `null` quando nenhuma linha casou — ou a versao divergiu, ou o
   * Chamado foi excluido no meio do caminho. Quem distingue os dois casos e o
   * command, relendo; o adapter nao tem como saber qual dos dois foi.
   */
  mudarStatusComAuditoria(entrada: {
    readonly numero: number
    readonly de: Status
    readonly para: Status
    readonly esperada: number
    readonly autor: Principal
  }): Promise<{ readonly version: number } | null>

  /**
   * Define o Dono e grava a auditoria na MESMA transacao (Story 2.3, FR-5).
   *
   * Mesmo contrato de `mudarStatusComAuditoria`: a versao esperada e conferida
   * pelo proprio `UPDATE` (AD-10), e `null` significa que nenhuma linha casou —
   * versao divergente ou Chamado excluido, e quem distingue e o command.
   *
   * `de` pode ser nulo: a primeira atribuicao sai de "sem Dono".
   */
  atribuirComAuditoria(entrada: {
    readonly numero: number
    readonly de: string | null
    readonly para: string
    readonly esperada: number
    readonly autor: Principal
  }): Promise<{ readonly version: number } | null>

  /**
   * Muda a Prioridade (Story 2.4, FR-6). Mesmo contrato das outras mutacoes de
   * campo: versao conferida pelo `UPDATE`, `null` quando nada casou.
   */
  mudarPrioridadeComAuditoria(entrada: {
    readonly numero: number
    readonly de: Prioridade
    readonly para: Prioridade
    readonly esperada: number
    readonly autor: Principal
  }): Promise<{ readonly version: number } | null>

  /**
   * Executa uma Acao irreversivel (Story 2.6, AD-7, FR-7): fechar, cancelar ou
   * reabrir. Mesmo contrato das outras mutacoes de campo — versao conferida
   * pelo proprio `UPDATE` (AD-10), `null` quando nada casou.
   *
   * A `acao` chega PRONTA do dominio (`ACOES_IRREVERSIVEIS`), como o rotulo do
   * Comentario na 2.1: o adapter grava, nao deduz. Se ele ramificasse sobre o
   * Status de destino para escolher o rotulo, seria o unico lugar do sistema a
   * saber que `fechado` significa "fechar_chamado".
   *
   * `motivo` so vem em `reabrir_chamado` — e a exigencia esta no dominio
   * (`motivoValido`), nao aqui: o adapter nao recusa, ele registra.
   */
  executarAcaoIrreversivelComAuditoria(entrada: {
    readonly numero: number
    readonly acao: AcaoIrreversivel
    readonly de: Status
    readonly para: Status
    readonly esperada: number
    readonly autor: Principal
    readonly motivo?: string
  }): Promise<{ readonly version: number } | null>

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
   * A Fila (Story 3.1, FR-8). Leitura em CONJUNTO — a primeira do projeto.
   *
   * `escopo` chega PRONTO do dominio (`escopoDeLeitura`): o adapter o traduz
   * para `WHERE` e nao decide nada. E a mesma divisao da Story 1.8, em que
   * `origem` ia ao SQL por ser recorte de consulta — aqui o valor E
   * autorizacao, mas ela ja foi tomada.
   *
   * O retorno vem embrulhado como toda leitura: so `filaVisivelPara` abre, e
   * ele reaplica a decisao sobre o que voltou. Duas camadas de proposito — se
   * este `WHERE` errar, o custo e consulta ineficiente, nao vazamento.
   *
   * `temMais` diz que existe pagina seguinte, sem um `COUNT` a mais: o adapter
   * pede `limite + 1` linhas e devolve `limite`.
   */
  buscarFilaBruta(
    escopo: EscopoDeLeitura,
    filtros: {
      readonly status?: Status
      readonly dono?: string
      readonly categoria?: Categoria
    },
    pagina: {
      readonly limite: number
      readonly deslocamento: number
      readonly ordem: 'asc' | 'desc'
    },
  ): Promise<FilaBruta>

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
