import { z } from 'zod'
import { RECORTES } from '../../domain/recorte-da-fila.js'
import { CATEGORIAS, PRIORIDADES, STATUS } from '../../domain/ticket.js'

/**
 * AD-6: fonte UNICA do contrato da Fila (Story 3.1, FR-8, FR-13).
 *
 * As listas vem do dominio — repeti-las aqui criaria uma segunda definicao que
 * poderia divergir.
 */

/** Decisoes registradas em 2026-08-18. Toda story de leitura do Epic 3 herda. */
export const LIMITE_PADRAO = 20
export const LIMITE_MAXIMO = 100

export const buscarChamadosInputSchema = z.object({
  status: z.enum(STATUS).optional(),
  /** O Dono, por identidade — a fila de alguem especifico. */
  dono: z.string().min(1).optional(),
  /**
   * Story 3.2 — os recortes de primeira classe (FR-9).
   *
   * Campo PROPRIO, e nao um valor especial de `dono`: e isso que faz "sem Dono"
   * ter nome no protocolo em vez de ser um filtro escondido. `meus` e sobre
   * quem esta autenticado, entao nao carrega identidade nenhuma aqui.
   *
   * Combinar `recorte` com `dono` e recusado — pelo DOMINIO, nao por um
   * `.refine()` aqui: assim um adapter HTTP que montasse o proprio schema
   * herdaria a regra (mesmo raciocinio do motivo da reabertura, na 2.6).
   */
  recorte: z.enum(RECORTES).optional(),
  /**
   * Story 3.4 — busca textual (FR-11). Cobre Titulo, Descricao, Comentarios e o
   * `numero_legado` do sistema anterior.
   *
   * Continua sendo a MESMA tool: uma `buscar_chamados` que filtra e uma
   * `buscar_por_texto` que busca seriam duas superficies para a mesma pergunta.
   *
   * O `.min(1)` aqui e conveniencia; quem recusa termo vazio de verdade e o
   * dominio (`alcanceDaBusca`), para que todo ponto de entrada herde a regra.
   */
  texto: z.string().min(1).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  /**
   * Teto no SCHEMA, e nao truncamento no adapter: pedir 500 e receber 100 em
   * silencio faria a IA concluir que viu tudo. Recusar diz o que aconteceu.
   *
   * O padrao existe porque a IA e o consumidor primario (FR-13) e uma lista sem
   * teto estoura o contexto dela.
   */
  limite: z.number().int().positive().max(LIMITE_MAXIMO).default(LIMITE_PADRAO),
  deslocamento: z.number().int().min(0).default(0),
  /** Por data de abertura (FR-8). `asc` = o mais antigo primeiro, como se atende uma fila. */
  ordem: z.enum(['asc', 'desc']).default('asc'),
})

/** O tipo de ENTRADA tem os opcionais; o de saida do parse tem os defaults. */
export type BuscarChamadosInput = z.input<typeof buscarChamadosInputSchema>
export type BuscarChamadosFiltros = z.output<typeof buscarChamadosInputSchema>

/**
 * A linha da Fila e um RESUMO, nao um Chamado.
 *
 * Sem `descricao` e sem `comentarios`: cinquenta Chamados inteiros sao ilegiveis
 * para a IA e trafegam mais do que a lista precisa mostrar. Quem quer conteudo
 * chama `ver_chamado`, que passa por `visivelPara` e filtra Comentario Interno.
 */
export const itemDaFilaSchema = z.object({
  numero: z.number().int().positive(),
  titulo: z.string(),
  status: z.enum(STATUS),
  prioridade: z.enum(PRIORIDADES),
  dono: z.string().nullable(),
  criadoEm: z.iso.datetime(),
})

export const buscarChamadosOutputSchema = z.object({
  itens: z.array(itemDaFilaSchema),
  /**
   * Ha pagina seguinte. Nao ha `total`: um `COUNT(*)` custaria uma segunda
   * varredura por um numero que ninguem usa — quem quer numeros tem o
   * `resumo_fila` (Story 3.3).
   */
  temMais: z.boolean(),
})

export type BuscarChamadosOutput = z.infer<typeof buscarChamadosOutputSchema>
