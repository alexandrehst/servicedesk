import { expect, it } from 'vitest'
import type { Principal } from '../../application/contracts/principal.js'
import type { TicketRepository } from '../../application/ports/ticket-repository.js'
import { DomainError } from '../../domain/errors.js'
import type { Ticket } from '../../domain/ticket.js'
import { type Comentario, embrulharBruto } from '../../domain/visibilidade.js'
import { criarHandlerAbrirChamado, criarHandlerVerChamado, criarServidorMcp } from './server.js'

const registradas: Principal[] = []

const repositorio: TicketRepository = {
  async criarComAuditoria(novo, autor): Promise<Ticket> {
    registradas.push(autor)
    return { ...novo, number: 1042, criadoEm: new Date('2026-08-10T12:00:00Z') }
  },
  async buscarPorNumero() {
    return null
  },
}

const principal = { identity: 'bruno@empresa.com', role: 'agente' } as const

/**
 * Story 1.3: o adapter nao recebe mais um principal de configuracao — recebe
 * como RESOLVE-LO. O duble abaixo faz o papel de `resolverPrincipal` sobre uma
 * sessao valida.
 */
const autenticar = async () => principal
const deps = { repositorio, autenticar }

const input = { titulo: 'VPN fora do ar', descricao: 'Nao conecta.', categoria: 'rede' } as const

it('registra a tool abrir_chamado com o schema do contrato (AD-6)', () => {
  const schema = criarServidorMcp(deps).toolInputSchemaJson('abrir_chamado')
  expect(schema).toBeDefined()
  expect(JSON.stringify(schema)).toContain('categoria')
  expect(JSON.stringify(schema)).toContain('hardware')
})

it('nao registra tool que a story nao especifica', () => {
  expect(criarServidorMcp(deps).toolInputSchemaJson('fechar_chamado')).toBeUndefined()
})

it('retorna o Numero do Chamado aberto', async () => {
  const resultado = await criarHandlerAbrirChamado(deps)(input)
  expect(resultado.structuredContent).toEqual({ number: 1042, status: 'aberto' })
  expect(resultado.content[0]?.text).toContain('#1042')
})

it('carimba origin mcp no principal (AD-9)', async () => {
  registradas.length = 0
  await criarHandlerAbrirChamado(deps)(input)
  expect(registradas[0]?.origin).toBe('mcp')
  expect(registradas[0]?.identity).toBe('bruno@empresa.com')
})

it('traduz erro de dominio em erro de tool, sem mascarar o codigo', async () => {
  const resultado = await criarHandlerAbrirChamado(deps)({ ...input, titulo: '   ' })
  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('TituloObrigatorio')
})

it('deixa erro nao-tipado subir, em vez de engolir (pilar Observavel)', async () => {
  const quebrado: TicketRepository = {
    async criarComAuditoria() {
      throw new Error('conexao perdida')
    },
    async buscarPorNumero() {
      return null
    },
  }
  await expect(
    criarHandlerAbrirChamado({ repositorio: quebrado, autenticar })(input),
  ).rejects.toThrowError('conexao perdida')
})

// --- Story 1.2: tool de leitura ---

const chamado: Ticket = {
  number: 1042,
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
  status: 'aberto',
  requester: 'marina@empresa.com',
  assignee: null,
  criadoEm: new Date('2026-08-10T12:00:00Z'),
}

const thread: readonly Comentario[] = [
  {
    autor: 'marina@empresa.com',
    corpo: 'Parou hoje.',
    internal: false,
    criadoEm: new Date('2026-08-10T12:05:00Z'),
  },
]

const repoLeitura: TicketRepository = {
  async criarComAuditoria(): Promise<Ticket> {
    throw new Error('a tool de leitura nao deve escrever')
  },
  async buscarPorNumero(numero) {
    return numero === chamado.number
      ? embrulharBruto({ ticket: chamado, comentarios: thread })
      : null
  },
}

const depsLeitura = { repositorio: repoLeitura, autenticar }

it('registra a tool ver_chamado com o schema do contrato (AD-6)', () => {
  const schema = criarServidorMcp(deps).toolInputSchemaJson('ver_chamado')
  expect(schema).toBeDefined()
  expect(JSON.stringify(schema)).toContain('numero')
})

