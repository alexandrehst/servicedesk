import { DomainError } from './errors.js'

/**
 * Nucleo do dominio — Chamado (Ticket no codigo, ver Glossario da spine).
 *
 * ZERO imports de application, adapters ou platform (AD-1). O job `arch`
 * reprova se isso mudar.
 */

/**
 * AD-5: Status e uma maquina de estados FECHADA definida uma unica vez aqui.
 * Ambos os adapters chamam a mesma funcao de transicao. Story 1.1 so cria,
 * entao apenas 'aberto' e alcancavel; a Story 2.2 abre as transicoes.
 */
export const STATUS = ['aberto', 'em_andamento', 'resolvido', 'fechado', 'cancelado'] as const
export type Status = (typeof STATUS)[number]

/**
 * Categoria e classificacao fixa (PRD, Glossario) e determina o Time responsavel.
 *
 * `nao_classificado` entrou na Story 1.9, quando o intake por e-mail passou a
 * abrir Chamado sem ninguem escolher categoria. Nao e sinonimo de "outros":
 * "outros" afirma que alguem avaliou e nao era nenhuma das anteriores;
 * `nao_classificado` afirma que ninguem avaliou. So a segunda e verdade num
 * intake automatico, e e ela que a triagem do Epic 3 vai querer filtrar.
 */
export const CATEGORIAS = ['hardware', 'software', 'rede', 'acesso', 'nao_classificado'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export const ehCategoria = (valor: string): valor is Categoria =>
  (CATEGORIAS as readonly string[]).includes(valor)

/**
 * Chamado ainda NAO persistido. Repare que nao ha `number`: o Numero e gerado
 * e possuido pela persistencia, via sequence do Postgres (AD-4). Deixa-lo
 * fora deste tipo torna impossivel gera-lo em codigo por engano.
 */
export type NovoTicket = {
  readonly titulo: string
  readonly descricao: string
  readonly categoria: Categoria
  readonly status: Status
  readonly requester: string
  readonly assignee: null
}

/** Chamado persistido: ganhou Numero (imutavel, AD-4) e data de criacao. */
export type Ticket = NovoTicket & {
  readonly number: number
  readonly criadoEm: Date
  /**
   * Story 1.7 — soft-delete (FR-23). `null` = vivo.
   *
   * Fica em `Ticket` e nao em `NovoTicket` pelo mesmo motivo do `number`: um
   * Chamado que ainda nao existe nao pode ter sido excluido, e deixar o campo
   * fora do tipo torna isso impossivel de escrever por engano (AD-4, 1.1).
   */
  readonly excluidoEm: Date | null
  /**
   * Story 2.2 — concorrencia otimista (AD-10).
   *
   * Fica em `Ticket` e nao em `NovoTicket` pelo mesmo motivo do `number` e do
   * `excluidoEm`: um Chamado que ainda nao existe nao tem versao, e deixar o
   * campo fora do tipo torna isso impossivel de escrever por engano.
   *
   * Incrementada a cada mutacao de CAMPO. Escrita aditiva — Comentario, Log —
   * nao a move: refinamento do AD-10 decidido na Story 2.1.
   */
  readonly version: number
}

export type AbrirTicketInput = {
  readonly titulo: string
  readonly descricao: string
  readonly categoria: string
  readonly requester: string
}

/**
 * Funcao pura: valida e monta o Chamado, ou lanca erro tipado. Sem I/O.
 * Nada e persistido quando a validacao falha porque nada aqui persiste.
 */
export const abrirTicket = ({
  titulo,
  descricao,
  categoria,
  requester,
}: AbrirTicketInput): NovoTicket => {
  const tituloLimpo = titulo.trim()
  if (tituloLimpo.length === 0) {
    throw new DomainError('TituloObrigatorio', 'O titulo do Chamado nao pode ser vazio.')
  }

  const descricaoLimpa = descricao.trim()
  if (descricaoLimpa.length === 0) {
    throw new DomainError('DescricaoObrigatoria', 'A descricao do Chamado nao pode ser vazia.')
  }

  if (!ehCategoria(categoria)) {
    throw new DomainError(
      'CategoriaInvalida',
      `Categoria "${categoria}" nao existe. Validas: ${CATEGORIAS.join(', ')}.`,
    )
  }

  return {
    titulo: tituloLimpo,
    descricao: descricaoLimpa,
    categoria,
    // Chamado nasce Aberto e sem Dono (FR-1).
    status: 'aberto',
    requester,
    assignee: null,
  }
}
