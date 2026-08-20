import type { EntradaDeAuditoria } from './auditoria.js'
import { DomainError } from './errors.js'
import { type Papel, pode } from './papeis.js'
import type { Categoria, Prioridade, Status, Ticket } from './ticket.js'

/**
 * AD-8: regras de visibilidade vivem no dominio, nao em cada adapter. E o que
 * impede o MCP expor dado que a UI esconde.
 *
 * ZERO imports de application, adapters ou platform.
 */

export type { Papel }

export type QuemPergunta = {
  readonly identity: string
  readonly role: Papel
}

export type Comentario = {
  /**
   * Story 4.3 — a identidade PUBLICA do Comentario.
   *
   * Ate aqui o Comentario nao tinha como ser referenciado: `ver_chamado`
   * devolvia autor, corpo e data, e nada mais. Excluir um exige dizer QUAL, e
   * essa era a primeira coisa que faltava.
   *
   * Um ordinal ("o 3o comentario") seria pior, e vale saber por que: ele MUDA
   * quando alguem exclui outro Comentario, entao "exclua o 3o" apagaria o
   * errado numa corrida.
   *
   * Nao contradiz o AD-4. Quem gera continua sendo a persistencia; o que muda e
   * que o valor passa a ser legivel, como o `number` do Chamado ja era.
   * `NovoComentario` continua SEM `id`, pelo mesmo motivo de sempre.
   */
  readonly id: number
  readonly autor: string
  readonly corpo: string
  readonly internal: boolean
  readonly criadoEm: Date
  /** Story 1.7 — soft-delete (FR-23). `null` = vivo. */
  readonly excluidoEm: Date | null
}

/**
 * UM erro para dois casos: Chamado inexistente e Chamado alheio.
 *
 * Isso e deliberado. Se o alheio devolvesse "nao autorizado" e o inexistente
 * "nao encontrado", bastaria sondar Numeros — que sao sequenciais (AD-4) —
 * para mapear a base inteira. A distincao seria um oraculo de existencia.
 */
export const ticketNaoEncontrado = (numero: number): DomainError =>
  new DomainError('TicketNaoEncontrado', `Chamado #${numero} nao encontrado.`)

/**
 * O MINIMO que decide visibilidade: de quem e, e se ainda existe.
 *
 * Story 3.1 — o parametro foi alargado de `Ticket` para esta forma estrutural
 * porque a Fila devolve RESUMO, nao Chamado inteiro: trazer `descricao` do
 * banco so para descartar seria I/O desnecessario numa consulta de lista. Um
 * `Ticket` continua satisfazendo o tipo, entao nenhuma chamada existente mudou
 * — e a alternativa (uma segunda funcao para o item da Fila) seria a mesma
 * regra em dois lugares, que e exatamente o que este modulo existe para evitar.
 */
export type Identificavel = {
  readonly requester: string
  readonly excluidoEm: Date | null
}

/**
 * Agente ve todos os Chamados; Solicitante ve apenas os proprios (FR-2).
 *
 * Chamado EXCLUIDO nao e visivel para ninguem (Story 1.7, FR-23). A checagem
 * vem primeiro porque nao depende de quem pergunta: excluido e excluido.
 */
export const podeVerTicket = (quem: QuemPergunta, ticket: Identificavel): boolean =>
  ticket.excluidoEm === null &&
  (pode(quem.role, 'veChamadoDeTerceiro') || ticket.requester === quem.identity)

/**
 * O que a pessoa alcanca numa leitura de LISTA (Story 3.1, AD-8).
 *
 * A mesma decisao de `podeVerTicket`, tomada ANTES de ler em vez de depois — e
 * expressa como DADO, para que o adapter a traduza em `WHERE` sem decidir nada.
 * A regra continua morando aqui: se um dia o Gestor enxergar so o Time dele,
 * muda esta funcao e toda consulta de lista aprende junto.
 *
 * Por que nao filtrar tudo em memoria: seria ler a base inteira para devolver
 * vinte linhas. Por que nao deixar o adapter montar o filtro sozinho: seria a
 * autorizacao descendo para fora do dominio, e MCP e HTTP poderiam divergir —
 * exatamente o que o AD-8 impede.
 */
export type EscopoDeLeitura =
  | { readonly tipo: 'todos' }
  | { readonly tipo: 'apenasDe'; readonly requester: string }

export const escopoDeLeitura = (quem: QuemPergunta): EscopoDeLeitura =>
  pode(quem.role, 'veChamadoDeTerceiro')
    ? { tipo: 'todos' }
    : { tipo: 'apenasDe', requester: quem.identity }

