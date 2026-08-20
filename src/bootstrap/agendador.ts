import type { Logger } from '../application/ports/logger.js'

/**
 * O laco que roda a varredura do intake (Story 5.1, FR-1).
 *
 * `criarVarredura` (1.9) ja garante que **uma mensagem ruim nao derruba o
 * lote**. Falta a camada de cima, e e o que este modulo e: **uma varredura
 * inteira que falhe** — IMAP fora do ar, credencial expirada, DNS ruim — nao
 * pode matar o processo que serve as tools MCP. Um servidor de chamados que
 * cai porque a caixa de e-mail piscou e pior que um intake parado.
 *
 * `setInterval` com `catch`, e nao `setTimeout` recursivo com backoff: backoff
 * e complexidade que ninguem pediu, e uma caixa fora do ar por uma hora e
 * problema de operacao, nao de retry sofisticado.
 */
export type AgendadorDeps = {
  readonly varrer: () => Promise<unknown>
  readonly intervaloMs: number
  readonly logger: Logger
  /** Injetado para o teste nao esperar o relogio de verdade. */
  readonly agendar?: (acao: () => void, ms: number) => { unref?: () => void }
  readonly cancelar?: (handle: unknown) => void
}

export type Agendador = {
  readonly parar: () => void
}

export const iniciarAgendador = ({
  varrer,
  intervaloMs,
  logger,
  agendar = setInterval,
  cancelar = clearInterval as (handle: unknown) => void,
}: AgendadorDeps): Agendador => {
  /**
   * Duas varreduras ao mesmo tempo processariam a mesma mensagem duas vezes. O
   * UNIQUE de `email_intake` (1.9) impede o Chamado duplicado — mas provocar a
   * corrida de proposito e desperdicio, e enche o log de "duplicado" que nao
   * diz nada sobre o mundo. Se a anterior ainda roda, o tique e pulado.
   */
  let emAndamento = false

  const tique = () => {
    if (emAndamento) {
      logger.aviso('varredura_pulada', {
        motivo: 'a varredura anterior ainda esta rodando',
        intervalo_ms: intervaloMs,
      })
      return
    }

    emAndamento = true

    // `void` deliberado: `setInterval` nao espera promessa. O `catch` abaixo e
    // o que impede a rejeicao de virar `unhandledRejection` e derrubar o
    // processo — que e exatamente o que esta funcao existe para evitar.
    void varrer()
      .catch((erro: unknown) => {
        logger.erro('falha_na_varredura', {
          causa: erro instanceof Error ? erro.message : String(erro),
        })
      })
      .finally(() => {
        emAndamento = false
      })
  }

  const handle = agendar(tique, intervaloMs)

  // `unref` deixa o processo terminar mesmo com o timer pendente. Sem ele, um
  // encerramento limpo esperaria o proximo tique.
  handle.unref?.()

  return { parar: () => cancelar(handle) }
}
