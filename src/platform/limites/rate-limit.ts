import type { RateLimitRepository } from '../../application/ports/rate-limit-repository.js'
import { DomainError } from '../../domain/errors.js'

/**
 * Rate limit do adapter MCP (Story 1.5, FR-21).
 *
 * O alvo declarado no PRD e uma IA em loop: um cliente que erra o proprio
 * criterio de parada e passa a chamar sem fim. Nao e protecao contra atacante
 * determinado — e contra software que quebrou.
 */

/** Decisao do dono do projeto em 2026-08-10. Nao mudar sem revisita-la. */
export const LIMITE_POR_MINUTO = 60

const UM_MINUTO_MS = 60_000

/**
 * Janela FIXA: o instante truncado ao minuto.
 *
 * Deslizante seria mais justo na virada — aqui, 60 chamadas no fim de um minuto
 * e 60 no comeco do seguinte passam, 120 em poucos segundos. Aceito: o loop que
 * este limite existe para cortar faz centenas por minuto e bate no teto de
 * qualquer forma, e janela fixa cabe numa linha de SQL atomica, enquanto
 * deslizante exigiria guardar cada chamada e varrer o intervalo.
 */
export const janelaDe = (instante: Date): Date =>
  new Date(Math.floor(instante.getTime() / UM_MINUTO_MS) * UM_MINUTO_MS)

/**
 * Erro DISTINTO de `CredencialInvalida`, e isso e deliberado — o oposto do que
 * as Stories 1.2 e 1.3 decidiram para os casos delas.
 *
 * A diferenca esta em para quem a informacao e util. Ali, distinguir os casos
 * ajudava quem sondava. Aqui, quem recebe ja provou quem e: se ele ler
 * "credencial invalida" ao bater no limite, vai concluir que o token morreu e
 * alguem vai reemitir um token que estava bom. Saber que basta esperar e
 * exatamente o que ele precisa.
 *
 * A mensagem traz o instante em que a janela reabre e NAO traz a identidade:
 * ela pode virar log do lado do cliente, e o cliente ja sabe quem e.
 */
const limiteExcedido = (reabreEm: Date): DomainError =>
  new DomainError(
    'LimiteExcedido',
    `Limite de ${LIMITE_POR_MINUTO} chamadas por minuto atingido. Tente novamente a partir de ${reabreEm.toISOString()}.`,
  )

export type LimitadorDeps = {
  readonly repositorio: RateLimitRepository
  readonly agora: () => Date
}

/**
 * Conta a chamada e lanca se ela passou do teto.
 *
 * Repare que o incremento acontece ANTES da checagem, e que a chamada recusada
 * tambem conta. E o comportamento certo para o alvo: um cliente em loop que
 * ignora o erro continua somando, e nao ganha uma janela de chamadas gratis por
 * estar sendo recusado.
 */
export const criarLimitador =
  ({ repositorio, agora }: LimitadorDeps) =>
  async (identity: string): Promise<void> => {
    const janela = janelaDe(agora())
    const chamadas = await repositorio.registrarChamada(identity, janela)

    if (chamadas > LIMITE_POR_MINUTO) {
      throw limiteExcedido(new Date(janela.getTime() + UM_MINUTO_MS))
    }
  }