/**
 * Uma linha da Fila, como o repositorio a entrega (Story 3.1).
 *
 * Carrega `requester` e `excluidoEm` porque sao o que `podeVerTicket` decide —
 * e nao o corpo do Chamado: quem quer Descricao e thread chama `ver_chamado`,
 * que passa por `visivelPara` e filtra Comentario Interno.
 */
export type ItemDaFilaBruto = {
  readonly number: number
  readonly titulo: string
  readonly status: Status
  readonly prioridade: Prioridade
  readonly requester: string
  readonly assignee: string | null
  readonly criadoEm: Date
  readonly excluidoEm: Date | null
}

export type FilaBruta = Bruto<{
  readonly itens: readonly ItemDaFilaBruto[]
  readonly temMais: boolean
}>

export type FilaVisivel = {
  readonly itens: readonly ItemDaFilaBruto[]
  readonly temMais: boolean
}

/** Solicitante nao recebe Comentario Interno (FR-2, AD-8). */
export const filtrarComentarios = (
  quem: QuemPergunta,
  comentarios: readonly Comentario[],
): readonly Comentario[] => {
  // Comentario excluido sai para todo mundo, inclusive Agente (FR-23).
  const vivos = comentarios.filter((c) => c.excluidoEm === null)

  return pode(quem.role, 'veComentarioInterno') ? vivos : vivos.filter((c) => !c.internal)
}

/**
 * O conteudo bruto mora atras deste simbolo, que NAO e exportado.
 *
 * E o que transforma o AD-8 de disciplina em garantia: fora deste modulo nao
 * existe chave para abrir o embrulho, entao nenhum caso de uso consegue
 * entregar Chamado sem antes passar por `visivelPara`. O projeto ja usou a
 * mesma ideia duas vezes — `NovoTicket` sem `number` (AD-4, Story 1.1) e o
 * handler de leitura sem caminho de escrita (FR-13, Story 1.2).
 *
 * Efeito colateral util: o embrulho serializa como `{}`. Um `console.log` ou um
 * `JSON.stringify` distraido no meio do caminho nao derrama a thread interna.
 */
const conteudo = Symbol('bruto')

export type Bruto<T> = { readonly [conteudo]: T }

/** Usado pelo adapter de persistencia, que entrega o dado sem conhecer papel. */
export const embrulharBruto = <T>(valor: T): Bruto<T> => ({ [conteudo]: valor })

export type ChamadoBruto = Bruto<{
  readonly ticket: Ticket
  readonly comentarios: readonly Comentario[]
}>

export type ChamadoVisivel = {
  readonly ticket: Ticket
  readonly comentarios: readonly Comentario[]
}

/**
 * Aplica posse e papel, ou devolve `null`.
 *
 * `null` para "nao pode ver" e proposital: quem chama nao recebe material para
 * distinguir alheio de inexistente, entao o erro unico da 1.2 sai naturalmente
 * em vez de depender de o handler lembrar de unificar os dois casos.
 */
export const visivelPara = (quem: QuemPergunta, bruto: ChamadoBruto): ChamadoVisivel | null => {
  const { ticket, comentarios } = bruto[conteudo]

  if (!podeVerTicket(quem, ticket)) {
    return null
  }

  return { ticket, comentarios: filtrarComentarios(quem, comentarios) }
}

/**
 * O gargalo da LISTA (Story 3.1).
 *
 * Reaplica `podeVerTicket` sobre o que voltou do banco. Parece redundante com
 * o `WHERE` do escopo e nao e: e o que mantem a garantia ESTRUTURAL do AD-8 —
 * o conteudo da Fila mora atras do simbolo privado, entao nao existe caminho
 * para entregar linha nenhuma sem passar por aqui. Se o `WHERE` errar, o custo
 * cai de "vazamento" para "consulta ineficiente".
 *
 * NAO reordena e NAO pagina: as duas coisas sao do SQL, e refaze-las aqui
 * criaria a mesma regra em dois lugares. `temMais` atravessa porque e
 * informacao de paginacao, nao de visibilidade.
 */
export const filaVisivelPara = (quem: QuemPergunta, bruta: FilaBruta): FilaVisivel => {
  const { itens, temMais } = bruta[conteudo]

  return { itens: visiveisPara(quem, itens), temMais }
}

/**
 * O gargalo, para QUALQUER coleção de coisas identificáveis (Story 4.1).
 *
 * Generalizado quando o export precisou do mesmo filtro sobre um item com mais
 * campos que o da Fila. Escrever um segundo `filter` daria duas cópias da regra
 * — e a regra e uma so: `podeVerTicket`.
 */
