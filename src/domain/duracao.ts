/**
 * Quanto tempo passou, dito de um jeito que cabe num e-mail (Story 2.5, FR-18).
 *
 * ZERO imports de application, adapters ou platform — nucleo puro, sem I/O.
 *
 * Vive no dominio, e nao no adapter de e-mail, pelo mesmo motivo de
 * `normalizarEmail` (1.9) e de `ORIGENS` (1.8): a frase e conceito de negocio,
 * e o mesmo Chamado nao pode ter um "tempo total" no e-mail e outro na tela.
 */

const MINUTO_MS = 60 * 1000
const HORA_MS = 60 * MINUTO_MS
const DIA_MS = 24 * HORA_MS

const plural = (quantidade: number, singular: string, plural: string): string =>
  `${quantidade} ${quantidade === 1 ? singular : plural}`

/**
 * Granularidade UNICA, arredondada para BAIXO.
 *
 * "2 dias, 3 horas e 14 minutos" e precisao que ninguem usa; e arredondar para
 * cima anunciaria um dia que nao passou.
 *
 * Duracao nula ou negativa vira "menos de um minuto", e o negativo acontece de
 * verdade: relogio da maquina andando para tras. Um "-1 minutos" no corpo do
 * e-mail seria pior do que impreciso.
 */
export const duracaoLegivel = (de: Date, ate: Date): string => {
  const ms = ate.getTime() - de.getTime()

  if (ms >= DIA_MS) {
    return plural(Math.floor(ms / DIA_MS), 'dia', 'dias')
  }

  if (ms >= HORA_MS) {
    return plural(Math.floor(ms / HORA_MS), 'hora', 'horas')
  }

  if (ms >= MINUTO_MS) {
    return plural(Math.floor(ms / MINUTO_MS), 'minuto', 'minutos')
  }

  return 'menos de um minuto'
}
