import type { EntradaDeAuditoria } from './auditoria.js'
import { DomainError } from './errors.js'
import { type Papel, pode } from './papeis.js'
import type { Prioridade, Status, Ticket } from './ticket.js'

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

  return { itens: itens.filter((item) => podeVerTicket(quem, item)), temMais }
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
