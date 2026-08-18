import { describe, expect, it } from 'vitest'
import { alcanceDaBusca } from './busca.js'
import { ehDomainError } from './errors.js'
import type { QuemPergunta } from './visibilidade.js'

/**
 * O alcance da busca (Story 3.4, FR-11).
 *
 * O que se decide aqui e o que o `LIKE` PODE alcancar — e a parte que importa e
 * o Comentario Interno: se ele entrar no match, a existencia do resultado conta
 * a quem nao pode ver que a conversa do time fala daquele assunto.
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

describe('o que cada papel alcanca (AC #2)', () => {
  /**
   * O Agente ve Comentario Interno (1.4), entao o match pode considera-lo: para
   * ele, a existencia do resultado nao conta nada que ele nao possa ler.
   */
  it('o Agente busca em todos os Comentarios', () => {
    expect(alcanceDaBusca(bruno, 'juridico')).toEqual({
      termo: 'juridico',
      comentarios: 'todos',
    })
  })

  /**
   * O caso que motiva a story. Um Comentario Interno dizendo "escalar para o
   * juridico" nao pode fazer o Chamado dela aparecer numa busca por "juridico":
   * o conteudo nao seria exibido, mas o RESULTADO revelaria do que a conversa
   * interna trata.
   */
  it('o Solicitante busca apenas nos Comentarios publicos', () => {
    expect(alcanceDaBusca(marina, 'juridico')).toEqual({
      termo: 'juridico',
      comentarios: 'apenasPublicos',
    })
  })

  it('o mesmo termo produz alcances diferentes por papel', () => {
    expect(alcanceDaBusca(bruno, 'x').comentarios).not.toBe(alcanceDaBusca(marina, 'x').comentarios)
  })
})

describe('o termo', () => {
  it('perde espaco em volta', () => {
    expect(alcanceDaBusca(bruno, '  vpn  ').termo).toBe('vpn')
  })

  /**
   * Termo vazio devolveria a base inteira com cara de resultado de busca. A
   * recusa vive AQUI, e nao so no `.min(1)` do Zod, para que todo ponto de
   * entrada a herde (mesma razao do motivo da reabertura, 2.6).
   */
  it.each(['', '   ', '\n\t'])('recusa %j', (termo) => {
    const erro = erroDe(() => alcanceDaBusca(bruno, termo))

    expect(ehDomainError(erro) && erro.code).toBe('TermoObrigatorio')
  })

  /** Uma letra e busca legitima: "e" acha "erro" e a paginacao segura o resto. */
  it('aceita termo de um caractere', () => {
    expect(alcanceDaBusca(bruno, 'e').termo).toBe('e')
  })
})
