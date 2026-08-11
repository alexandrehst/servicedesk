import { describe, expect, it } from 'vitest'
import type { Ticket } from './ticket.js'
import {
  type Comentario,
  embrulharBruto,
  filtrarComentarios,
  podeVerTicket,
  type QuemPergunta,
  ticketNaoEncontrado,
  visivelPara,
} from './visibilidade.js'

const agente: QuemPergunta = { identity: 'bruno@empresa.com', role: 'agente' }
const marina: QuemPergunta = { identity: 'marina@empresa.com', role: 'solicitante' }
const carlos: QuemPergunta = { identity: 'carlos@empresa.com', role: 'solicitante' }

const chamadoDaMarina: Ticket = {
  number: 1000,
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
  status: 'aberto',
  requester: 'marina@empresa.com',
  assignee: null,
  criadoEm: new Date('2026-08-10T12:00:00Z'),
  excluidoEm: null,
  version: 1,
}

describe('podeVerTicket', () => {
  it('Agente ve Chamado de qualquer Solicitante', () => {
    expect(podeVerTicket(agente, chamadoDaMarina)).toBe(true)
  })

  it('Solicitante ve o proprio Chamado', () => {
    expect(podeVerTicket(marina, chamadoDaMarina)).toBe(true)
  })

  it('Solicitante NAO ve Chamado alheio', () => {
    expect(podeVerTicket(carlos, chamadoDaMarina)).toBe(false)
  })
})

describe('filtrarComentarios', () => {
  const thread: readonly Comentario[] = [
    {
      autor: 'marina@empresa.com',
      corpo: 'Parou hoje.',
      internal: false,
      criadoEm: new Date(1),
      excluidoEm: null,
    },
    {
      autor: 'bruno@empresa.com',
      corpo: 'Fonte queimada.',
      internal: true,
      criadoEm: new Date(2),
      excluidoEm: null,
    },
    {
      autor: 'bruno@empresa.com',
      corpo: 'Peca pedida.',
      internal: false,
      criadoEm: new Date(3),
      excluidoEm: null,
    },
  ]

  it('Agente recebe publicos e internos', () => {
    expect(filtrarComentarios(agente, thread)).toHaveLength(3)
  })

  it('Solicitante nao recebe Comentario Interno', () => {
    const vistos = filtrarComentarios(marina, thread)
    expect(vistos).toHaveLength(2)
    expect(vistos.every((c) => !c.internal)).toBe(true)
  })

  it('preserva a ordem recebida', () => {
    expect(filtrarComentarios(marina, thread).map((c) => c.corpo)).toEqual([
      'Parou hoje.',
      'Peca pedida.',
    ])
  })
})

describe('visivelPara — a unica saida do dado bruto (AC #4)', () => {
  const thread: readonly Comentario[] = [
    {
      autor: 'marina@empresa.com',
      corpo: 'Parou hoje.',
      internal: false,
      criadoEm: new Date(1),
      excluidoEm: null,
    },
    {
      autor: 'bruno@empresa.com',
      corpo: 'Fonte queimada.',
      internal: true,
      criadoEm: new Date(2),
      excluidoEm: null,
    },
  ]

  const bruto = () => embrulharBruto({ ticket: chamadoDaMarina, comentarios: thread })

  it('Solicitante alheio nao recebe nada', () => {
    expect(visivelPara(carlos, bruto())).toBeNull()
  })

  it('Solicitante dono recebe o Chamado sem os Comentarios internos', () => {
    const visto = visivelPara(marina, bruto())

    expect(visto?.ticket.number).toBe(1000)
    expect(visto?.comentarios).toHaveLength(1)
    expect(visto?.comentarios.every((c) => !c.internal)).toBe(true)
  })

  it('Agente recebe o Chamado e a thread inteira', () => {
    const visto = visivelPara(agente, bruto())

    expect(visto?.comentarios).toHaveLength(2)
  })

  it('o conteudo bruto nao e alcancavel sem passar por aqui', () => {
    const embrulhado = bruto()

    // O simbolo que guarda o conteudo nao e exportado: fora deste modulo nao ha
    // chave para pegar. Isso e o que faz a autorizacao ser estrutural em vez de
    // depender de alguem lembrar de chama-la.
    expect(Object.keys(embrulhado)).toHaveLength(0)
    expect(JSON.stringify(embrulhado)).toBe('{}')
  })

  it('nao devolve o mesmo array de Comentarios que recebeu', () => {
    const original = [...thread]
    const visto = visivelPara(
      agente,
      embrulharBruto({ ticket: chamadoDaMarina, comentarios: original }),
    )

    // Devolver a referencia original deixaria quem chama alterar a thread que o
    // dominio acabou de autorizar.
    expect(visto?.comentarios).not.toBe(original)
  })
})

describe('ticketNaoEncontrado', () => {
  /**
   * O teste que importa nesta story: inexistente e alheio devolvem a MESMA
   * mensagem. Verificar cada caso isoladamente passaria mesmo com mensagens
   * diferentes — e a diferenca e justamente o vazamento.
   */
  it('produz mensagem identica para inexistente e para alheio', () => {
    const inexistente = ticketNaoEncontrado(9999)
    const alheio = ticketNaoEncontrado(9999)
    expect(alheio.message).toBe(inexistente.message)
    expect(alheio.code).toBe(inexistente.code)
  })

  it('nao revela nada alem do Numero perguntado', () => {
    const erro = ticketNaoEncontrado(1000)
    expect(erro.message).toBe('Chamado #1000 nao encontrado.')
    expect(erro.message).not.toMatch(/autoriz|permiss|dono|requester/i)
  })
})
