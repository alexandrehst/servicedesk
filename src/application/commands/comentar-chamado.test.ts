import { beforeEach, describe, expect, it } from 'vitest'
import type { NovoComentario } from '../../domain/comentario.js'
import { ehDomainError } from '../../domain/errors.js'
import type { Ticket } from '../../domain/ticket.js'
import { embrulharBruto } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { comentarChamado } from './comentar-chamado.js'

/**
 * O papel errado antes do papel certo, e a recusa antes do caminho feliz — o
 * padrao das stories 1.4, 1.7 e 1.8. Um command que cria Comentario
 * corretamente mas deixa o Solicitante criar um Interno nao esta "quase
 * certo": esta errado.
 */

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

const chamadoDaMarina: Ticket = {
  number: 1000,
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
  status: 'aberto',
  requester: 'marina@empresa.com',
  assignee: null,
  criadoEm: new Date('2026-08-11T12:00:00.000Z'),
  excluidoEm: null,
  version: 1,
}

const CRIADO_EM = new Date('2026-08-11T13:00:00.000Z')

let criados: { numero: number; novo: NovoComentario; autor: Principal; acao: string }[]
let existente: Ticket | null

const repositorio: TicketRepository = {
  async criarComAuditoria() {
    throw new Error('esta suite nao abre Chamado')
  },
  async buscarPorNumero() {
    return existente === null ? null : embrulharBruto({ ticket: existente, comentarios: [] })
  },
  async criarComentarioComAuditoria(numero, novo, autor, acao) {
    criados.push({ numero, novo, autor, acao })
    return { criadoEm: CRIADO_EM }
  },
  async excluirComAuditoria() {
    throw new Error('esta suite nao exclui')
  },
  async mudarStatusComAuditoria() {
    throw new Error('esta suite nao muda Status')
  },
  async buscarIntakePorMessageId() {
    throw new Error('esta suite nao faz intake por e-mail')
  },
  async buscarHistoricoBruto() {
    throw new Error('esta suite nao le historico')
  },
}

const comentar = comentarChamado({ repositorio })

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
  criados = []
  existente = chamadoDaMarina
})

