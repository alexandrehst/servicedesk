import { expect, it } from 'vitest'
import type { Principal } from '../../application/contracts/principal.js'
import type { TicketRepository } from '../../application/ports/ticket-repository.js'
import type { Ticket } from '../../domain/ticket.js'
import { criarHandlerAbrirChamado, criarServidorMcp } from './server.js'

const registradas: Principal[] = []

const repositorio: TicketRepository = {
  async criarComAuditoria(novo, autor): Promise<Ticket> {
    registradas.push(autor)
    return { ...novo, number: 1042, criadoEm: new Date('2026-08-10T12:00:00Z') }
  },
}

const principal = { identity: 'bruno@empresa.com', role: 'agente' } as const
const deps = { repositorio, principal }

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
  }
  await expect(
    criarHandlerAbrirChamado({ repositorio: quebrado, principal })(input),
  ).rejects.toThrowError('conexao perdida')
})
