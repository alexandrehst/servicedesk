import { beforeEach, describe, expect, it } from 'vitest'
import type {
  IdentityRepository,
  LinkConsumido,
  SessaoEncontrada,
  TokenMcpEncontrado,
  UsuarioCadastrado,
} from '../../application/ports/identity-repository.js'
import type { NotificadorDeLogin } from '../../application/ports/notificador-de-login.js'
import { ehDomainError } from '../../domain/errors.js'
import {
  autenticarComLink,
  resolverPrincipal,
  resolverPrincipalDeTokenMcp,
  solicitarLink,
} from './autenticacao.js'
import { hashToken } from './token.js'

/**
 * Os testes negativos vem primeiro de proposito: numa fronteira de seguranca,
 * o que importa nao e que o caminho feliz funcione — e que todo o resto nao.
 */

const AGORA = new Date('2026-08-10T12:00:00.000Z')
const relogio = () => AGORA

/**
 * Igual ao helper da Story 1.2: `.catch((e) => e as Error)` devolveria a uniao
 * com a saida de sucesso, e `.message` nao existe nela. Este helper estreita
 * de verdade e FALHA quando nao houve erro — sem isso, o dia em que a
 * autenticacao parasse de recusar credencial ruim passaria despercebido.
 */
const erroDe = async (promessa: Promise<unknown>): Promise<Error> => {
  try {
    await promessa
  } catch (erro) {
    if (ehDomainError(erro)) {
      return erro
    }
    throw erro
  }
  throw new Error('Esperava erro de dominio, mas a operacao foi bem-sucedida.')
}

type EstadoDoDuble = {
  usuarios: UsuarioCadastrado[]
  linksCriados: { email: string; tokenHash: string; expiraEm: Date }[]
  sessoesCriadas: { email: string; tokenHash: string; expiraEm: Date }[]
  enviados: { email: string; token: string }[]
  linkAoConsumir: LinkConsumido | null
  sessaoEncontrada: SessaoEncontrada | null
  tokenMcp: TokenMcpEncontrado | null
  hashesConsumidos: string[]
  hashesBuscados: string[]
  hashesDeTokenMcp: string[]
}

let estado: EstadoDoDuble

const repositorio: IdentityRepository = {
  async excluirUsuarioComAuditoria() {
    throw new Error('a autenticacao nao exclui Usuario')
  },
  async buscarUsuarioPorEmail(email) {
    return estado.usuarios.find((u) => u.email === email) ?? null
  },
  async criarLinkDeLogin(entrada) {
    estado.linksCriados.push({ ...entrada })
  },
  async consumirLinkDeLogin(tokenHash) {
    estado.hashesConsumidos.push(tokenHash)
    return estado.linkAoConsumir
  },
  async criarSessao(entrada) {
    estado.sessoesCriadas.push({ ...entrada })
  },
  async buscarSessaoPorHash(tokenHash) {
    estado.hashesBuscados.push(tokenHash)
    return estado.sessaoEncontrada
  },
  async buscarTokenMcpPorHash(tokenHash) {
    estado.hashesDeTokenMcp.push(tokenHash)
    return estado.tokenMcp
  },
}

const notificador: NotificadorDeLogin = {
  async enviarLinkDeLogin(email, token) {
    estado.enviados.push({ email, token })
  },
}

const deps = { repositorio, notificador, agora: relogio }

beforeEach(() => {
  estado = {
    usuarios: [{ email: 'ana@empresa.com', papel: 'agente' }],
    linksCriados: [],
    sessoesCriadas: [],
    enviados: [],
    linkAoConsumir: null,
    sessaoEncontrada: null,
    tokenMcp: null,
    hashesConsumidos: [],
    hashesBuscados: [],
    hashesDeTokenMcp: [],
  }
})

