import { beforeEach, describe, expect, it } from 'vitest'
import type {
  LinkDeAcesso,
  TicketAccessRepository,
} from '../../application/ports/ticket-access-repository.js'
import { ehDomainError } from '../../domain/errors.js'
import { hashToken } from '../auth/token.js'
import {
  criarLinkDeAcesso,
  resolverAcessoAoChamado,
  VALIDADE_DO_LINK_MS,
} from './link-de-acesso.js'

const AGORA = new Date('2026-08-10T12:00:00.000Z')

let criados: { ticketNumber: number; email: string; tokenHash: string; expiraEm: Date }[]
let encontrado: LinkDeAcesso | null
let hashesBuscados: string[]

const repositorio: TicketAccessRepository = {
  async criarLinkDeAcesso(entrada) {
    criados.push({ ...entrada })
  },
  async buscarLinkDeAcessoPorHash(tokenHash) {
    hashesBuscados.push(tokenHash)
    return encontrado
  },
}

const deps = { repositorio, agora: () => AGORA }

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
  encontrado = null
  hashesBuscados = []
})

describe('resolverAcessoAoChamado — caminhos negativos (AC #5)', () => {
  it('recusa token inexistente', async () => {
    encontrado = null

    const erro = await erroDe(resolverAcessoAoChamado(deps)('inventado'))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })

  it('recusa token expirado', async () => {
    encontrado = {
      ticketNumber: 1042,
      email: 'marina@empresa.com',
      expiraEm: new Date(AGORA.getTime() - 1),
    }

    const erro = await erroDe(resolverAcessoAoChamado(deps)('velho'))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
  })

  it('recusa token vazio sem consultar o repositorio', async () => {
    const erro = await erroDe(resolverAcessoAoChamado(deps)(''))

    expect(ehDomainError(erro) && erro.code).toBe('CredencialInvalida')
    expect(hashesBuscados).toHaveLength(0)
  })

  it('inexistente e expirado devolvem erro identico', async () => {
    encontrado = null
    const inexistente = await erroDe(resolverAcessoAoChamado(deps)('a'))

    encontrado = {
      ticketNumber: 1042,
      email: 'marina@empresa.com',
      expiraEm: new Date(AGORA.getTime() - 1),
    }
    const expirado = await erroDe(resolverAcessoAoChamado(deps)('b'))

    const forma = (e: Error) => ({
      name: e.name,
      code: ehDomainError(e) ? e.code : undefined,
      message: e.message,
    })

    expect(forma(expirado)).toEqual(forma(inexistente))
  })

  it('busca pelo HASH, nunca pelo token cru', async () => {
    encontrado = null

    await erroDe(resolverAcessoAoChamado(deps)('token-do-email'))

    expect(hashesBuscados).toEqual([hashToken('token-do-email')])
  })
})

describe('criarLinkDeAcesso (AC #2, #6)', () => {
  it('vale por 7 dias', async () => {
    await criarLinkDeAcesso(deps)({ ticketNumber: 1042, email: 'marina@empresa.com' })

    expect(criados[0]?.expiraEm.getTime()).toBe(AGORA.getTime() + 7 * 24 * 60 * 60 * 1000)
  })

  it('a constante de validade e 7 dias', () => {
    // O prazo e decisao registrada (2026-08-10). Mudar sem revisita-la reprova.
    expect(VALIDADE_DO_LINK_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('persiste o hash e devolve o token cru para quem monta o e-mail', async () => {
    const token = await criarLinkDeAcesso(deps)({
      ticketNumber: 1042,
      email: 'marina@empresa.com',
    })

    expect(criados[0]?.tokenHash).toBe(hashToken(token))
    expect(criados[0]?.tokenHash).not.toBe(token)
    expect(JSON.stringify(criados)).not.toContain(token)
  })

  it('cada Chamado ganha um token diferente', async () => {
    const um = await criarLinkDeAcesso(deps)({ ticketNumber: 1, email: 'a@empresa.com' })
    const outro = await criarLinkDeAcesso(deps)({ ticketNumber: 2, email: 'a@empresa.com' })

    expect(um).not.toBe(outro)
  })
})

describe('escopo do link (AC #2)', () => {
  it('resolve exatamente o Chamado para o qual foi emitido', async () => {
    encontrado = {
      ticketNumber: 1042,
      email: 'marina@empresa.com',
      expiraEm: new Date(AGORA.getTime() + 1),
    }

    const acesso = await resolverAcessoAoChamado(deps)('bom')

    // Escopo minimo: um e-mail encaminhado por engano expoe UM Chamado, nao a
    // caixa inteira do Solicitante.
    expect(acesso).toEqual({ ticketNumber: 1042, email: 'marina@empresa.com' })
  })

  it('continua valendo depois de usado — o link e reutilizavel', async () => {
    encontrado = {
      ticketNumber: 1042,
      email: 'marina@empresa.com',
      expiraEm: new Date(AGORA.getTime() + 1),
    }

    const primeira = await resolverAcessoAoChamado(deps)('bom')
    const segunda = await resolverAcessoAoChamado(deps)('bom')

    // Ao contrario do link de login (uso unico): quem recebe e-mail de abertura
    // clica, fecha a aba e volta depois. Uso unico aqui seria hostil.
    expect(segunda).toEqual(primeira)
  })
})