export const visiveisPara = <T extends Identificavel>(
  quem: QuemPergunta,
  itens: readonly T[],
): readonly T[] => itens.filter((item) => podeVerTicket(quem, item))

/**
 * Uma linha do EXPORT (Story 4.1, FR-24).
 *
 * Carrega mais que o resumo da Fila — `descricao` e `numeroLegado` — porque um
 * backup sem a Descricao nao e backup. Comentarios ficam de fora: uma thread
 * nao cabe numa linha de CSV, e representa-la exigiria um segundo arquivo, onde
 * o recorte de Comentario Interno voltaria a ser obrigatorio (3.4).
 */
export type ItemDeExportacaoBruto = {
  readonly number: number
  readonly titulo: string
  readonly descricao: string
  readonly categoria: Categoria
  readonly status: Status
  readonly prioridade: Prioridade
  readonly requester: string
  readonly assignee: string | null
  readonly criadoEm: Date
  readonly numeroLegado: string | null
  readonly excluidoEm: Date | null
}

export type ExportacaoBruta = Bruto<{
  readonly itens: readonly ItemDeExportacaoBruto[]
  readonly temMais: boolean
}>

export type ExportacaoVisivel = {
  readonly itens: readonly ItemDeExportacaoBruto[]
  readonly temMais: boolean
}

/**
 * O gargalo do export.
 *
 * Mesma regra da Fila, e a diferenca esta no que acontece se ela falhar: um
 * vazamento na Fila aparece numa tela e some; num CSV, ele vira ARQUIVO — e
 * arquivo e encaminhado.
 */
export const exportacaoVisivelPara = (
  quem: QuemPergunta,
  bruta: ExportacaoBruta,
): ExportacaoVisivel => {
  const { itens, temMais } = bruta[conteudo]

  return { itens: visiveisPara(quem, itens), temMais }
}

/**
 * O resumo da Fila (Story 3.3, FR-10).
 *
 * Aqui o AD-8 PERDE a segunda camada. Nas Stories 3.1 e 3.2 o dominio reaplicava
 * `podeVerTicket` sobre os itens que voltavam; um resumo NAO TEM ITENS. Se o
 * `WHERE` do escopo estiver errado, os numeros saem errados e nada os corrige —
 * e o erro e mudo, porque `{ aberto: 47 }` parece igualmente certo para quem tem
 * 47 e para quem deveria ver 3.
 *
 * O que ainda da para conferir nao sao os dados: e a PERGUNTA que os produziu.
 * Por isso o embrulho carrega o escopo REALMENTE aplicado.
 */
export type ContadoresDaFila = {
  readonly porStatus: Readonly<Record<Status, number>>
  readonly porCategoria: Readonly<Record<Categoria, number>>
  /** Eixo ABERTO: so aparecem identidades que tem Chamado. */
  readonly porDono: Readonly<Record<string, number>>
  /**
   * Campo proprio, e nao uma chave nula em `porDono` (a 3.2 fez "sem Dono" ser
   * de primeira classe). Em JSON, `null` como chave vira a string "null" e
   * colidiria com uma identidade chamada assim — e este e o numero que quem
   * gerencia procura primeiro.
   */
  readonly semDono: number
}

export type ResumoBruto = Bruto<{
  readonly escopo: EscopoDeLeitura
  readonly contadores: ContadoresDaFila
}>

export type ResumoVisivel = {
  readonly contadores: ContadoresDaFila
}

/**
 * O relatorio de operacao (Story 4.4, SM-3/SM-4/SM-5).
 *
 * Embrulhado como toda leitura, e por um motivo que NAO e o de sempre: aqui nao
 * ha conteudo de Chamado nenhum — sao contagens e medias. O embrulho continua
 * porque a decisao de QUEM pode ver o agregado tem de passar pelo dominio, e
 * uma leitura que nascesse "solta" abriria a primeira excecao ao AD-8.
 *
 * Diferente da Fila e do resumo, este relatorio NAO tem escopo por
 * Solicitante: e uma medida do sistema inteiro, e quem nao pode ve-lo nao ve
 * versao nenhuma dele. Ver `relatorioVisivelPara`.
 */
