import { describe, expect, it } from 'vitest'
import {
  ACOES_IRREVERSIVEIS,
  ACOES_IRREVERSIVEIS_NOMES,
  exigeMotivo,
  motivoValido,
} from './acoes-irreversiveis.js'
import { ACOES } from './auditoria.js'
import { STATUS } from './ticket.js'
import { TRANSICOES, TRANSICOES_COM_CONFIRMACAO } from './transicoes.js'

/**
 * O AD-7 em forma de DADOS (Story 2.6).
 *
 * A Story 2.2 declarou `TRANSICOES_COM_CONFIRMACAO` e deliberadamente nao a
 * executou. Esta tabela e o outro lado: qual acao dedicada executa cada uma
 * dessas transicoes, quem pode, e o que ela exige.
 */

describe('toda transicao irreversivel tem acao dedicada', () => {
  /**
   * O teste central da story. Transicao declarada como irreversivel SEM acao
   * que a execute e guardrail que trancou a porta e perdeu a chave: o Chamado
   * ficaria preso num estado do qual `mudar_status` recusa sair e nada mais
   * consegue.
   */
  it('todo destino de TRANSICOES_COM_CONFIRMACAO e alcancavel por alguma acao', () => {
    const destinos = new Set(ACOES_IRREVERSIVEIS_NOMES.map((a) => ACOES_IRREVERSIVEIS[a].destino))

    for (const de of STATUS) {
      for (const para of TRANSICOES_COM_CONFIRMACAO[de]) {
        expect(destinos).toContain(para)
      }
    }
  })

  /**
   * E o inverso: acao dedicada cujo destino nao esta na tabela seria uma
   * transicao inventada aqui, fora da maquina de estados do AD-5.
   */
  it('todo destino de acao dedicada esta declarado em TRANSICOES_COM_CONFIRMACAO', () => {
    const declarados = new Set(STATUS.flatMap((de) => [...TRANSICOES_COM_CONFIRMACAO[de]]))

    for (const acao of ACOES_IRREVERSIVEIS_NOMES) {
      expect(declarados).toContain(ACOES_IRREVERSIVEIS[acao].destino)
    }
  })

  /**
   * A separacao das duas tabelas (2.2) so vale se as acoes dedicadas nao
   * executarem o que `mudar_status` ja executa — senao existiriam dois
   * caminhos para a mesma transicao, e um deles sem confirmacao.
   */
  it('nenhuma acao dedicada duplica uma transicao comum', () => {
    for (const acao of ACOES_IRREVERSIVEIS_NOMES) {
      const { destino } = ACOES_IRREVERSIVEIS[acao]

      for (const de of STATUS) {
        if (TRANSICOES[de].includes(destino)) {
          // Se o destino aparece na tabela comum, a origem dele NAO pode estar
          // na de confirmacao — senao a mesma transicao teria dois caminhos.
          expect(TRANSICOES_COM_CONFIRMACAO[de]).not.toContain(destino)
        }
      }
    }
  })

  /** O vocabulario do Log e lista fechada: acao dedicada precisa estar nele. */
  it('toda acao dedicada esta em ACOES', () => {
    for (const acao of ACOES_IRREVERSIVEIS_NOMES) {
      expect(ACOES).toContain(acao)
    }
  })
})

describe('o que cada acao exige', () => {
  it.each([
    ['fechar_chamado', 'fechado', 'fechaOuCancela', false],
    ['cancelar_chamado', 'cancelado', 'fechaOuCancela', false],
    ['reabrir_chamado', 'em_andamento', 'reabre', true],
  ] as const)('%s leva a %s, pede %s e motivo=%s', (acao, destino, capacidade, motivo) => {
    expect(ACOES_IRREVERSIVEIS[acao]).toEqual({ destino, capacidade, exigeMotivo: motivo })
  })

  /**
   * Fechar e cancelar compartilham a capacidade porque a pergunta e a mesma
   * ("pode encerrar este Chamado?"); reabrir tem a sua porque "encerrar" e
   * "trazer de volta" sao decisoes diferentes, que hoje coincidem so por
   * existir um unico papel de atendimento (mesmo raciocinio da 2.3).
   */
  it('reabrir nao compartilha capacidade com encerrar', () => {
    expect(ACOES_IRREVERSIVEIS.reabrir_chamado.capacidade).not.toBe(
      ACOES_IRREVERSIVEIS.fechar_chamado.capacidade,
    )
  })

  it('so reabrir exige motivo', () => {
    expect(exigeMotivo('reabrir_chamado')).toBe(true)
    expect(exigeMotivo('fechar_chamado')).toBe(false)
    expect(exigeMotivo('cancelar_chamado')).toBe(false)
  })
})

/**
 * A exigencia do motivo vive AQUI, e nao so no schema Zod (AD-7: "a exigencia
 * vive no dominio, nao no adapter — todo ponto de entrada a herda"). Validar
 * so no contrato faria o adapter HTTP e a UI da Fase 1.5 dependerem de lembrar.
 */
describe('motivoValido', () => {
  it.each([undefined, '', '   ', '\n\t'])('recusa %j quando a acao exige motivo', (motivo) => {
    expect(motivoValido('reabrir_chamado', motivo)).toBe(false)
  })

  it('aceita motivo com conteudo', () => {
    expect(motivoValido('reabrir_chamado', 'O problema voltou.')).toBe(true)
  })

  it.each([undefined, '', 'qualquer coisa'])('aceita %j quando a acao nao exige', (motivo) => {
    expect(motivoValido('fechar_chamado', motivo)).toBe(true)
  })
})
