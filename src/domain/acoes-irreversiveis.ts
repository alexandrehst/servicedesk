import type { Capacidade } from './papeis.js'
import type { Status } from './ticket.js'

/**
 * As Acoes irreversiveis, e o que cada uma exige (AD-7, FR-7, FR-15, FR-17).
 *
 * ZERO imports de application, adapters ou platform — nucleo puro.
 *
 * A Story 2.2 declarou `TRANSICOES_COM_CONFIRMACAO` e deliberadamente NAO a
 * executou, para que `mudar_status` nao virasse porta dos fundos. Esta tabela e
 * o outro lado da mesma decisao: qual acao dedicada executa cada uma daquelas
 * transicoes.
 *
 * Vive no DOMINIO, e nao no adapter MCP, pelo mesmo motivo do AD-5: se o mapa
 * fosse do adapter, o HTTP poderia divergir — permitir um destino que o MCP
 * proibe, ou dispensar o motivo que o MCP exige. O AD-7 e explicito: "a
 * exigencia vive no dominio, nao no adapter — todo ponto de entrada a herda".
 */
export type AcaoIrreversivel = 'fechar_chamado' | 'cancelar_chamado' | 'reabrir_chamado'

export type RegraDeAcaoIrreversivel = {
  readonly destino: Status
  readonly capacidade: Capacidade
  /**
   * FR-7: "reabrir volta o Status para Em andamento e registra o MOTIVO".
   *
   * Fechar e cancelar nao pedem: encerrar um Chamado atendido e o fim normal do
   * fluxo. Reabrir contradiz um encerramento que ja foi comunicado, e sem o
   * porque o Log registraria que alguem desfez algo, sem dizer o que mudou.
   */
  readonly exigeMotivo: boolean
}

export const ACOES_IRREVERSIVEIS: Record<AcaoIrreversivel, RegraDeAcaoIrreversivel> = {
  // Encerra um Chamado que foi resolvido e nao voltou.
  fechar_chamado: { destino: 'fechado', capacidade: 'fechaOuCancela', exigeMotivo: false },
  // Encerra um Chamado que nao deveria existir — aberto por engano, duplicado.
  cancelar_chamado: { destino: 'cancelado', capacidade: 'fechaOuCancela', exigeMotivo: false },
  // Traz de volta o que ja estava encerrado. NAO confundir com
  // `em_andamento -> aberto`, que e devolver a fila e nao e destrutivo (2.2).
  reabrir_chamado: { destino: 'em_andamento', capacidade: 'reabre', exigeMotivo: true },
}

/**
 * As chaves como lista iteravel. `Object.keys` devolveria `string[]` e perderia
 * o tipo — e e justamente o tipo que faz o compilador cobrar uma regra para
 * cada acao nova.
 */
export const ACOES_IRREVERSIVEIS_NOMES = [
  'fechar_chamado',
  'cancelar_chamado',
  'reabrir_chamado',
] as const satisfies readonly AcaoIrreversivel[]

export const exigeMotivo = (acao: AcaoIrreversivel): boolean =>
  ACOES_IRREVERSIVEIS[acao].exigeMotivo

/**
 * O motivo informado serve?
 *
 * Espaco em branco nao e motivo: aceita-lo deixaria o Log com uma reabertura
 * "justificada" por uma string vazia, que e pior que nenhuma — parece que
 * alguem explicou. Mesma regra de `TituloObrigatorio` (1.1) e
 * `CorpoObrigatorio` (2.1).
 */
export const motivoValido = (acao: AcaoIrreversivel, motivo: string | undefined): boolean =>
  !exigeMotivo(acao) || (motivo !== undefined && motivo.trim().length > 0)