describe('Chamado que o autor nao pode ver (AC #4)', () => {
  /**
   * Os tres comparados ENTRE SI: se algum devolvesse codigo diferente, a
   * diferenca viraria um oraculo de existencia — os Numeros sao sequenciais
   * (AD-4), entao bastaria sondar.
   */
  it('alheio, excluido e inexistente sao indistinguiveis', async () => {
    const alheio = await erroDe(comentar({ numero: 1000, texto: 'oi', interno: false }, carlos))

    existente = { ...chamadoDaMarina, excluidoEm: new Date() }
    const excluido = await erroDe(comentar({ numero: 1000, texto: 'oi', interno: false }, bruno))

    existente = null
    const inexistente = await erroDe(comentar({ numero: 1000, texto: 'oi', interno: false }, bruno))

    for (const erro of [alheio, excluido, inexistente]) {
      expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
    }
    expect(criados).toHaveLength(0)
  })

  /**
   * O Chamado excluido e o teste que prova a herança: esta story nasceu depois
   * da 1.7 e nunca escreveu uma linha sobre `excluidoEm`. Quem barra e o
   * gargalo `visivelPara`.
   */
  it('nem o Agente comenta em Chamado excluido', async () => {
    existente = { ...chamadoDaMarina, excluidoEm: new Date('2026-08-11T10:00:00.000Z') }

    const erro = await erroDe(comentar({ numero: 1000, texto: 'oi', interno: false }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })
})

describe('Comentario Interno (AC #3)', () => {
  it('o Solicitante nao cria Comentario Interno, nem no proprio Chamado', async () => {
    const erro = await erroDe(comentar({ numero: 1000, texto: 'segredo', interno: true }, marina))

    expect(ehDomainError(erro) && erro.code).toBe('SemPermissao')
    expect(criados).toHaveLength(0)
  })

  /**
   * Recusa explicita, e NAO rebaixamento silencioso para publico. Quem escreveu
   * achando que era interno veria o texto aparecer para quem quis esconder.
   */
  it('a recusa nao vira um Comentario publico criado a revelia', async () => {
    await erroDe(comentar({ numero: 1000, texto: 'segredo', interno: true }, marina))

    expect(criados).toHaveLength(0)
  })

  it('o erro nao revela qual papel seria necessario', async () => {
    const erro = await erroDe(comentar({ numero: 1000, texto: 'x', interno: true }, marina))

    expect(erro.message).not.toContain('agente')
    expect(erro.message).not.toContain('Agente')
  })

  it('o Agente cria Comentario Interno', async () => {
    const saida = await comentar(
      { numero: 1000, texto: 'Cliente ja reclamou 3x', interno: true },
      bruno,
    )

    expect(saida.interno).toBe(true)
    expect(criados[0]?.novo.internal).toBe(true)
  })
})

describe('a escrita que o Solicitante TEM (AC #3)', () => {
  /**
   * A capacidade e sobre INTERNO, nao sobre comentar. Se ela fosse
   * `comentaChamado`, o Solicitante perderia a unica escrita que ele tem no
   * sistema — e o Chamado dele viraria uma via de mao unica.
   */
  it('o Solicitante comenta o proprio Chamado', async () => {
    const saida = await comentar(
      { numero: 1000, texto: 'Continua sem ligar', interno: false },
      marina,
    )

    expect(saida).toMatchObject({ numero: 1000, autor: 'marina@empresa.com', interno: false })
    expect(criados).toHaveLength(1)
  })

  it('o Solicitante nao comenta Chamado alheio', async () => {
    const erro = await erroDe(comentar({ numero: 1000, texto: 'oi', interno: false }, carlos))

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })
})

describe('validacao de dominio (AC #5)', () => {
  it.each(['', '   '])('corpo vazio (%j) e recusado', async (texto) => {
    const erro = await erroDe(comentar({ numero: 1000, texto, interno: false }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('CorpoObrigatorio')
  })

  /** Escrita que nao aconteceu nao vira auditoria (licao da 1.7). */
  it('corpo invalido nao chega ao repositorio', async () => {
    await erroDe(comentar({ numero: 1000, texto: '  ', interno: false }, bruno))

    expect(criados).toHaveLength(0)
  })
})

describe('o que e gravado (AC #1)', () => {
  it('o autor e a identidade do principal, nunca vem da entrada (AD-9)', async () => {
    await comentar({ numero: 1000, texto: 'ok', interno: false }, bruno)

    expect(criados[0]?.novo.autor).toBe('bruno@empresa.com')
    expect(criados[0]?.autor.origin).toBe('mcp')
  })

  it('devolve o instante atribuido pela persistencia, em ISO 8601 UTC', async () => {
    const saida = await comentar({ numero: 1000, texto: 'ok', interno: false }, bruno)

    expect(saida.criadoEm).toBe('2026-08-11T13:00:00.000Z')
  })

  it('o corpo chega ao repositorio sem espacos em volta', async () => {
    await comentar({ numero: 1000, texto: '  com espacos  ', interno: false }, bruno)

    expect(criados[0]?.novo.corpo).toBe('com espacos')
  })
})

describe('o rotulo do Log nasce no dominio (achado do PR #46)', () => {
  /**
   * O adapter recebe a acao PRONTA. Se ele a deduzisse de `novo.internal`,
   * seria o unico lugar do sistema a saber o que aquele booleano significa
   * para a auditoria — e um segundo caminho de escrita poderia divergir.
   */
  it('o command resolve a acao e a entrega ao repositorio', async () => {
    await comentar({ numero: 1000, texto: 'publico', interno: false }, bruno)
    await comentar({ numero: 1000, texto: 'interno', interno: true }, bruno)

    expect(criados.map((c) => c.acao)).toEqual(['comentar_chamado', 'comentar_chamado_interno'])
  })
})
