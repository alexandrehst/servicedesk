import { describe, expect, it } from 'vitest'
import { ehDomainError } from './errors.js'
import { filtroDeDono, RECORTES } from './recorte-da-fila.js'
import type { QuemPergunta } from './visibilidade.js'

/**
 * Os recortes da Fila (Story 3.2, FR-9).
 *
 * Funcao pura: decide QUAL filtro de Dono aplicar, e devolve dado — no molde de
 * `escopoDeLeitura` (3.1). Quem traduz para `WHERE` e o adapter.
 */

const bruno: QuemPergunta = { identity: 'bruno@empresa.com', role: 'agente' }
const marina: QuemPergunta = { identity: 'marina@empresa.com', role: 'solicitante' }

const erroDe = (fn: () => unknown): Error => {
  try {
    fn()
  } catch (erro) {
    if (ehDomainError(erro)) return erro
    throw erro
  }
  throw new Error('Esperava erro de dominio, mas a chamada passou.')
}

describe('sem recorte e sem filtro', () => {
  it('nao restringe por Dono', () => {
    expect(filtroDeDono(bruno, {})).toEqual({ tipo: 'qualquer' })
  })
})

describe('o recorte "meus" (AC #2)', () => {
  /**
   * A identidade sai de QUEM ESTA AUTENTICADO, nunca de um parametro. Se fosse
   * acucar para "preencha `dono` com a sua identidade", a IA teria que saber e
   * escrever a identidade — e escreveria errado em algum momento.
   */
  it('vira a identidade de quem pergunta', () => {
    expect(filtroDeDono(bruno, { recorte: 'meus' })).toEqual({
      tipo: 'identidade',
      identity: 'bruno@empresa.com',
    })
  })

  /**
   * O mesmo recorte, para pessoas diferentes, produz filtros diferentes — e e
   * isso que o torna uma afirmacao sobre quem chama, e nao um filtro comum.
   */
  it('nunca devolve a identidade de outra pessoa', () => {
    const doBruno = filtroDeDono(bruno, { recorte: 'meus' })
    const daMarina = filtroDeDono(marina, { recorte: 'meus' })

    expect(doBruno).not.toEqual(daMarina)
  })

  /**
   * Para o Solicitante o recorte vale — e devolve vazio na consulta, porque ele
   * nunca recebe atribuicao (2.3). O que ele abriu ja e o escopo padrao dele.
   */
  it('vale para qualquer papel, com a mesma definicao', () => {
    expect(filtroDeDono(marina, { recorte: 'meus' })).toEqual({
      tipo: 'identidade',
      identity: 'marina@empresa.com',
    })
  })
})

describe('o recorte "sem_dono" (AC #1)', () => {
  it('vira o filtro de ausencia', () => {
    expect(filtroDeDono(bruno, { recorte: 'sem_dono' })).toEqual({ tipo: 'ninguem' })
  })
})

describe('o filtro por Dono explicito', () => {
  it('vira a identidade informada', () => {
    expect(filtroDeDono(bruno, { dono: 'ana@empresa.com' })).toEqual({
      tipo: 'identidade',
      identity: 'ana@empresa.com',
    })
  })

  /**
   * `meus` e `dono: X` convergem para o MESMO caso: o que difere e de onde vem
   * a identidade, e essa decisao e daqui — nao do SQL.
   */
  it('tem a mesma forma que "meus"', () => {
    const explicito = filtroDeDono(bruno, { dono: 'bruno@empresa.com' })
    const recorte = filtroDeDono(bruno, { recorte: 'meus' })

    expect(explicito).toEqual(recorte)
  })
})

describe('recorte e dono juntos sao recusados (AC #3)', () => {
  /**
   * Os dois respondem a MESMA pergunta. Aceitar a combinacao exigiria escolher
   * um vencedor em silencio, e quem chamou nao saberia qual filtro foi aplicado.
   */
  it.each([
    ['meus', 'ana@empresa.com'],
    ['sem_dono', 'ana@empresa.com'],
    // Inclusive quando "concordam": aceitar este caso obrigaria a comparar
    // identidades aqui, e a regra passaria a depender de QUEM pergunta.
    ['meus', 'bruno@empresa.com'],
  ] as const)('recorte=%s com dono=%s', (recorte, dono) => {
    const erro = erroDe(() => filtroDeDono(bruno, { recorte, dono }))

    expect(ehDomainError(erro) && erro.code).toBe('RecorteConflitante')
  })

  it('a mensagem diz o que fazer, e nao so o que esta errado', () => {
    const erro = erroDe(() => filtroDeDono(bruno, { recorte: 'meus', dono: 'ana@empresa.com' }))

    expect(erro.message).toContain('recorte')
    expect(erro.message).toContain('dono')
  })
})

describe('o vocabulario dos recortes', () => {
  /** Lista fechada, como STATUS e PRIORIDADES: recorte novo exige uma linha. */
  it('tem exatamente os dois da FR-9', () => {
    expect(RECORTES).toEqual(['meus', 'sem_dono'])
  })
})
