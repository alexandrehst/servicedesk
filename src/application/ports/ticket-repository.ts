import type { AcaoIrreversivel } from '../../domain/acoes-irreversiveis.js'
import type { AcaoDeAuditoria } from '../../domain/auditoria.js'
import type { AlcanceDaBusca } from '../../domain/busca.js'
import type { NovoComentario } from '../../domain/comentario.js'
import type { ChamadoImportado } from '../../domain/importacao.js'
import type { Origem } from '../../domain/origem.js'
import type { FiltroDeDono } from '../../domain/recorte-da-fila.js'
import type { Categoria, NovoTicket, Prioridade, Status, Ticket } from '../../domain/ticket.js'
import type {
  ChamadoBruto,
  EscopoDeLeitura,
  ExportacaoBruta,
  FilaBruta,
  HistoricoBruto,
  RelatorioBruto,
  ResumoBruto,
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
   * Grava um Chamado vindo da MIGRACAO (Story 4.2, FR-25).
   *
   * Separado de `criarComAuditoria` por tres diferencas que nao cabem naquele
   * metodo:
   *
   * - o **Status** vem do arquivo (um Chamado ja fechado entra fechado), e nao
   *   e sempre `aberto`;
   * - o **`criado_em`** e preservado do sistema antigo, em vez do `now()`;
   * - o **`numero_legado`** e gravado, e e ele que torna o reimport seguro.
   *
   * O que NAO muda: o Numero e da sequence (AD-4 — o numero antigo e
   * REFERENCIA, nao identidade) e a auditoria sai na MESMA transacao (AD-3),
   * com o autor sendo quem RODOU o import.
   *
   * Devolve `null` quando o `numero_legado` ja existe: o UNIQUE parcial da
   * migration 0013 e quem garante, porque entre consultar e inserir cabe outra
   * execucao do mesmo arquivo.
   */
  importarComAuditoria(
    novo: ChamadoImportado,
    autor: Principal,
  ): Promise<{ readonly number: number } | null>

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
   * Story 4.3 — exclusao logica do Comentario (FR-23).
   *
   * Recebe `numero` E `id` de proposito. O `id` sozinho bastaria para achar a
   * linha, e e justamente por isso que ele nao basta: quem chama informou um
   * Chamado, o dominio autorizou sobre AQUELE Chamado, e um `UPDATE` que
   * ignorasse o `numero` excluiria o Comentario de outro Chamado — um id de
   * comentario alheio passaria pelo gargalo de visibilidade do Chamado proprio.
   *
   * `false` quando nao havia o que excluir (id inexistente, de outro Chamado,
   * ou ja excluido). Quem chama traduz — o adapter nao decide o que isso
   * significa.
   */
  /**
   * Story 4.3 — quantos Chamados NAO encerrados tem esta pessoa como Dono.
   *
   * Existe para o RELATORIO da exclusao de Usuario, nao para uma decisao: nada
   * e redistribuido automaticamente (ver `ExcluirUsuarioOutput`). Conta so os
   * abertos porque Chamado fechado com Dono que saiu e historico, nao trabalho
   * parado.
   */
  contarChamadosAbertosDe(email: string): Promise<number>

  /**
   * Story 4.4 — as tres metricas do relatorio de operacao, de UMA vez.
   *
   * Juntas porque quem decide o corte do contrato olha as tres no MESMO
   * periodo; separadas, seriam tres chances de discordarem sobre qual periodo
   * era.
   *
   * Sai tudo do Log (FR-22, AD-3): nao ha coluna derivada, e nao deve haver —
   * um `resolvido_em` em `tickets` seria um segundo lugar guardando o mesmo
   * fato, com a chance de divergir do evento que ja existe.
   */
  medirOperacao(periodo: { readonly de: Date; readonly ate: Date }): Promise<RelatorioBruto>

  excluirComentarioComAuditoria(numero: number, id: number, autor: Principal): Promise<boolean>

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
      /**
       * Story 3.2 — chega como DADO do dominio (`filtroDeDono`), nao como
       * `string | undefined`: "sem Dono" nao era expressavel sem dar dois
       * significados ao mesmo campo.
       */
      readonly dono: FiltroDeDono
      readonly categoria?: Categoria
      /**
       * Story 3.4 — o texto e o que ele PODE alcancar, decidido pelo dominio
       * (`alcanceDaBusca`). O recorte de Comentario Interno viaja junto porque
       * ele precisa entrar no `WHERE`: o gargalo (`filaVisivelPara`) sabe de
       * posse e exclusao, e nao de conteudo — um Comentario Interno que casa
       * faria o Chamado aparecer para quem nao pode ler a conversa do time.
       */
      readonly busca?: AlcanceDaBusca
    },
    pagina: {
      readonly limite: number
      readonly deslocamento: number
      readonly ordem: 'asc' | 'desc'
    },
  ): Promise<FilaBruta>

  /**
   * A leitura do EXPORT (Story 4.1, FR-24).
   *
   * Separada de `buscarFilaBruta` porque devolve CAMPOS que a Fila
   * deliberadamente nao traz — `descricao` e `numero_legado`. A 3.1 decidiu que
   * a linha da Fila e resumo para nao pagar I/O que ninguem le; um export sem
   * Descricao, por outro lado, nao e backup.
   *
   * Os FILTROS sao os mesmos da Fila (FR-24: "cobre os filtros aplicados"), e o
   * escopo tambem — mas os LIMITES sao outros: exportar 100 linhas nao migra
   * nada.
   */
  buscarParaExportarBruto(
    escopo: EscopoDeLeitura,
    filtros: {
      readonly status?: Status
      readonly dono: FiltroDeDono
      readonly categoria?: Categoria
      readonly busca?: AlcanceDaBusca
    },
    pagina: { readonly limite: number; readonly deslocamento: number },
  ): Promise<ExportacaoBruta>

  /**
   * Chamados PARECIDOS com um texto de abertura (Story 3.5, FR-12).
   *
   * Separado de `buscarFilaBruta` porque a pergunta e outra: nao ha filtro nem
   * paginacao, a ordem e por SEMELHANCA (nao por data), e a comparacao e por
   * trigramas (`similarity`) em vez de substring — a entrada e uma frase
   * inteira, e nenhum Chamado a contem como substring.
   *
   * O `escopo` chega pronto do dominio, como em toda leitura de conjunto: a
   * sugestao respeita o AD-8, e para o Solicitante isso significa sugerir
   * apenas entre os Chamados dele.
   *
   * Comentario NAO entra no match: a sugestao compara texto de abertura com
   * texto de abertura. Conversa posterior nao descreve o problema original — e,
   * de quebra, nao ha como um Comentario Interno influenciar a existencia de um
   * resultado (o vazamento que a 3.4 teve de resolver).
   */
  buscarParecidosBruto(entrada: {
    readonly escopo: EscopoDeLeitura
    readonly texto: string
    readonly limiar: number
    readonly limite: number
  }): Promise<FilaBruta>

  /**
   * O resumo da Fila (Story 3.3, FR-10): contadores por Status, Categoria e
   * Dono, sem trazer Chamado nenhum.
   *
   * O retorno carrega o `escopo` que foi APLICADO, e nao so os numeros: um
   * resumo nao tem itens para o dominio filtrar, entao o que ele confere e a
   * pergunta que gerou os dados (`resumoVisivelPara`). Devolver so os
   * contadores tornaria impossivel distinguir "47 Chamados dela" de "47 da base
   * inteira".
   *
   * Conta apenas o que esta EM ABERTO (`ehStatusEmAberto`) e nao excluido: o
   * resumo mede carga.
   */
  buscarResumoBruto(escopo: EscopoDeLeitura): Promise<ResumoBruto>

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
