import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { users } from '../../../drizzle/schema.js'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { mudarStatus } from '../../application/commands/mudar-status.js'
import type { Principal } from '../../application/contracts/principal.js'
import type { Logger } from '../../application/ports/logger.js'
import type {
  ChamadoResolvido,
  NotificadorDeChamado,
} from '../../application/ports/notificador-de-chamado.js'
import { verHistorico } from '../../application/queries/ver-historico.js'
import { criarLinkDeAcesso } from '../../platform/acesso/link-de-acesso.js'
import { criarLogger } from '../../platform/logging/logger.js'
import { urlDoChamado } from '../email/smtp.js'
import { criarTicketAccessRepository } from './ticket-access-repository.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Story 2.5 — a re-resolucao contra o Postgres REAL.
 *
 * O ciclo `em_andamento -> resolvido -> em_andamento -> resolvido` so prova o
 * que precisa provar com a `version` andando de verdade: com duble, "dois
 * e-mails" e apenas o que o duble foi programado para deixar acontecer.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)
const acessos = criarTicketAccessRepository(db)

const ABERTO_EM = new Date('2026-08-18T09:00:00.000Z')
const RESOLVIDO_EM = new Date('2026-08-18T12:30:00.000Z')

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

let enviados: ChamadoResolvido[]
let logado: string[]

const notificador: NotificadorDeChamado = {
  async enviarChamadoAberto() {
    // Esta suite abre o Chamado sem canal de notificacao; se este metodo for
    // chamado, o teste montou o caso errado.
    throw new Error('esta suite nao notifica abertura')
  },
  async enviarChamadoResolvido(m) {
    enviados.push(m)
  },
}

const logger: Logger = criarLogger((linha) => logado.push(linha))

const canal = (quem: NotificadorDeChamado) => ({
  notificador: quem,
  criarLink: criarLinkDeAcesso({ repositorio: acessos, agora: () => ABERTO_EM }),
  montarUrl: (numero: number, token: string) =>
    urlDoChamado('https://desk.empresa.com', numero, token),
  logger,
  agora: () => RESOLVIDO_EM,
})

/**
 * Abre o Chamado e FIXA a data de abertura no banco.
 *
 * O `criadoEm` vem do `defaultNow()` do Postgres, entao sem isto o "tempo
 * total" seria o relogio da maquina de CI — e o teste mediria o horario em que
 * a suite rodou. Fixando a coluna e lendo pelo command, o que se prova e o que
 * importa: a duracao sai do banco, e nao de um literal (licao do `assignee` na
 * 2.3).
 */
const abrir = async () => {
  const chamado = await abrirChamado({ repositorio })(
    { titulo: 'Notebook nao liga', descricao: 'Sem resposta ao botao.', categoria: 'hardware' },
    marina,
  )

  await db.execute(
    sql`UPDATE tickets SET criado_em = ${ABERTO_EM.toISOString()} WHERE number = ${chamado.number}`,
  )

  return chamado
}

