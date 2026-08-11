import { beforeEach, describe, expect, it } from 'vitest'
import { ehDomainError } from '../../domain/errors.js'
import type { Ticket } from '../../domain/ticket.js'
import { embrulharBruto } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { IdentityRepository, UsuarioCadastrado } from '../ports/identity-repository.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { atribuirChamado } from './atribuir-chamado.js'

/**
 * A recusa antes do caminho feliz. O que esta story acrescenta ao padrao e a
 * verificacao do DESTINATARIO — e ela tem que ser cega quanto a causa.
 */

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

const chamado = (extra: Partial<Ticket> = {}): Ticket => ({
  number: 1000,
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
  status: 'aberto',
  prioridade: 'media',
  requester: 'marina@empresa.com',
  assignee: null,
  criadoEm: new Date('2026-08-11T12:00:00.000Z'),
  excluidoEm: null,
  version: 3,
  ...extra,
})

const CADASTRO: Record<string, UsuarioCadastrado> = {
  'bruno@empresa.com': { email: 'bruno@empresa.com', papel: 'agente' },
  'ana@empresa.com': { email: 'ana@empresa.com', papel: 'agente' },
  'marina@empresa.com': { email: 'marina@empresa.com', papel: 'solicitante' },
}

let atribuicoes: { de: string | null; para: string; esperada: number }[]
let existente: Ticket | null
let resultadoDoUpdate: { version: number } | null

const repositorio: Pick<TicketRepository, 'buscarPorNumero' | 'atribuirComAuditoria'> = {
  async buscarPorNumero() {
    return existente === null ? null : embrulharBruto({ ticket: existente, comentarios: [] })
  },
  async atribuirComAuditoria({ de, para, esperada }) {
    atribuicoes.push({ de, para, esperada })
    return resultadoDoUpdate
  },
}

const identidades: Pick<IdentityRepository, 'buscarUsuarioPorEmail'> = {
  async buscarUsuarioPorEmail(email) {
    return CADASTRO[email] ?? null
  },
}

const atribuir = atribuirChamado({ repositorio, identidades })

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
  atribuicoes = []
  existente = chamado()
  resultadoDoUpdate = { version: 4 }
})

describe('quem nao ve o Chamado', () => {
  it('alheio, excluido e inexistente sao indistinguiveis', async () => {
    const alheio = await erroDe(atribuir({ numero: 1000, versao: 3 }, carlos))

    existente = chamado({ excluidoEm: new Date() })
    const excluido = await erroDe(atribuir({ numero: 1000, versao: 3 }, bruno))

    existente = null
    const inexistente = await erroDe(atribuir({ numero: 1000, versao: 3 }, bruno))

    for (const erro of [alheio, excluido, inexistente]) {
      expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
    }
    expect(atribuicoes).toHaveLength(0)
  })
})

describe('quem ve mas nao pode atribuir (AC #2)', () => {
  it('o Solicitante nao atribui o proprio Chamado', async () => {
    const erro = await erroDe(atribuir({ numero: 1000, versao: 3 }, marina))

    expect(ehDomainError(erro) && erro.code).toBe('SemPermissao')
    expect(atribuicoes).toHaveLength(0)
  })

  /**
   * A ordem: autorizacao ANTES de olhar o destinatario. Se fosse ao contrario,
   * quem nao pode atribuir descobriria pela mensagem de erro quem esta
   * cadastrado — a tool viraria um verificador de quadro de funcionarios para
   * qualquer usuario.
   */
  it('Solicitante com destinatario invalido recebe SemPermissao, nao AtribuicaoInvalida', async () => {
    const erro = await erroDe(
      atribuir({ numero: 1000, versao: 3, agente: 'ninguem@fora.com' }, marina),
    )

    expect(ehDomainError(erro) && erro.code).toBe('SemPermissao')
  })
})

