import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { tickets, users } from '../../../drizzle/schema.js'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { atribuirChamado } from '../../application/commands/atribuir-chamado.js'
import type { Principal } from '../../application/contracts/principal.js'
import { verChamado } from '../../application/queries/ver-chamado.js'
import { verHistorico } from '../../application/queries/ver-historico.js'
import { ehDomainError } from '../../domain/errors.js'
import { criarIdentityRepository } from './identity-repository.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Integracao com Postgres REAL. Duas coisas so aparecem aqui: que o `assignee`
 * e LIDO do banco (ele era hardcoded como `null` desde a Story 1.1), e o
 * conflito de versao, que duble nao prova.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 4 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)
const identidades = criarIdentityRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const abrir = () =>
  abrirChamado({ repositorio })(
    { titulo: 'Notebook nao liga', descricao: 'Sem resposta ao botao.', categoria: 'hardware' },
    marina,
  )

const atribuir = atribuirChamado({ repositorio, identidades })
const ler = (numero: number) => verChamado({ repositorio })({ numero }, bruno)

const erroDe = async (promessa: Promise<unknown>): Promise<Error> => {
  try {
    await promessa
  } catch (erro) {
    if (ehDomainError(erro)) return erro
    throw erro
  }
  throw new Error('Esperava erro de dominio, mas a operacao passou.')
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments, users RESTART IDENTITY`)
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
  await db.insert(users).values([
    { email: 'bruno@empresa.com', papel: 'agente' },
    { email: 'ana@empresa.com', papel: 'agente' },
    { email: 'marina@empresa.com', papel: 'solicitante' },
  ])
})

afterAll(async () => {
  await sqlClient.end()
})

describe('a divida do assignee (AC #5)', () => {
  /**
   * A coluna existe desde a Story 1.1, mas o adapter devolvia `assignee: null`
   * FIXO nos tres pontos de leitura. Ninguem notou porque nenhum Chamado tinha
   * Dono — a partir desta story, viraria bug visivel.
   *
   * Este teste escreve direto no banco, sem passar pelo command: se o adapter
   * voltar a hardcodar, ele reprova. Um teste que so olhasse o retorno do
   * command passaria com o literal no lugar.
   */
  it('a leitura devolve o Dono que esta no banco', async () => {
    const { number } = await abrir()
    await db.update(tickets).set({ assignee: 'ana@empresa.com' }).where(eq(tickets.number, number))

    expect((await ler(number)).assignee).toBe('ana@empresa.com')
  })

  it('Chamado sem Dono continua devolvendo null', async () => {
    const { number } = await abrir()

    expect((await ler(number)).assignee).toBeNull()
  })
})

describe('atribuir de verdade (AC #1)', () => {
  it('define o Dono e incrementa a versao', async () => {
    const { number } = await abrir()

    const saida = await atribuir({ numero: number, versao: 1, agente: 'ana@empresa.com' }, bruno)

    expect(saida).toMatchObject({ numero: number, de: null, para: 'ana@empresa.com', versao: 2 })
    expect((await ler(number)).assignee).toBe('ana@empresa.com')
  })

  /** Omitir `agente` e self-assign — o campo ausente ja diz "para mim". */
  it('sem o campo agente, o Dono e quem chamou', async () => {
    const { number } = await abrir()

    const saida = await atribuir({ numero: number, versao: 1 }, bruno)

    expect(saida.para).toBe('bruno@empresa.com')
    expect((await ler(number)).assignee).toBe('bruno@empresa.com')
  })

  it('reatribuir troca o Dono', async () => {
    const { number } = await abrir()
    await atribuir({ numero: number, versao: 1, agente: 'ana@empresa.com' }, bruno)

    const saida = await atribuir({ numero: number, versao: 2, agente: 'bruno@empresa.com' }, bruno)

    expect(saida).toMatchObject({ de: 'ana@empresa.com', para: 'bruno@empresa.com' })
  })
})

describe('o destinatario precisa atender (AC #2)', () => {
  /**
   * Atribuir a um Solicitante produz um Chamado que PARECE ter Dono e nao tem:
   * a fila o mostraria como atendido, e ninguem estaria atendendo.
   */
  it('nao atribui a um Solicitante', async () => {
    const { number } = await abrir()

    const erro = await erroDe(
      atribuir({ numero: number, versao: 1, agente: 'marina@empresa.com' }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('AtribuicaoInvalida')
    expect((await ler(number)).assignee).toBeNull()
  })

  it('nao atribui a quem nao esta no cadastro', async () => {
    const { number } = await abrir()

    const erro = await erroDe(
      atribuir({ numero: number, versao: 1, agente: 'ninguem@fora.com' }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('AtribuicaoInvalida')
  })

  /**
   * As duas causas devolvem a MESMA resposta. Distingui-las transformaria a
   * tool num verificador de quem trabalha na empresa — o raciocinio da
   * resposta cega do `solicitarLink` (Story 1.3).
   */
  it('nao cadastrado e nao-Agente sao indistinguiveis', async () => {
    const { number } = await abrir()

    const fora = await erroDe(atribuir({ numero: number, versao: 1, agente: 'x@y.com' }, bruno))
    const solicitante = await erroDe(
      atribuir({ numero: number, versao: 1, agente: 'marina@empresa.com' }, bruno),
    )

    expect(fora.message).toBe(solicitante.message)
  })

  /** Normalizacao unica (1.9): senao a mesma pessoa vira duas identidades. */
  it('normaliza o e-mail do destinatario', async () => {
    const { number } = await abrir()

    const saida = await atribuir({ numero: number, versao: 1, agente: '  ANA@Empresa.COM ' }, bruno)

    expect(saida.para).toBe('ana@empresa.com')
  })
})

describe('atribuir ao mesmo Dono (AC #3)', () => {
  it('e recusado — nao e mudanca', async () => {
    const { number } = await abrir()
    await atribuir({ numero: number, versao: 1, agente: 'ana@empresa.com' }, bruno)

    const erro = await erroDe(
      atribuir({ numero: number, versao: 2, agente: 'ana@empresa.com' }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('AtribuicaoInvalida')
  })

  it('e nao deixa entrada no Log', async () => {
    const { number } = await abrir()
    await atribuir({ numero: number, versao: 1, agente: 'ana@empresa.com' }, bruno)

    await erroDe(atribuir({ numero: number, versao: 2, agente: 'ana@empresa.com' }, bruno))

    const { entradas } = await verHistorico({ repositorio })({ numero: number }, bruno)
    expect(entradas.filter((e) => e.acao === 'atribuir_chamado')).toHaveLength(1)
  })
})

describe('concorrencia otimista (AC #4)', () => {
  it('versao velha recebe Conflict e nada muda', async () => {
    const { number } = await abrir()
    await atribuir({ numero: number, versao: 1, agente: 'ana@empresa.com' }, bruno)

    const erro = await erroDe(
      atribuir({ numero: number, versao: 1, agente: 'bruno@empresa.com' }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('Conflict')
    expect((await ler(number)).assignee).toBe('ana@empresa.com')
  })

  /**
   * A invariante, e nao o codigo do erro: o codigo nao e deterministico numa
   * corrida (licao da 2.2 — a perdedora pode morrer antes do UPDATE).
   */
  it('duas atribuicoes simultaneas produzem UMA escrita', async () => {
    const { number } = await abrir()

    const resultados = await Promise.all([
      atribuir({ numero: number, versao: 1, agente: 'ana@empresa.com' }, bruno).catch(
        (e: unknown) => e,
      ),
      atribuir({ numero: number, versao: 1, agente: 'bruno@empresa.com' }, bruno).catch(
        (e: unknown) => e,
      ),
    ])

    expect(resultados.filter((r) => !(r instanceof Error))).toHaveLength(1)
    expect((await ler(number)).versao).toBe(2)
  })

  /**
   * O `deleted_at IS NULL` do UPDATE protege a janela entre a leitura do
   * command e a escrita. Testar pelo command nao prova nada — `visivelPara`
   * barra antes. Foi uma mutacao sobrevivente na 2.2.
   */
  it('o repositorio recusa atribuir Chamado excluido', async () => {
    const { number } = await abrir()
    await repositorio.excluirComAuditoria(number, bruno)

    const resultado = await repositorio.atribuirComAuditoria({
      numero: number,
      de: null,
      para: 'ana@empresa.com',
      esperada: 1,
      autor: bruno,
    })

    expect(resultado).toBeNull()
  })
})

describe('o par de/para no Log (AC #1)', () => {
  /**
   * `de` NULO na primeira atribuicao: o Chamado saiu de "sem Dono". E o caso
   * que a Story 2.2 previu ao deixar as colunas nulas — escrever 'nenhum'
   * inventaria um valor que nunca existiu.
   */
  it('a primeira atribuicao tem `de` nulo', async () => {
    const { number } = await abrir()
    await atribuir({ numero: number, versao: 1, agente: 'ana@empresa.com' }, bruno)

    const { entradas } = await verHistorico({ repositorio })({ numero: number }, bruno)

    expect(entradas.at(-1)).toMatchObject({
      acao: 'atribuir_chamado',
      de: null,
      para: 'ana@empresa.com',
      autor: 'bruno@empresa.com',
    })
  })

  it('a reatribuicao registra o Dono anterior', async () => {
    const { number } = await abrir()
    await atribuir({ numero: number, versao: 1, agente: 'ana@empresa.com' }, bruno)
    await atribuir({ numero: number, versao: 2, agente: 'bruno@empresa.com' }, bruno)

    const { entradas } = await verHistorico({ repositorio })({ numero: number }, bruno)

    expect(entradas.at(-1)).toMatchObject({
      de: 'ana@empresa.com',
      para: 'bruno@empresa.com',
    })
  })
})