const mudar = (quem: NotificadorDeChamado = notificador) =>
  mudarStatus({ repositorio, notificacao: canal(quem) })

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE tickets, audit_entries, comments, ticket_access_links, users RESTART IDENTITY`,
  )
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
  await db.insert(users).values({ email: 'marina@empresa.com', papel: 'solicitante' })
  enviados = []
  logado = []
})

afterAll(async () => {
  await sqlClient.end()
})

describe('resolver, com o e-mail que sai depois (AC #1)', () => {
  it('o Status fica resolvido e o Solicitante e avisado uma vez', async () => {
    const { number } = await abrir()
    const emAndamento = await mudar()(
      { numero: number, novoStatus: 'em_andamento', versao: 1 },
      bruno,
    )

    const resolvido = await mudar()(
      { numero: number, novoStatus: 'resolvido', versao: emAndamento.versao },
      bruno,
    )

    expect(resolvido.para).toBe('resolvido')
    expect(enviados).toHaveLength(1)
    expect(enviados[0]?.destinatario).toBe('marina@empresa.com')
    expect(enviados[0]?.resolvidoPor).toBe('bruno@empresa.com')
    // Aberto as 09:00, resolvido as 12:30 — arredondado para baixo.
    expect(enviados[0]?.duracao).toBe('3 horas')
  })

  /**
   * O link do e-mail e o mesmo mecanismo da 1.6: escopo de UM Chamado, e ele
   * precisa existir de verdade na tabela — um link decorativo nao "da acesso"
   * coisa nenhuma.
   */
  it('emite um link de acesso de verdade para aquele Chamado', async () => {
    const { number } = await abrir()
    const emAndamento = await mudar()(
      { numero: number, novoStatus: 'em_andamento', versao: 1 },
      bruno,
    )
    await mudar()({ numero: number, novoStatus: 'resolvido', versao: emAndamento.versao }, bruno)

    const links = await db.execute(sql`SELECT ticket_number, email FROM ticket_access_links`)

    expect(links).toHaveLength(1)
    expect(links[0]?.ticket_number).toBe(number)
    expect(links[0]?.email).toBe('marina@empresa.com')
    expect(enviados[0]?.link).toContain(`/chamados/${number}?acesso=`)
  })
})

describe('a re-resolucao re-notifica (AC #2)', () => {
  /**
   * Nada guarda "ja avisei". Um Chamado que voltou ao atendimento e foi
   * resolvido de novo e um evento novo para quem abriu — e a `version` do meio
   * do caminho prova que as duas resolucoes sao escritas distintas.
   */
  it('resolver, devolver ao atendimento e resolver de novo manda DOIS e-mails', async () => {
    const { number } = await abrir()

    const emAndamento = await mudar()(
      { numero: number, novoStatus: 'em_andamento', versao: 1 },
      bruno,
    )
    const primeira = await mudar()(
      { numero: number, novoStatus: 'resolvido', versao: emAndamento.versao },
      bruno,
    )
    const devolvido = await mudar()(
      { numero: number, novoStatus: 'em_andamento', versao: primeira.versao },
      bruno,
    )
    const segunda = await mudar()(
      { numero: number, novoStatus: 'resolvido', versao: devolvido.versao },
      bruno,
    )

    expect(enviados).toHaveLength(2)
    expect(segunda.versao).toBeGreaterThan(primeira.versao)

    // E o Log registra as duas resolucoes, com o par de/para (2.2).
    const historico = await verHistorico({ repositorio })({ numero: number }, bruno)
    const resolucoes = historico.entradas.filter((e) => e.para === 'resolvido')
    expect(resolucoes).toHaveLength(2)
    expect(resolucoes.every((e) => e.acao === 'mudar_status' && e.de === 'em_andamento')).toBe(true)
  })

  it('a volta ao atendimento NAO manda e-mail (AC #3)', async () => {
    const { number } = await abrir()
    const emAndamento = await mudar()(
      { numero: number, novoStatus: 'em_andamento', versao: 1 },
      bruno,
    )
    const resolvido = await mudar()(
      { numero: number, novoStatus: 'resolvido', versao: emAndamento.versao },
      bruno,
    )

    await mudar()({ numero: number, novoStatus: 'em_andamento', versao: resolvido.versao }, bruno)

    expect(enviados).toHaveLength(1)
  })
})

describe('escrita que nao aconteceu nao notifica (AC #4)', () => {
  /**
   * Dois Agentes resolvendo o mesmo Chamado com a MESMA versao lida: um vence
   * e um bate no `Conflict` do AD-10. So pode sair UM e-mail — avisar o
   * Solicitante de uma resolucao que perdeu a corrida seria mentira.
   */
  it('a resolucao que perde o conflito nao manda e-mail', async () => {
    const { number } = await abrir()
    const emAndamento = await mudar()(
      { numero: number, novoStatus: 'em_andamento', versao: 1 },
      bruno,
    )
    const versaoLida = emAndamento.versao

    const [a, b] = await Promise.allSettled([
      mudar()({ numero: number, novoStatus: 'resolvido', versao: versaoLida }, bruno),
      mudar()({ numero: number, novoStatus: 'resolvido', versao: versaoLida }, bruno),
    ])

    // A INVARIANTE, e nao o codigo do erro: quem perde recebe `Conflict` ou
    // `TransicaoInvalida` conforme o instante da leitura (licao da 2.2).
    const vencedores = [a, b].filter((r) => r.status === 'fulfilled')
    expect(vencedores).toHaveLength(1)
    expect(enviados).toHaveLength(1)
  })

  it('Chamado excluido no meio do caminho nao manda e-mail', async () => {
    const { number } = await abrir()
    const emAndamento = await mudar()(
      { numero: number, novoStatus: 'em_andamento', versao: 1 },
      bruno,
    )
    await repositorio.excluirComAuditoria(number, bruno)

    await expect(
      mudar()({ numero: number, novoStatus: 'resolvido', versao: emAndamento.versao }, bruno),
    ).rejects.toThrow()
    expect(enviados).toHaveLength(0)
  })
})

describe('SMTP fora do ar (AC #5)', () => {
  const quebrado: NotificadorDeChamado = {
    async enviarChamadoAberto() {
      throw new Error('esta suite nao notifica abertura')
    },
    async enviarChamadoResolvido() {
      throw new Error('SMTP recusou a conexao')
    },
  }

  it('a resolucao PERMANECE no banco, e a falha vira registro', async () => {
    const { number } = await abrir()
    const emAndamento = await mudar()(
      { numero: number, novoStatus: 'em_andamento', versao: 1 },
      bruno,
    )

    await mudar(quebrado)(
      { numero: number, novoStatus: 'resolvido', versao: emAndamento.versao },
      bruno,
    )

    const [linha] = await db.execute(sql`SELECT status FROM tickets WHERE number = ${number}`)
    expect(linha?.status).toBe('resolvido')

    const registro = JSON.parse(logado[0] ?? '{}') as Record<string, unknown>
    expect(registro.evento).toBe('falha_ao_notificar_resolucao')
    expect(registro.causa).toBe('SMTP recusou a conexao')
    // AD-9: o link ja tinha sido emitido quando o envio falhou, e o log nao
    // pode carrega-lo.
    expect(logado[0]).not.toContain('acesso=')
  })
})
