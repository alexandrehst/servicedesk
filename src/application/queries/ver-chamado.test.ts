import { expect, it, vi } from 'vitest'
import { type DomainError, ehDomainError } from '../../domain/errors.js'
import type { Ticket } from '../../domain/ticket.js'
import { type Comentario, embrulharBruto } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { verChamado } from './ver-chamado.js'

const agente: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

const ticket: Ticket = {
  number: 1000,
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
  status: 'aberto',
  prioridade: 'media',
  requester: 'marina@empresa.com',
  assignee: null,
  criadoEm: new Date('2026-08-10T12:00:00.000Z'),
  excluidoEm: null,
  version: 1,
}

const thread: readonly Comentario[] = [
  {
    autor: 'marina@empresa.com',
    corpo: 'Parou hoje.',
    internal: false,
    criadoEm: new Date('2026-08-10T12:05:00.000Z'),
    excluidoEm: null,
  },
  {
    autor: 'bruno@empresa.com',
    corpo: 'Fonte queimada.',
    internal: true,
    criadoEm: new Date('2026-08-10T12:10:00.000Z'),
    excluidoEm: null,
  },
]

/**
 * `.catch((e) => e)` devolveria a UNIAO entre o erro e a saida de sucesso, e o
 * tipo nao teria `message`. Alem disso, um dia em que a leitura parasse de
 * lancar, o teste compararia dois `undefined` e passaria. Aqui a ausencia de
 * erro e uma falha explicita.
 */
const erroDe = async (promessa: Promise<unknown>): Promise<DomainError> => {
  const resultado: unknown = await promessa.then(
    () => null,
    (e: unknown) => e,
  )
  if (!ehDomainError(resultado)) {
    throw new Error(`Esperava um DomainError; veio: ${String(resultado)}`)
  }
  return resultado
}

const repo = (
  achado: { ticket: Ticket; comentarios: readonly Comentario[] } | null,
): TicketRepository => ({
  async criarComAuditoria() {
    throw new Error('nao deveria escrever numa leitura')
  },
  async buscarPorNumero() {
    // Story 1.4: o port devolve dado EMBRULHADO. Um duble que devolva o
    // objeto cru nao compila mais — e essa e a garantia: nenhum caminho
    // entrega Chamado sem passar pela autorizacao do dominio.
    return achado === null ? null : embrulharBruto(achado)
  },
  async excluirComAuditoria() {
    throw new Error('esta suite nao exclui')
  },
  async criarComentarioComAuditoria() {
    throw new Error('esta suite nao comenta')
  },
  async mudarStatusComAuditoria() {
    throw new Error('esta suite nao muda Status')
  },
  async atribuirComAuditoria() {
    throw new Error('esta suite nao atribui')
  },
  async mudarPrioridadeComAuditoria() {
    throw new Error('esta suite nao muda Prioridade')
  },
  async buscarIntakePorMessageId() {
    throw new Error('esta suite nao faz intake por e-mail')
  },
  async executarAcaoIrreversivelComAuditoria() {
    throw new Error('esta suite nao executa Acao irreversivel')
  },
  async buscarParecidosBruto() {
    throw new Error('esta suite nao sugere parecidos')
  },
  async buscarResumoBruto() {
    throw new Error('esta suite nao le o resumo')
  },
  async buscarFilaBruta() {
    throw new Error('esta suite nao le a Fila')
  },
  async buscarHistoricoBruto() {
    throw new Error('esta suite nao le historico')
  },
})

/**
 * AC #4 — a autorizacao e garantia do compilador, nao disciplina de quem
 * escreve o caso de uso.
 *
 * Este teste vale pelo `@ts-expect-error`: se algum dia o conteudo bruto virar
 * alcancavel de fora do dominio, o erro esperado deixa de acontecer e o
 * `tsc --noEmit` reprova com "unused '@ts-expect-error' directive". O gate
 * `typecheck` cobre isso, entao a garantia nao depende de ninguem reparar.
 */
it('nao existe caminho para abrir o dado bruto fora do dominio', () => {
  const bruto = embrulharBruto({ ticket, comentarios: thread })

  // @ts-expect-error o simbolo que guarda o conteudo nao e exportado
  const vazamento = bruto.conteudo

  expect(vazamento).toBeUndefined()
})

it('retorna os campos do Chamado e a thread', async () => {
  const saida = await verChamado({ repositorio: repo({ ticket, comentarios: thread }) })(
    { numero: 1000 },
    agente,
  )
  expect(saida.number).toBe(1000)
  expect(saida.titulo).toBe('Notebook nao liga')
  expect(saida.comentarios).toHaveLength(2)
})

it('converte datas para ISO 8601 UTC', async () => {
  const saida = await verChamado({ repositorio: repo({ ticket, comentarios: thread }) })(
    { numero: 1000 },
    agente,
  )
  expect(saida.criadoEm).toBe('2026-08-10T12:00:00.000Z')
  expect(saida.comentarios[0]?.criadoEm).toBe('2026-08-10T12:05:00.000Z')
})

it('Solicitante nao recebe Comentario Interno', async () => {
  const saida = await verChamado({ repositorio: repo({ ticket, comentarios: thread }) })(
    { numero: 1000 },
    marina,
  )
  expect(saida.comentarios).toHaveLength(1)
  expect(saida.comentarios[0]?.corpo).toBe('Parou hoje.')
})

/**
 * O teste central da story: as duas mensagens precisam ser IDENTICAS. Checar
 * cada caso isoladamente passaria mesmo com mensagens diferentes — e a
 * diferenca e exatamente o vazamento.
 */
it('inexistente e alheio produzem erro identico', async () => {
  const inexistente = await erroDe(
    verChamado({ repositorio: repo(null) })({ numero: 9999 }, carlos),
  )
  const alheio = await erroDe(
    verChamado({ repositorio: repo({ ticket, comentarios: thread }) })({ numero: 9999 }, carlos),
  )

  expect(alheio.message).toBe(inexistente.message)
  expect(alheio.code).toBe(inexistente.code)
  expect(alheio.constructor).toBe(inexistente.constructor)
})

it('nao chama o caminho de escrita do repositorio (FR-13)', async () => {
  const repositorio = repo({ ticket, comentarios: thread })
  const escrita = vi.spyOn(repositorio, 'criarComAuditoria')
  await verChamado({ repositorio })({ numero: 1000 }, agente)
  expect(escrita).not.toHaveBeenCalled()
})