describe('autenticarComLink — caminhos negativos (AC #4)', () => {
  it('recusa token que nao existe', async () => {
    estado.linkAoConsumir = null

    const erro = await erroDe(autenticarComLink(deps)({ token: 'token-inventado' }))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
    expect(estado.sessoesCriadas).toHaveLength(0)
  })

  it('recusa token ja usado', async () => {
    // O consumo atomico devolve `null` para link ja usado: do ponto de vista
    // do servico, usado e inexistente sao a mesma coisa.
    estado.linkAoConsumir = null

    const erro = await erroDe(autenticarComLink(deps)({ token: 'token-reusado' }))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
    expect(estado.sessoesCriadas).toHaveLength(0)
  })

  it('recusa token expirado e nao cria sessao', async () => {
    estado.linkAoConsumir = {
      email: 'ana@empresa.com',
      expiraEm: new Date(AGORA.getTime() - 1_000),
    }

    const erro = await erroDe(autenticarComLink(deps)({ token: 'token-velho' }))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
    expect(estado.sessoesCriadas).toHaveLength(0)
  })

  it('recusa token expirado exatamente no limite dos 15 minutos', async () => {
    estado.linkAoConsumir = { email: 'ana@empresa.com', expiraEm: AGORA }

    const erro = await erroDe(autenticarComLink(deps)({ token: 'no-limite' }))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })

  it('recusa link de usuario que saiu do cadastro', async () => {
    estado.usuarios = []
    estado.linkAoConsumir = {
      email: 'ana@empresa.com',
      expiraEm: new Date(AGORA.getTime() + 60_000),
    }

    const erro = await erroDe(autenticarComLink(deps)({ token: 'de-ex-funcionario' }))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
    expect(estado.sessoesCriadas).toHaveLength(0)
  })

  it('busca pelo HASH do token, nunca pelo token cru', async () => {
    estado.linkAoConsumir = null

    await erroDe(autenticarComLink(deps)({ token: 'token-cru' }))

    expect(estado.hashesConsumidos).toEqual([hashToken('token-cru')])
    expect(estado.hashesConsumidos).not.toContain('token-cru')
  })
})

describe('resolverPrincipal — caminhos negativos (AC #4, #5)', () => {
  it('recusa token vazio sem sequer consultar o repositorio', async () => {
    const erro = await erroDe(resolverPrincipal(deps)(''))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
    expect(estado.hashesBuscados).toHaveLength(0)
  })

  it('recusa sessao inexistente', async () => {
    estado.sessaoEncontrada = null

    const erro = await erroDe(resolverPrincipal(deps)('nao-existe'))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })

  it('recusa sessao expirada', async () => {
    estado.sessaoEncontrada = {
      email: 'ana@empresa.com',
      papel: 'agente',
      expiraEm: new Date(AGORA.getTime() - 1),
    }

    const erro = await erroDe(resolverPrincipal(deps)('sessao-velha'))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })
})

describe('a mensagem nao distingue os casos (AC #4, #5)', () => {
  it('link inexistente, expirado e sessao expirada devolvem erro identico', async () => {
    estado.linkAoConsumir = null
    const inexistente = await erroDe(autenticarComLink(deps)({ token: 'a' }))

    estado.linkAoConsumir = {
      email: 'ana@empresa.com',
      expiraEm: new Date(AGORA.getTime() - 1),
    }
    const expirado = await erroDe(autenticarComLink(deps)({ token: 'b' }))

    estado.sessaoEncontrada = {
      email: 'ana@empresa.com',
      papel: 'agente',
      expiraEm: new Date(AGORA.getTime() - 1),
    }
    const sessaoMorta = await erroDe(resolverPrincipal(deps)('c'))

    // Comparados ENTRE SI, como a Story 1.2 estabeleceu. Verificar cada um
    // isoladamente nao provaria nada: a diferenca e que vaza.
    const forma = (e: Error) => ({
      name: e.name,
      code: ehDomainError(e) ? e.code : undefined,
      message: e.message,
    })

    expect(forma(expirado)).toEqual(forma(inexistente))
    expect(forma(sessaoMorta)).toEqual(forma(inexistente))
  })

  it('a mensagem nao revela qual foi o problema', async () => {
    estado.linkAoConsumir = null
    const erro = await erroDe(autenticarComLink(deps)({ token: 'x' }))

    for (const pista of ['expir', 'usado', 'inexistente', 'nao encontrado', 'cadastr']) {
      expect(erro.message.toLowerCase()).not.toContain(pista)
    }
  })

  it('nenhum erro carrega o token', async () => {
    estado.linkAoConsumir = null
    const doLink = await erroDe(autenticarComLink(deps)({ token: 'segredo-do-link' }))
    const daSessao = await erroDe(resolverPrincipal(deps)('segredo-da-sessao'))

    // AD-9: credencial nao vira log, nao vira erro, nao vira auditoria.
    expect(doLink.message).not.toContain('segredo-do-link')
    expect(daSessao.message).not.toContain('segredo-da-sessao')
  })
})

