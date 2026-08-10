import { describe, expect, it } from 'vitest'
import type { ResultadoDoIntake } from '../../application/contracts/intake-de-email.js'
import type { CaixaDeEntrada, MensagemNaCaixa } from '../../application/ports/caixa-de-entrada.js'
import type { Logger } from '../../application/ports/logger.js'
import { criarVarredura } from './varredura.js'

const eml = (assunto: string, id: string) =>
  [
    'From: marina@empresa.com',
    `Subject: ${assunto}`,
    `Message-ID: <${id}@empresa.com>`,
    'Authentication-Results: mx.empresa.com; dmarc=pass',
    '',
    'Corpo do relato.',
    '',
  ].join('\r\n')

const criarCaixa = (mensagens: MensagemNaCaixa[]) => {
  const marcadas: string[] = []

  const caixa: CaixaDeEntrada = {
    async buscarNaoProcessadas() {
      return mensagens
    },
    async marcarProcessada(id) {
      marcadas.push(id)
    },
  }

  return { caixa, marcadas }
}

const semLog = (): { logger: Logger; registros: string[] } => {
  const registros: string[] = []
  return {
    registros,
    logger: {
      erro: (evento) => registros.push(`erro:${evento}`),
      aviso: (evento) => registros.push(`aviso:${evento}`),
    },
  }
}

describe('varredura da caixa', () => {
  it('processa cada mensagem e marca como lida', async () => {
    const { caixa, marcadas } = criarCaixa([
      { id: '1', bruto: eml('Primeira', 'a') },
      { id: '2', bruto: eml('Segunda', 'b') },
    ])
    const processadas: string[] = []
    const { logger } = semLog()

    const resumo = await criarVarredura({
      caixa,
      logger,
      processar: async (m): Promise<ResultadoDoIntake> => {
        processadas.push(m.assunto)
        return { tipo: 'aberto', numero: 1000 }
      },
    })()

    expect(processadas).toEqual(['Primeira', 'Segunda'])
    expect(marcadas).toEqual(['1', '2'])
    expect(resumo).toEqual({ lidas: 2, abertas: 2, duplicadas: 0, recusadas: 0, falhas: 0 })
  })

  /**
   * Mensagem recusada TAMBEM e marcada como lida. Sem isso, todo e-mail de
   * remetente desconhecido voltaria em cada varredura, para sempre — e o log
   * de recusa viraria uma enxurrada que esconderia a recusa nova.
   */
  it('marca como lida tambem o que foi recusado', async () => {
    const { caixa, marcadas } = criarCaixa([{ id: '9', bruto: eml('De fora', 'c') }])
    const { logger } = semLog()

    const resumo = await criarVarredura({
      caixa,
      logger,
      processar: async (): Promise<ResultadoDoIntake> => ({
        tipo: 'recusado',
        motivo: 'remetente_desconhecido',
      }),
    })()

    expect(marcadas).toEqual(['9'])
    expect(resumo.recusadas).toBe(1)
  })

  /**
   * O oposto: quando o processamento LANCA, a mensagem NAO e marcada. Ela volta
   * na proxima varredura, e a dedup por `Message-ID` impede que uma falha
   * intermitente depois da abertura vire Chamado repetido.
   */
  it('nao marca como lida a mensagem que falhou', async () => {
    const { caixa, marcadas } = criarCaixa([{ id: '7', bruto: eml('Quebra', 'd') }])
    const { logger, registros } = semLog()

    const resumo = await criarVarredura({
      caixa,
      logger,
      processar: async () => {
        throw new Error('banco fora do ar')
      },
    })()

    expect(marcadas).toEqual([])
    expect(resumo.falhas).toBe(1)
    expect(registros).toContain('erro:falha_ao_processar_mensagem')
  })

  /**
   * Uma mensagem ruim nao pode parar o lote: se a primeira falha e o laco
   * aborta, uma unica mensagem malformada bloqueia o intake inteiro ate alguem
   * apagar o e-mail a mao.
   */
  it('uma mensagem que falha nao impede as seguintes', async () => {
    const { caixa, marcadas } = criarCaixa([
      { id: '1', bruto: eml('Vai falhar', 'e') },
      { id: '2', bruto: eml('Depois da ruim', 'f') },
    ])
    const { logger } = semLog()
    let tentativas = 0

    const resumo = await criarVarredura({
      caixa,
      logger,
      processar: async (): Promise<ResultadoDoIntake> => {
        tentativas += 1
        if (tentativas === 1) throw new Error('banco fora do ar')
        return { tipo: 'aberto', numero: 1001 }
      },
    })()

    // As duas foram TENTADAS; so a que passou foi marcada. A que falhou volta
    // na proxima varredura.
    expect(tentativas).toBe(2)
    expect(marcadas).toEqual(['2'])
    expect(resumo).toMatchObject({ abertas: 1, falhas: 1 })
  })

  /**
   * O `mailparser` e tolerante: texto que nao e um e-mail nao faz o parsing
   * lancar, vira uma mensagem com todos os campos vazios. Isso e bom — lixo
   * chega mesmo — e significa que a defesa contra lixo nao esta aqui, e sim na
   * recusa por `mensagem_vazia` do caso de uso. O teste existe para travar
   * essa expectativa: se um dia o parser passar a lancar, a varredura conta
   * como falha em vez de recusa, e o comportamento muda em silencio.
   */
  it('texto que nao e e-mail chega ao caso de uso como mensagem vazia', async () => {
    const { caixa } = criarCaixa([{ id: '1', bruto: 'isto nao e um e-mail' }])
    const { logger } = semLog()
    const vistas: string[] = []

    const resumo = await criarVarredura({
      caixa,
      logger,
      processar: async (m): Promise<ResultadoDoIntake> => {
        vistas.push(`${m.assunto}|${m.de}`)
        return { tipo: 'recusado', motivo: 'mensagem_vazia' }
      },
    })()

    expect(vistas).toEqual(['|'])
    expect(resumo).toMatchObject({ recusadas: 1, falhas: 0 })
  })

  /**
   * Nem tudo que e lancado e um `Error` — `throw 'texto'` acontece em
   * biblioteca de terceiro. Sem o `String(erro)`, a causa viraria `undefined`
   * no log e a falha ficaria sem diagnostico justamente no caso mais estranho.
   */
  it('registra causa mesmo quando o que foi lancado nao e um Error', async () => {
    const { caixa } = criarCaixa([{ id: '1', bruto: eml('Estranho', 'g') }])
    const { logger, registros } = semLog()

    const resumo = await criarVarredura({
      caixa,
      logger,
      processar: async () => {
        throw 'falha em texto puro'
      },
    })()

    expect(resumo.falhas).toBe(1)
    expect(registros).toContain('erro:falha_ao_processar_mensagem')
  })

  it('conta duplicadas separadamente das abertas', async () => {
    const { caixa } = criarCaixa([{ id: '1', bruto: eml('Repetida', 'f') }])
    const { logger } = semLog()

    const resumo = await criarVarredura({
      caixa,
      logger,
      processar: async (): Promise<ResultadoDoIntake> => ({ tipo: 'duplicado', numero: 1000 }),
    })()

    expect(resumo).toMatchObject({ abertas: 0, duplicadas: 1 })
  })

  it('caixa vazia nao e erro', async () => {
    const { caixa } = criarCaixa([])
    const { logger } = semLog()

    const resumo = await criarVarredura({
      caixa,
      logger,
      processar: async (): Promise<ResultadoDoIntake> => ({ tipo: 'aberto', numero: 1 }),
    })()

    expect(resumo.lidas).toBe(0)
  })
})
