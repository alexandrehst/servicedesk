import { describe, expect, it } from 'vitest'
import { criarComentario } from './comentario.js'
import { DomainError } from './errors.js'

/**
 * Nucleo puro: valida e monta, sem I/O. Espelha `abrirTicket` da Story 1.1 —
 * se a validacao falha, nada e persistido porque nada aqui persiste.
 */

const valido = {
  corpo: 'Troquei a fonte do notebook e voltou a ligar.',
  autor: 'bruno@empresa.com',
  interno: false,
}

describe('criarComentario', () => {
  it('monta o Comentario com autor e corpo', () => {
    const c = criarComentario(valido)

    expect(c.autor).toBe('bruno@empresa.com')
    expect(c.corpo).toBe('Troquei a fonte do notebook e voltou a ligar.')
  })

  it('remove espacos em volta do corpo', () => {
    expect(criarComentario({ ...valido, corpo: '  Sem toner  ' }).corpo).toBe('Sem toner')
  })

  it.each(['', '   ', '\n\t'])('rejeita corpo vazio (%j) com erro tipado', (corpo) => {
    try {
      criarComentario({ ...valido, corpo })
      expect.unreachable('deveria ter lancado')
    } catch (erro) {
      expect(erro).toBeInstanceOf(DomainError)
      expect((erro as DomainError).code).toBe('CorpoObrigatorio')
    }
  })

  /**
   * `interno` explicito, sem default aqui: quem constroi ja decidiu. O default
   * seguro (`false`) vive no contrato Zod, na fronteira — e o dominio nao
   * precisa adivinhar intencao.
   */
  it('preserva a marcacao de interno', () => {
    expect(criarComentario({ ...valido, interno: true }).internal).toBe(true)
    expect(criarComentario(valido).internal).toBe(false)
  })

  /**
   * Nao expoe `criadoEm` nem `id`: quem os atribui e a persistencia, como o
   * Numero do Chamado (AD-4). Deixa-los fora do tipo torna impossivel
   * gera-los em codigo por engano.
   */
  it('nao carrega o que pertence a persistencia', () => {
    const c = criarComentario(valido)

    expect(c).not.toHaveProperty('criadoEm')
    expect(c).not.toHaveProperty('id')
  })
})