describe('solicitarLink (AC #3)', () => {
  it('nao cria nem envia link para e-mail fora do cadastro', async () => {
    await solicitarLink(deps)({ email: 'estranho@empresa.com' })

    expect(estado.linksCriados).toHaveLength(0)
    expect(estado.enviados).toHaveLength(0)
  })

  it('responde a mesma coisa para e-mail cadastrado e nao cadastrado', async () => {
    const cadastrado = await solicitarLink(deps)({ email: 'ana@empresa.com' })
    const estranho = await solicitarLink(deps)({ email: 'estranho@empresa.com' })

    expect(estranho).toEqual(cadastrado)
  })

  it('cria link valido por 15 minutos e envia o token cru ao dono do e-mail', async () => {
    await solicitarLink(deps)({ email: 'ana@empresa.com' })

    const link = estado.linksCriados[0]
    const envio = estado.enviados[0]
    expect(link).toBeDefined()
    expect(envio).toBeDefined()
    if (link === undefined || envio === undefined) return

    expect(link.expiraEm.getTime()).toBe(AGORA.getTime() + 15 * 60 * 1000)
    expect(envio.email).toBe('ana@empresa.com')
    expect(link.tokenHash).toBe(hashToken(envio.token))
  })

  it('persiste o hash, nunca o token', async () => {
    await solicitarLink(deps)({ email: 'ana@empresa.com' })

    const link = estado.linksCriados[0]
    const envio = estado.enviados[0]
    if (link === undefined || envio === undefined) throw new Error('link nao criado')

    expect(link.tokenHash).not.toBe(envio.token)
    expect(JSON.stringify(link)).not.toContain(envio.token)
  })

  it('normaliza o e-mail antes de procurar o cadastro', async () => {
    await solicitarLink(deps)({ email: '  ANA@Empresa.com ' })

    // Sem normalizacao, a mesma pessoa teria identidades diferentes conforme
    // como digitou — e o cadastro nao seria encontrado.
    expect(estado.linksCriados).toHaveLength(1)
    expect(estado.linksCriados[0]?.email).toBe('ana@empresa.com')
  })
})

