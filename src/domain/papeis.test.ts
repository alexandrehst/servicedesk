import { describe, expect, it } from 'vitest'
import { PAPEIS, type Papel, pode } from './papeis.js'

/**
 * O papel errado vem antes do papel certo: numa fronteira de autorizacao, o
 * que importa nao e o Agente enxergar — e o Solicitante NAO enxergar.
 */

describe('Solicitante', () => {
  it('nao ve Chamado de terceiro', () => {
    expect(pode('solicitante', 'veChamadoDeTerceiro')).toBe(false)
  })

  it('nao exclui Chamado, nem o proprio', () => {
    // Excluir e acao de quem atende (FR-20 so tem dois papeis). O dono do
    // Chamado nao decide que ele deixa de existir.
    expect(pode('solicitante', 'excluiChamado')).toBe(false)
  })

  it('nao ve Comentario Interno', () => {
    expect(pode('solicitante', 'veComentarioInterno')).toBe(false)
  })

  /**
   * Story 2.1 — ele PODE comentar o proprio Chamado; e a unica escrita que ele
   * tem no sistema. O que nao pode e criar Comentario Interno: a conversa do
   * time nao e dele, mesmo no Chamado dele.
   */
  it('nao cria Comentario Interno', () => {
    expect(pode('solicitante', 'comentaInterno')).toBe(false)
  })
})

describe('Agente', () => {
  it('ve Chamado de terceiro', () => {
    expect(pode('agente', 'veChamadoDeTerceiro')).toBe(true)
  })

  it('ve Comentario Interno', () => {
    expect(pode('agente', 'veComentarioInterno')).toBe(true)
  })

  it('exclui Chamado', () => {
    expect(pode('agente', 'excluiChamado')).toBe(true)
  })

  it('cria Comentario Interno (Story 2.1)', () => {
    expect(pode('agente', 'comentaInterno')).toBe(true)
  })
})

describe('a matriz cobre todos os papeis declarados', () => {
  // Exaustivo sobre PAPEIS, nao sobre uma lista escrita a mao aqui: papel novo
  // sem decisao de capacidade reprova este teste em vez de virar um `false`
  // silencioso.
  it.each(PAPEIS)('%s tem decisao explicita para toda capacidade', (papel: Papel) => {
    expect(typeof pode(papel, 'veChamadoDeTerceiro')).toBe('boolean')
    expect(typeof pode(papel, 'veComentarioInterno')).toBe('boolean')
    expect(typeof pode(papel, 'excluiChamado')).toBe('boolean')
    expect(typeof pode(papel, 'veHistorico')).toBe('boolean')
    expect(typeof pode(papel, 'comentaInterno')).toBe('boolean')
  })

  it('os dois papeis do MVP sao exatamente solicitante e agente (FR-20)', () => {
    expect([...PAPEIS].sort()).toEqual(['agente', 'solicitante'])
  })

  it('papel desconhecido explode em vez de virar um `false` silencioso', () => {
    // So alcancavel com cast — que e exatamente o caminho por onde um papel
    // invalido chegaria na pratica: uma linha corrompida em `users`. O ramo
    // existe para falhar ALTO. Um `false` aqui seria pior: a pessoa
    // simplesmente nao veria o que deveria, e ninguem saberia por quê.
    const invalido = 'supervisor' as Papel

    expect(() => pode(invalido, 'veChamadoDeTerceiro')).toThrowError(/sem politica/i)
  })

  it('nenhuma capacidade e igual para os dois papeis', () => {
    // Se as duas linhas da matriz ficarem iguais, o papel deixou de significar
    // alguma coisa — e nenhum outro teste notaria.
    const solicitante = [
      pode('solicitante', 'veChamadoDeTerceiro'),
      pode('solicitante', 'veComentarioInterno'),
    ]
    const agente = [pode('agente', 'veChamadoDeTerceiro'), pode('agente', 'veComentarioInterno')]

    expect(solicitante).not.toEqual(agente)
  })
})
