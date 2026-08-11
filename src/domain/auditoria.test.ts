import { describe, expect, it } from 'vitest'
import { ACOES, acaoDeComentario } from './auditoria.js'

/**
 * O vocabulario do Log vive no dominio porque a acao registrada e rotulo de
 * NEGOCIO: e por ela que a revisao da Story 1.8 responde "o que a IA fez neste
 * Chamado?".
 *
 * Antes desta funcao, o adapter Postgres ramificava sobre `novo.internal`
 * dentro do INSERT — era o unico lugar do sistema que sabia o que aquele
 * booleano significa para a auditoria. Achado do `claude-review` no PR #46.
 */

describe('acaoDeComentario', () => {
  it('Comentario publico e interno gravam rotulos diferentes', () => {
    expect(acaoDeComentario(false)).toBe('comentar_chamado')
    expect(acaoDeComentario(true)).toBe('comentar_chamado_interno')
  })

  /**
   * A distincao existe para quem audita: um Comentario Interno criado pela IA
   * e conversa do time, e some do Log se os dois rotulos colapsarem.
   */
  it('os dois rotulos nao colapsam num so', () => {
    expect(acaoDeComentario(true)).not.toBe(acaoDeComentario(false))
  })

  it.each([true, false])('o rotulo de interno=%s esta na lista fechada', (interno) => {
    expect(ACOES).toContain(acaoDeComentario(interno))
  })
})

describe('ACOES', () => {
  it('nao tem rotulo repetido — duplicata quebraria o filtro do historico', () => {
    expect(new Set(ACOES).size).toBe(ACOES.length)
  })

  it.each(['abrir_chamado', 'excluir_chamado'])('mantem %s, que ja era gravado', (acao) => {
    expect(ACOES).toContain(acao)
  })
})