describe('o destinatario (AC #2)', () => {
  it.each([
    ['fora do cadastro', 'ninguem@fora.com'],
    ['Solicitante', 'marina@empresa.com'],
  ])('recusa %s', async (_caso, agente) => {
    const erro = await erroDe(atribuir({ numero: 1000, versao: 3, agente }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('AtribuicaoInvalida')
    expect(atribuicoes).toHaveLength(0)
  })

  it('a mensagem nao distingue as duas causas', async () => {
    const fora = await erroDe(atribuir({ numero: 1000, versao: 3, agente: 'x@y.com' }, bruno))
    const solicitante = await erroDe(
      atribuir({ numero: 1000, versao: 3, agente: 'marina@empresa.com' }, bruno),
    )

    expect(fora.message).toBe(solicitante.message)
  })

  /**
   * A capacidade consultada e `recebeAtribuicao`, e nao `atribuiChamado`:
   * "pode distribuir trabalho" e "pode receber trabalho" hoje coincidem, mas
   * nao sao a mesma pergunta.
   */
  it('o destinatario e verificado no cadastro, nao na entrada', async () => {
    await atribuir({ numero: 1000, versao: 3, agente: 'ana@empresa.com' }, bruno)

    expect(atribuicoes[0]?.para).toBe('ana@empresa.com')
  })

  /**
   * O e-mail GRAVADO vem do cadastro, nao da entrada normalizada.
   *
   * Hoje os dois coincidem — a busca e exata e `users` guarda normalizado —,
   * e por isso a mutacao que troca um pelo outro sobrevivia. Este teste torna a
   * intencao observavel simulando um cadastro que devolve grafia canonica
   * diferente da chave buscada, que e o que aconteceria com indice
   * case-insensitive (`citext`) ou dado legado. Se a fonte mudar para a
   * entrada, o Dono gravado passa a divergir do cadastro.
   */
  it('grava a grafia do cadastro, mesmo quando difere da busca', async () => {
    const cadastroComGrafiaPropria: Pick<IdentityRepository, 'buscarUsuarioPorEmail'> = {
      async buscarUsuarioPorEmail() {
        return { email: 'Ana.Souza@empresa.com', papel: 'agente' }
      },
    }

    await atribuirChamado({ repositorio, identidades: cadastroComGrafiaPropria })(
      { numero: 1000, versao: 3, agente: 'ana.souza@empresa.com' },
      bruno,
    )

    expect(atribuicoes[0]?.para).toBe('Ana.Souza@empresa.com')
  })
})

describe('self-assign (AC #1)', () => {
  it('sem o campo agente, atribui a quem chamou', async () => {
    const saida = await atribuir({ numero: 1000, versao: 3 }, bruno)

    expect(saida.para).toBe('bruno@empresa.com')
  })

  it('self-assign tambem passa pelo cadastro', async () => {
    // Um Agente que saiu do cadastro nao consegue pegar Chamado para si.
    const semBruno: Pick<IdentityRepository, 'buscarUsuarioPorEmail'> = {
      async buscarUsuarioPorEmail() {
        return null
      },
    }

    const erro = await erroDe(
      atribuirChamado({ repositorio, identidades: semBruno })({ numero: 1000, versao: 3 }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('AtribuicaoInvalida')
  })
})

describe('reatribuir ao mesmo Dono (AC #3)', () => {
  it('e recusado', async () => {
    existente = chamado({ assignee: 'ana@empresa.com' })

    const erro = await erroDe(
      atribuir({ numero: 1000, versao: 3, agente: 'ana@empresa.com' }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('AtribuicaoInvalida')
    expect(atribuicoes).toHaveLength(0)
  })

  /** A comparacao e sobre o e-mail NORMALIZADO, senao a grafia burlaria a regra. */
  it('nem com grafia diferente', async () => {
    existente = chamado({ assignee: 'Ana@Empresa.com' })

    const erro = await erroDe(
      atribuir({ numero: 1000, versao: 3, agente: 'ana@empresa.com' }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('AtribuicaoInvalida')
  })

  it('mas trocar de Dono passa', async () => {
    existente = chamado({ assignee: 'ana@empresa.com' })

    const saida = await atribuir({ numero: 1000, versao: 3, agente: 'bruno@empresa.com' }, bruno)

    expect(saida).toMatchObject({ de: 'ana@empresa.com', para: 'bruno@empresa.com' })
  })
})

describe('o par de/para e a versao (AC #1, #4)', () => {
  it('a primeira atribuicao manda `de` nulo ao repositorio', async () => {
    await atribuir({ numero: 1000, versao: 3, agente: 'ana@empresa.com' }, bruno)

    expect(atribuicoes[0]).toEqual({ de: null, para: 'ana@empresa.com', esperada: 3 })
  })

  it('a versao esperada vem da ENTRADA, nao do Chamado lido', async () => {
    await atribuir({ numero: 1000, versao: 2, agente: 'ana@empresa.com' }, bruno)

    expect(atribuicoes[0]?.esperada).toBe(2)
  })

  it('versao divergente vira Conflict', async () => {
    resultadoDoUpdate = null
    existente = chamado({ version: 9 })

    const erro = await erroDe(
      atribuir({ numero: 1000, versao: 3, agente: 'ana@empresa.com' }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('Conflict')
    expect(erro.message).toContain('9')
  })

  it('Chamado que sumiu no meio do caminho vira TicketNaoEncontrado', async () => {
    resultadoDoUpdate = null
    let leituras = 0
    const repoQueSome: typeof repositorio = {
      ...repositorio,
      async buscarPorNumero() {
        leituras += 1
        return leituras === 1 ? embrulharBruto({ ticket: chamado(), comentarios: [] }) : null
      },
    }

    const erro = await erroDe(
      atribuirChamado({ repositorio: repoQueSome, identidades })(
        { numero: 1000, versao: 3, agente: 'ana@empresa.com' },
        bruno,
      ),
    )

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')
  })
})
