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

/**
 * Urgencia do Chamado (FR-6, Story 2.4). Conjunto fechado, como STATUS.
 *
 * Minusculas sem acento, no padrao dos outros enums do projeto: a apresentacao
 * com acento e problema de quem exibe, e a UI e Fase 1.5.
 */
export const PRIORIDADES = ['baixa', 'media', 'alta', 'critica'] as const
export type Prioridade = (typeof PRIORIDADES)[number]

/**
 * Com o que um Chamado nasce quando ninguem escolhe.
 *
 * Prioridade NULA seria um terceiro estado — "sem prioridade" — que a fila do
 * Epic 3 teria que tratar em toda ordenacao e que nao significa nada para quem
 * atende. Um Chamado sem urgencia declarada TEM urgencia: a normal.
 */
export const PRIORIDADE_PADRAO: Prioridade = 'media'

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
  /**
   * Story 2.4 — fica em `NovoTicket`, e isso e o OPOSTO de `number`, `version`
   * e `excluidoEm`. Aqueles so existem depois de persistir; Prioridade existe
   * antes, porque e uma escolha de quem abre, nao um efeito da gravacao.
   */
  readonly prioridade: Prioridade
  readonly status: Status
  readonly requester: string
  /**
   * O Dono (Story 2.3, FR-5). `null` = sem Dono.
   *
   * Ate a 2.3 o tipo era literalmente `null`, e nao `string | null`: a Story
   * 1.1 so criava Chamado sem Dono, e nada atribuia. O tipo estreito estava
   * certo enquanto ninguem podia atribuir — e virou mentira no instante em que
   * a atribuicao existiu.
   */
  readonly assignee: string | null
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
  /**
   * Opcional na abertura: quem abre por e-mail (1.9) nao informa, e a tool MCP
   * nao passou a exigir um campo novo. Ausente vira `PRIORIDADE_PADRAO`.
   */
  readonly prioridade?: Prioridade
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
  prioridade,
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
    prioridade: prioridade ?? PRIORIDADE_PADRAO,
    // Chamado nasce Aberto e sem Dono (FR-1).
    status: 'aberto',
    requester,
    assignee: null,
  }
}