export type MedidasDaOperacao = {
  /**
   * Vazia sempre: existe para deixar EXPLICITO que a lista de tempos NAO
   * atravessa a fronteira. Mediana e media sao decididas no SQL, e o dominio
   * nao as recalcula — a mesma licao de `temMais` (3.1, 4.1), onde recalcular
   * no dominio o que o SQL ja respondeu mascarou o defeito da consulta.
   */
  readonly resolucaoHoras: readonly number[]
  readonly medianaHoras: number | null
  readonly mediaHoras: number | null
  readonly resolvidos: number
  readonly semResolucao: number
  readonly porOrigem: { readonly mcp: number; readonly api: number; readonly email: number }
  readonly autoresDistintos: number
  readonly chamadosAbertos: number
}

export type RelatorioBruto = Bruto<MedidasDaOperacao>

const mesmoEscopo = (a: EscopoDeLeitura, b: EscopoDeLeitura): boolean =>
  a.tipo === 'todos' ? b.tipo === 'todos' : b.tipo === 'apenasDe' && a.requester === b.requester

/**
 * Abre o resumo, conferindo a pergunta que o gerou.
 *
 * LANCA, em vez de devolver `null`, porque isto nao e "voce nao pode ver": e
 * defeito de programacao. Um `null` viraria "resumo vazio" na cara de quem
 * perguntou e esconderia o bug — mesmo raciocinio do `pode()` com papel
 * desconhecido (1.4), que falha alto de proposito.
 *
 * Mora AQUI, e nao num modulo proprio, pelo mesmo motivo de
 * `historicoVisivelPara`: a chave que abre o dado bruto e o simbolo privado
 * deste arquivo, e ele continua privado justamente para que nenhuma leitura
 * consiga pular esta funcao.
 */
export const resumoVisivelPara = (quem: QuemPergunta, bruto: ResumoBruto): ResumoVisivel => {
  const { escopo, contadores } = bruto[conteudo]

  if (!mesmoEscopo(escopo, escopoDeLeitura(quem))) {
    throw new DomainError(
      'EscopoDivergente',
      'O resumo foi montado com um escopo diferente do que esta identidade alcanca.',
    )
  }

  return { contadores }
}

export type HistoricoBruto = Bruto<{
  readonly ticket: Ticket
  readonly entradas: readonly EntradaDeAuditoria[]
}>

/**
 * Historico de um Chamado (Story 1.8): duas camadas, e a primeira nao e nova.
 *
 * 1. `podeVerTicket` — quem nao enxerga o Chamado nao enxerga o historico dele.
 *    Vem de graca: a funcao ja sabe sobre posse (1.4) e exclusao (1.7), e o dia
 *    em que ela aprender uma regra nova, esta leitura aprende junto.
 * 2. `veHistorico` — ver o Chamado NAO basta. O Log guarda a identidade de quem
 *    agiu; o Solicitante que lesse o historico do proprio Chamado veria quais
 *    Agentes mexeram nele e com que frequencia — o ritmo interno do time, que
 *    nao e dele.
 *
 * `null` nos dois casos, pelo mesmo motivo de `visivelPara`: quem chama nao
 * recebe material para distinguir "nao existe" de "nao e para voce".
 *
 * Mora aqui, e nao em `auditoria.ts`, porque a chave que abre o dado bruto e
 * o simbolo privado deste modulo — e ele continua privado justamente para que
 * nenhuma leitura consiga pular esta funcao.
 */
export const historicoVisivelPara = (
  quem: QuemPergunta,
  bruto: HistoricoBruto,
): readonly EntradaDeAuditoria[] | null => {
  const { ticket, entradas } = bruto[conteudo]

  if (!podeVerTicket(quem, ticket) || !pode(quem.role, 'veHistorico')) {
    return null
  }

  return entradas
}

/**
 * Abre o relatorio de operacao (Story 4.4).
 *
 * A autorizacao e `veHistorico`, a capacidade que a Story 1.8 criou — e nao uma
 * nova. A pergunta e a MESMA ("pode ver o que aconteceu no sistema?"), e o
 * relatorio e uma agregacao do que aquela capacidade ja libera. Uma capacidade
 * `veRelatorio` nunca divergiria dela, e a 4.3 registrou o que isso significa:
 * separacao que nao muda comportamento e mutacao que nao morre.
 *
 * Nao ha versao "reduzida" para quem nao pode: um relatorio de operacao filtrado
 * por Solicitante mediria a fila de uma pessoa so e responderia outra pergunta,
 * com cara de responder esta.
 */
export const relatorioVisivelPara = (
  quem: QuemPergunta,
  bruto: RelatorioBruto,
): MedidasDaOperacao | null => (pode(quem.role, 'veHistorico') ? bruto[conteudo] : null)
