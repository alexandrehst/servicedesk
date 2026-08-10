import { beforeEach, describe, expect, it } from 'vitest'
import type { RateLimitRepository } from '../../application/ports/rate-limit-repository.js'
import { ehDomainError } from '../../domain/errors.js'
import { criarLimitador, janelaDe, LIMITE_POR_MINUTO } from './rate-limit.js'

const AGORA = new Date('2026-08-10T12:00:30.500Z')

let contadores: Map<string, number>
let chamadasAoRepo: { identity: string; janela: Date }[]

const repositorio: RateLimitRepository = {
  async registrarChamada(identity, janela) {
    chamadasAoRepo.push({ identity, janela })
    const chave = `${identity}|${janela.toISOString()}`
    const novo = (contadores.get(chave) ?? 0) + 1
    contadores.set(chave, novo)
    return novo
  },
}

const limitar = criarLimitador({ repositorio, agora: () => AGORA })

const erroDe = async (promessa: Promise<unknown>): Promise<Error> => {
  try {
    await promessa
  } catch (erro) {
    if (ehDomainError(erro)) return erro
    throw erro
  }
  throw new Error('Esperava erro de dominio, mas a operacao passou.')
}

beforeEach(() => {
  contadores = new Map()
  chamadasAoRepo = []
})

describe('janelaDe', () => {
  it('trunca ao minuto', () => {
    expect(janelaDe(new Date('2026-08-10T12:00:30.500Z')).toISOString()).toBe(
      '2026-08-10T12:00:00.000Z',
    )
  })

  it('instantes do mesmo minuto caem na mesma janela', () => {
    const inicio = janelaDe(new Date('2026-08-10T12:00:00.000Z'))
    const fim = janelaDe(new Date('2026-08-10T12:00:59.999Z'))

    expect(fim.getTime()).toBe(inicio.getTime())
  })

  it('o minuto seguinte e outra janela', () => {
    const agora = janelaDe(new Date('2026-08-10T12:00:59.999Z'))
    const depois = janelaDe(new Date('2026-08-10T12:01:00.000Z'))

    expect(depois.getTime()).toBe(agora.getTime() + 60_000)
  })
})

describe('o limite recusa quem passa dele (AC #2)', () => {
  it('a chamada 61 e recusada', async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) {
      await limitar('bot@empresa.com')
    }

    const erro = await erroDe(limitar('bot@empresa.com'))

    expect(ehDomainError(erro) && erro.code).toBe('LimiteExcedido')
  })

  it('a chamada 60 ainda passa', async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO - 1; i += 1) {
      await limitar('bot@empresa.com')
    }

    await expect(limitar('bot@empresa.com')).resolves.toBeUndefined()
  })

  it('o limite decidido e 60 por minuto', () => {
    // O numero e decisao do dono do projeto (2026-08-10). Mudar sem revisitar
    // a decisao reprova aqui.
    expect(LIMITE_POR_MINUTO).toBe(60)
  })
})

describe('o limite e por identidade, nao global (AC #2)', () => {
  it('um cliente no limite nao afeta o outro', async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) {
      await limitar('bot@empresa.com')
    }

    // Limite global deixaria uma IA em loop derrubar o acesso de todo mundo —
    // negacao de servico acidental, causada pela propria protecao.
    await expect(limitar('marina@empresa.com')).resolves.toBeUndefined()
  })
})

describe('a janela reabre (AC #2)', () => {
  it('o minuto seguinte volta a aceitar', async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) {
      await limitar('bot@empresa.com')
    }
    await erroDe(limitar('bot@empresa.com'))

    const proximoMinuto = criarLimitador({
      repositorio,
      agora: () => new Date('2026-08-10T12:01:00.000Z'),
    })

    await expect(proximoMinuto('bot@empresa.com')).resolves.toBeUndefined()
  })
})

describe('o erro conta o que o cliente precisa saber (AC #2)', () => {
  it('nao se confunde com credencial invalida', async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) {
      await limitar('bot@empresa.com')
    }

    const erro = await erroDe(limitar('bot@empresa.com'))

    // Distinguir e deliberado, ao contrario das Stories 1.2 e 1.3: quem bate no
    // limite precisa saber que adianta tentar depois. "Credencial invalida"
    // levaria a reemitir um token que estava bom.
    expect(ehDomainError(erro) && erro.code).not.toBe('CredencialInvalida')
    expect(erro.message).toMatch(/limite/i)
  })

  it('diz quando a janela reabre', async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) {
      await limitar('bot@empresa.com')
    }

    const erro = await erroDe(limitar('bot@empresa.com'))

    // 12:00:30.5 -> a janela reabre em 12:01:00Z.
    expect(erro.message).toContain('12:01:00')
  })

  it('nao carrega a identidade de quem chamou', async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) {
      await limitar('bot@empresa.com')
    }

    const erro = await erroDe(limitar('bot@empresa.com'))

    // A mensagem pode chegar ao cliente MCP e virar log dele. Identidade nao
    // precisa estar ali para o cliente entender o que fazer.
    expect(erro.message).not.toContain('bot@empresa.com')
  })
})

describe('delega a contagem ao banco (AC #6)', () => {
  it('nao mantem contador em memoria', async () => {
    await limitar('bot@empresa.com')
    await limitar('bot@empresa.com')

    // Duas chamadas, duas idas ao repositorio: contar em memoria zeraria no
    // restart e nao valeria para mais de uma instancia.
    expect(chamadasAoRepo).toHaveLength(2)
    expect(chamadasAoRepo[0]?.janela.toISOString()).toBe('2026-08-10T12:00:00.000Z')
  })
})
