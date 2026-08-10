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
export type EntradaDeAuditoria = {
  readonly acao: string
  /** A IDENTIDADE de quem agiu — nunca o nome da tool (AD-9). */
  readonly autor: string
  readonly origin: Origem
  readonly registradoEm: Date
}