it('retorna o Chamado com a thread no structuredContent', async () => {
  const resultado = await criarHandlerVerChamado(depsLeitura)({ numero: 1042 })

  expect(resultado.isError).toBeUndefined()
  expect(resultado.structuredContent).toMatchObject({
    number: 1042,
    titulo: 'Notebook nao liga',
    criadoEm: '2026-08-10T12:00:00.000Z',
  })
  expect(resultado.content[0]?.text).toContain('#1042')
})

/**
 * Mesmo shape de erro da Story 1.1: `[code] mensagem` com `isError`. Se cada
 * tool inventasse o proprio formato, a IA teria que aprender um por tool.
 */
it('traduz Chamado inexistente em erro de tool com o mesmo shape da 1.1', async () => {
  const resultado = await criarHandlerVerChamado(depsLeitura)({ numero: 9999 })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('TicketNaoEncontrado')
  expect(resultado.structuredContent).toBeUndefined()
})

/**
 * `origin` NAO e observavel numa leitura — nao ha auditoria para inspecionar
 * (FR-13). O que da para provar aqui e que a IDENTIDADE do principal chega ao
 * dominio, e a prova e o comportamento: a mesma consulta muda de resultado
 * conforme quem pergunta. Se o adapter usasse uma identidade fixa, os dois
 * casos abaixo dariam a mesma coisa.
 */
it('entrega ao dominio a identidade de quem pergunta, nao uma fixa', async () => {
  const comoDona = await criarHandlerVerChamado({
    repositorio: repoLeitura,
    autenticar: async () => ({ identity: 'marina@empresa.com', role: 'solicitante' }) as const,
  })({ numero: 1042 })

  const comoTerceiro = await criarHandlerVerChamado({
    repositorio: repoLeitura,
    autenticar: async () => ({ identity: 'carlos@empresa.com', role: 'solicitante' }) as const,
  })({ numero: 1042 })

  expect(comoDona.isError).toBeUndefined()
  expect(comoTerceiro.isError).toBe(true)
  expect(comoTerceiro.content[0]?.text).toContain('TicketNaoEncontrado')
})

// --- Story 1.3: o principal passa a vir da autenticacao ---

const credencialRuim = async (): Promise<{ identity: string; role: 'agente' }> => {
  throw new DomainError('CredencialInvalida', 'Credencial invalida.')
}

it('recusa a escrita quando a credencial nao resolve, sem tocar no repositorio', async () => {
  registradas.length = 0

  const resultado = await criarHandlerAbrirChamado({ repositorio, autenticar: credencialRuim })(
    input,
  )

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('CredencialInvalida')
  // Credencial ruim tem que parar ANTES do caso de uso: um Chamado criado com
  // autor indefinido violaria o AD-3 e ainda ficaria no banco.
  expect(registradas).toHaveLength(0)
})

it('recusa a leitura quando a credencial nao resolve', async () => {
  const resultado = await criarHandlerVerChamado({
    repositorio: repoLeitura,
    autenticar: credencialRuim,
  })({ numero: 1042 })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('CredencialInvalida')
  expect(resultado.structuredContent).toBeUndefined()
})

it('resolve a credencial a CADA chamada, nao uma vez na montagem', async () => {
  let chamadas = 0
  const expiraNaSegunda = async () => {
    chamadas += 1
    if (chamadas > 1) {
      throw new DomainError('CredencialInvalida', 'Credencial invalida.')
    }
    return principal
  }

  const handler = criarHandlerVerChamado({ repositorio: repoLeitura, autenticar: expiraNaSegunda })

  const primeira = await handler({ numero: 1042 })
  const segunda = await handler({ numero: 1042 })

  // Resolver uma vez so deixaria a sessao valer para sempre depois de aberta:
  // expiracao de 8 horas nao teria efeito nenhum sobre uma conexao MCP longa.
  expect(primeira.isError).toBeUndefined()
  expect(segunda.isError).toBe(true)
})

it('deixa erro nao-tipado da leitura subir (pilar Observavel)', async () => {
  const quebrado: TicketRepository = {
    async criarComAuditoria(): Promise<Ticket> {
      throw new Error('nao usado')
    },
    async buscarPorNumero() {
      throw new Error('conexao perdida')
    },
  }
  await expect(
    criarHandlerVerChamado({ repositorio: quebrado, autenticar })({ numero: 1042 }),
  ).rejects.toThrowError('conexao perdida')
})
