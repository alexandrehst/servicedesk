import { describe, expect, it, vi } from 'vitest'
import { iniciarAgendador } from './agendador.js'

/**
 * O agendador do intake (Story 5.1, AC #5).
 *
 * A garantia que este arquivo existe para provar: **uma varredura que falha nao
 * derruba o servidor MCP**. Um servidor de chamados que cai porque a caixa de
 * e-mail piscou e pior que um intake parado.
 *
 * A sonda: a SEGUNDA varredura tem de acontecer **depois** de a primeira
 * lancar. Um teste que so verificasse "nao lancou" passaria com o laco morto.
 */
const loggerDeTeste = () => {
  const erros: { evento: string; dados: Record<string, string | number> }[] = []
  const avisos: { evento: string; dados: Record<string, string | number> }[] = []
  return {
    erros,
    avisos,
    erro: (evento: string, dados: Record<string, string | number>) => {
      erros.push({ evento, dados })
    },
    aviso: (evento: string, dados: Record<string, string | number>) => {
      avisos.push({ evento, dados })
    },
  }
}

/** Relogio de mentira: dispara os tiques a mao, sem esperar tempo nenhum. */
const relogioManual = () => {
  const tiques: (() => void)[] = []
  return {
    agendar: (acao: () => void) => {
      tiques.push(acao)
      return {}
    },
    cancelar: () => {
      tiques.length = 0
    },
    disparar: () => {
      for (const t of [...tiques]) t()
    },
    get ativo() {
      return tiques.length > 0
    },
  }
}

describe('uma varredura que falha nao para o laco (AC #5)', () => {
  it('a segunda varredura acontece DEPOIS de a primeira lancar', async () => {
    const relogio = relogioManual()
    const logger = loggerDeTeste()
    let chamadas = 0

    const varrer = vi.fn(async () => {
      chamadas += 1
      if (chamadas === 1) {
        throw new Error('IMAP fora do ar')
      }
      return { lidas: 0 }
    })

    iniciarAgendador({
      varrer,
      intervaloMs: 1000,
      logger,
      agendar: relogio.agendar,
      cancelar: relogio.cancelar,
    })

    relogio.disparar()
    await vi.waitFor(() => expect(logger.erros).toHaveLength(1))

    // A prova: o laco continua vivo e a segunda varredura roda.
    relogio.disparar()
    await vi.waitFor(() => expect(chamadas).toBe(2))

    expect(logger.erros[0]?.evento).toBe('falha_na_varredura')
    expect(logger.erros[0]?.dados.causa).toBe('IMAP fora do ar')
  })

  it('a falha nao some: vai para o log com a causa', async () => {
    const relogio = relogioManual()
    const logger = loggerDeTeste()

    iniciarAgendador({
      varrer: async () => {
        throw new Error('credencial expirada')
      },
      intervaloMs: 1000,
      logger,
      agendar: relogio.agendar,
      cancelar: relogio.cancelar,
    })

    relogio.disparar()
    await vi.waitFor(() => expect(logger.erros).toHaveLength(1))

    expect(logger.erros[0]?.dados.causa).toBe('credencial expirada')
  })
})

describe('duas varreduras nao rodam ao mesmo tempo', () => {
  /**
   * O UNIQUE de `email_intake` (1.9) impede o Chamado duplicado — mas provocar
   * a corrida de proposito e desperdicio, e enche o log de "duplicado" que nao
   * diz nada sobre o mundo.
   */
  it('o tique e PULADO se a varredura anterior ainda roda', async () => {
    const relogio = relogioManual()
    const logger = loggerDeTeste()
    let emCurso = 0
    let liberar: () => void = () => {}

    const varrer = vi.fn(async () => {
      emCurso += 1
      await new Promise<void>((resolva) => {
        liberar = resolva
      })
      return {}
    })

    iniciarAgendador({
      varrer,
      intervaloMs: 1000,
      logger,
      agendar: relogio.agendar,
      cancelar: relogio.cancelar,
    })

    relogio.disparar()
    expect(emCurso).toBe(1)

    // Segundo tique com a primeira ainda rodando: nao chama de novo.
    relogio.disparar()
    expect(emCurso).toBe(1)
    expect(logger.avisos[0]?.evento).toBe('varredura_pulada')

    // Terminada a primeira, o proximo tique roda normalmente.
    //
    // O `await` de fila e necessario: quem libera a trava e o `.finally` da
    // promessa, que roda numa microtask POSTERIOR ao `liberar()`. Disparar
    // antes dela testaria o estado errado — e foi o que aconteceu na primeira
    // versao deste teste.
    liberar()
    await new Promise((resolva) => setTimeout(resolva, 0))

    relogio.disparar()
    await vi.waitFor(() => expect(emCurso).toBe(2))
  })
})

describe('parar de verdade', () => {
  it('depois de `parar`, nenhum tique novo e agendado', () => {
    const relogio = relogioManual()
    const logger = loggerDeTeste()
    const varrer = vi.fn(async () => ({}))

    const agendador = iniciarAgendador({
      varrer,
      intervaloMs: 1000,
      logger,
      agendar: relogio.agendar,
      cancelar: relogio.cancelar,
    })

    agendador.parar()
    relogio.disparar()

    expect(varrer).not.toHaveBeenCalled()
    expect(relogio.ativo).toBe(false)
  })
})