describe('token de maquina do cliente MCP (Story 1.5)', () => {
  const valido = {
    identity: 'bot-triagem@empresa.com',
    papel: 'agente' as const,
    expiraEm: null,
    revogadoEm: null,
  }

  it('recusa token que nao existe', async () => {
    estado.tokenMcp = null

    const erro = await erroDe(resolverPrincipalDeTokenMcp(deps)('inventado'))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })

  it('recusa token revogado', async () => {
    estado.tokenMcp = { ...valido, revogadoEm: new Date(AGORA.getTime() - 1_000) }

    const erro = await erroDe(resolverPrincipalDeTokenMcp(deps)('revogado'))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })

  it('recusa token expirado', async () => {
    estado.tokenMcp = { ...valido, expiraEm: new Date(AGORA.getTime() - 1) }

    const erro = await erroDe(resolverPrincipalDeTokenMcp(deps)('velho'))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })

  it('recusa token vazio sem consultar o repositorio', async () => {
    const erro = await erroDe(resolverPrincipalDeTokenMcp(deps)(''))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
    expect(estado.hashesDeTokenMcp).toHaveLength(0)
  })

  it('revogado, expirado e inexistente devolvem erro identico', async () => {
    estado.tokenMcp = null
    const inexistente = await erroDe(resolverPrincipalDeTokenMcp(deps)('a'))

    estado.tokenMcp = { ...valido, revogadoEm: AGORA }
    const revogado = await erroDe(resolverPrincipalDeTokenMcp(deps)('b'))

    estado.tokenMcp = { ...valido, expiraEm: new Date(AGORA.getTime() - 1) }
    const expirado = await erroDe(resolverPrincipalDeTokenMcp(deps)('c'))

    const forma = (e: Error) => ({
      name: e.name,
      code: ehDomainError(e) ? e.code : undefined,
      message: e.message,
    })

    expect(forma(revogado)).toEqual(forma(inexistente))
    expect(forma(expirado)).toEqual(forma(inexistente))
  })

  it('busca pelo HASH, nunca pelo token cru', async () => {
    estado.tokenMcp = null

    await erroDe(resolverPrincipalDeTokenMcp(deps)('token-do-bot'))

    expect(estado.hashesDeTokenMcp).toEqual([hashToken('token-do-bot')])
  })

  it('token sem prazo (expira_em nulo) continua valendo', async () => {
    estado.tokenMcp = valido

    const principal = await resolverPrincipalDeTokenMcp(deps)('bom')

    expect(principal).toEqual({ identity: 'bot-triagem@empresa.com', role: 'agente' })
  })

  it('o papel do bot vem do cadastro, como o de qualquer um', async () => {
    estado.tokenMcp = { ...valido, papel: 'solicitante' }

    const principal = await resolverPrincipalDeTokenMcp(deps)('bom')

    // O bot e uma linha de `users` com papel. Toda a autorizacao da Story 1.4
    // vale para ele sem codigo novo — inclusive para rebaixa-lo.
    expect(principal.role).toBe('solicitante')
  })
})

describe('caminho positivo (AC #1, #2)', () => {
  it('troca link valido por sessao de 8 horas', async () => {
    estado.linkAoConsumir = {
      email: 'ana@empresa.com',
      expiraEm: new Date(AGORA.getTime() + 60_000),
    }

    const saida = await autenticarComLink(deps)({ token: 'token-bom' })

    const sessao = estado.sessoesCriadas[0]
    expect(sessao).toBeDefined()
    if (sessao === undefined) return

    expect(sessao.expiraEm.getTime()).toBe(AGORA.getTime() + 8 * 60 * 60 * 1000)
    expect(sessao.tokenHash).toBe(hashToken(saida.tokenDeSessao))
    expect(saida.identity).toBe('ana@empresa.com')
    expect(saida.expiraEm).toBe(sessao.expiraEm.toISOString())
  })

  it('o papel vem do cadastro, nao da entrada', async () => {
    estado.usuarios = [{ email: 'joao@empresa.com', papel: 'solicitante' }]
    estado.linkAoConsumir = {
      email: 'joao@empresa.com',
      expiraEm: new Date(AGORA.getTime() + 60_000),
    }

    const saida = await autenticarComLink(deps)({ token: 'token-do-joao' })

    // Nao ha entrada de papel no contrato — a garantia e estrutural. Este
    // teste trava a estrutura: se alguem aceitar papel do cliente, ele quebra.
    expect(saida.role).toBe('solicitante')
  })

  it('a sessao guarda o hash, nao o token devolvido', async () => {
    estado.linkAoConsumir = {
      email: 'ana@empresa.com',
      expiraEm: new Date(AGORA.getTime() + 60_000),
    }

    const saida = await autenticarComLink(deps)({ token: 'token-bom' })

    expect(JSON.stringify(estado.sessoesCriadas)).not.toContain(saida.tokenDeSessao)
  })

  it('resolve principal de sessao valida com o papel ATUAL do cadastro', async () => {
    estado.sessaoEncontrada = {
      email: 'ana@empresa.com',
      papel: 'solicitante',
      expiraEm: new Date(AGORA.getTime() + 1),
    }

    const principal = await resolverPrincipal(deps)('sessao-viva')

    expect(principal).toEqual({ identity: 'ana@empresa.com', role: 'solicitante' })
    expect(estado.hashesBuscados).toEqual([hashToken('sessao-viva')])
  })
})
