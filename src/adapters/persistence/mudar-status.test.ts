import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { tickets } from '../../../drizzle/schema.js'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { mudarStatus } from '../../application/commands/mudar-status.js'
import type { Principal } from '../../application/contracts/principal.js'
import { verChamado } from '../../application/queries/ver-chamado.js'
import { verHistorico } from '../../application/queries/ver-historico.js'
import { ehDomainError } from '../../domain/errors.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * Concorrencia otimista testada com duble nao prova nada: o duble concorda com
 * o que voce programou. O que garante o AD-10 e o `UPDATE ... WHERE version =
 * $esperada` — uma restricao do BANCO — e isso so aparece contra o Postgres.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 4 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const abrir = () =>
  abrirChamado({ repositorio })(
    { titulo: 'Notebook nao liga', descricao: 'Sem resposta ao botao.', categoria: 'hardware' },
    marina,
  )

const mudar = mudarStatus({ repositorio })
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
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments RESTART IDENTITY`)
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
})

afterAll(async () => {
  await sqlClient.end()
})

/**
 * Assercao contra o CATALOGO do banco, provando os DOIS lados: que a coluna
 * existe e que ela tem a restricao esperada. Sem o segundo lado, "nao tem a
 * coluna" passaria com a migration ausente (padrao da Story 1.7).
 */
describe('o schema da versao e do par de/para (AC #1, #2)', () => {
  it('tickets.version existe, e NOT NULL e tem default', async () => {
    const linhas = await db.execute(sql`
      SELECT is_nullable, column_default
        FROM information_schema.columns
       WHERE table_name = 'tickets' AND column_name = 'version'
    `)

    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.is_nullable).toBe('NO')
    expect(String(linhas[0]?.column_default)).toContain('1')
  })

  /**
   * `de` e `para` sao NULOS de proposito: `abrir_chamado` e `comentar_chamado`
   * nao mudam valor nenhum, e preencher com 'nenhum' seria inventar um evento.
   */
  it.each(['de', 'para'])('audit_entries.%s existe e aceita nulo', async (coluna) => {
    const linhas = await db.execute(sql`
      SELECT is_nullable
        FROM information_schema.columns
       WHERE table_name = 'audit_entries' AND column_name = ${coluna}
    `)

    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.is_nullable).toBe('YES')
  })
})

describe('a versao anda a cada mutacao (AC #2)', () => {
  it('o Chamado nasce na versao 1', async () => {
    const { number } = await abrir()

    expect((await ler(number)).versao).toBe(1)
  })

  it('mudar o Status incrementa a versao', async () => {
    const { number } = await abrir()

    const saida = await mudar({ numero: number, novoStatus: 'em_andamento', versao: 1 }, bruno)

    expect(saida.versao).toBe(2)
    expect((await ler(number)).versao).toBe(2)
  })

  /**
   * Refinamento do AD-10 decidido na Story 2.1: escrita ADITIVA nao versiona.
   * Se comentar movesse a versao, dois Agentes — um comentando, outro mudando
   * o Status — conflitariam sem motivo.
   */
  it('comentar NAO move a versao', async () => {
    const { number } = await abrir()
    await repositorio.criarComentarioComAuditoria(
      number,
      { autor: bruno.identity, corpo: 'olhando', internal: false },
      bruno,
      'comentar_chamado',
    )

    expect((await ler(number)).versao).toBe(1)
  })
})

describe('o conflito de verdade (AC #2)', () => {
  /**
   * O TESTE CENTRAL DO AD-10 — e o que ele prova precisa ser dito com cuidado.
   *
   * Duas mutacoes com a MESMA versao esperada, disparadas juntas: **uma so
   * escreve**, e a versao anda **uma** vez. Essa e a invariante, e e ela que
   * impede o lost update.
   *
   * O CODIGO do erro da perdedora, porem, nao e deterministico, e descobri
   * isso escrevendo o teste: se ela ler o Chamado antes do commit da vencedora,
   * valida a transicao contra o estado antigo e morre no `UPDATE` com
   * `Conflict`; se ler depois, ja ve o estado novo e morre antes, com
   * `TransicaoInvalida` (pedir `em_andamento` para um Chamado que ja esta
   * `em_andamento` e auto-transicao).
   *
   * Fixar `Conflict` aqui seria fixar o timing do banco — o teste passaria hoje
   * e falharia numa maquina mais lenta. O `Conflict` deterministico e o teste
   * seguinte.
   */
  it('duas mudancas simultaneas produzem UMA escrita', async () => {
    const { number } = await abrir()

    const resultados = await Promise.all([
      mudar({ numero: number, novoStatus: 'em_andamento', versao: 1 }, bruno).catch(
        (e: unknown) => e,
      ),
      mudar({ numero: number, novoStatus: 'em_andamento', versao: 1 }, bruno).catch(
        (e: unknown) => e,
      ),
    ])

    const vencedoras = resultados.filter((r) => !(r instanceof Error))
    const perdedoras = resultados.filter((r): r is Error => r instanceof Error)

    expect(vencedoras).toHaveLength(1)
    expect(perdedoras).toHaveLength(1)
    // Qualquer que seja o motivo, a perdedora foi recusada pelo DOMINIO — nao
    // passou batido nem explodiu com erro de banco cru.
    expect(ehDomainError(perdedoras[0])).toBe(true)

    // A prova do lost update evitado: a versao andou UMA vez, nao duas.
    expect((await ler(number)).versao).toBe(2)
  })

  it('versao velha depois de uma mudanca ja aplicada tambem e Conflict', async () => {
    const { number } = await abrir()
    await mudar({ numero: number, novoStatus: 'em_andamento', versao: 1 }, bruno)

    const erro = await erroDe(mudar({ numero: number, novoStatus: 'resolvido', versao: 1 }, bruno))

    expect(ehDomainError(erro) && erro.code).toBe('Conflict')
    // O Status ficou como estava — a escrita rejeitada nao vazou.
    expect((await ler(number)).status).toBe('em_andamento')
  })

  /** Escrita que nao aconteceu nao vira auditoria (licao da 1.7). */
  it('o conflito nao deixa entrada no Log', async () => {
    const { number } = await abrir()
    await mudar({ numero: number, novoStatus: 'em_andamento', versao: 1 }, bruno)

    await erroDe(mudar({ numero: number, novoStatus: 'resolvido', versao: 1 }, bruno))

    const { entradas } = await verHistorico({ repositorio })({ numero: number }, bruno)
    // Abertura + a mudanca que passou. Nada da que falhou.
    expect(entradas.map((e) => e.acao)).toEqual(['abrir_chamado', 'mudar_status'])
  })
})

describe('o par de/para chega ao historico (AC #1)', () => {
  it('a entrada do Log registra de onde para onde', async () => {
    const { number } = await abrir()
    await mudar({ numero: number, novoStatus: 'em_andamento', versao: 1 }, bruno)

    const { entradas } = await verHistorico({ repositorio })({ numero: number }, bruno)

    expect(entradas.at(-1)).toMatchObject({
      acao: 'mudar_status',
      de: 'aberto',
      para: 'em_andamento',
      autor: 'bruno@empresa.com',
      origin: 'mcp',
    })
  })

  /**
   * Acoes que nao mudam valor ficam com o par nulo. Preencher com 'nenhum'
   * seria inventar um evento, e quem lesse o Log veria uma mudanca que nunca
   * houve.
   */
  it('abertura e comentario nao tem par de/para', async () => {
    const { number } = await abrir()
    await repositorio.criarComentarioComAuditoria(
      number,
      { autor: bruno.identity, corpo: 'x', internal: false },
      bruno,
      'comentar_chamado',
    )

    const { entradas } = await verHistorico({ repositorio })({ numero: number }, bruno)

    for (const entrada of entradas) {
      expect(entrada.de).toBeNull()
      expect(entrada.para).toBeNull()
    }
  })

  it('a sequencia de mudancas fica legivel no Log', async () => {
    const { number } = await abrir()
    await mudar({ numero: number, novoStatus: 'em_andamento', versao: 1 }, bruno)
    await mudar({ numero: number, novoStatus: 'resolvido', versao: 2 }, bruno)

    const { entradas } = await verHistorico({ repositorio })({ numero: number }, bruno)

    expect(entradas.slice(1).map((e) => `${e.de}->${e.para}`)).toEqual([
      'aberto->em_andamento',
      'em_andamento->resolvido',
    ])
  })
})

describe('a defesa em profundidade do UPDATE (AC #3)', () => {
  /**
   * O `deleted_at IS NULL` no `UPDATE` protege a JANELA entre a leitura do
   * command e a escrita: o Chamado pode ser excluido por outro Agente nesse
   * intervalo, e o command ja teria passado pelo `visivelPara`.
   *
   * Testar isso pelo command nao prova nada — ele barra antes. Por isso aqui se
   * chama o REPOSITORIO direto, que e onde a garantia mora. Sem este teste, uma
   * mutacao que remove o filtro sobrevive (foi o que aconteceu na primeira
   * rodada de verificacao).
   */
  it('o repositorio recusa mudar Status de Chamado excluido', async () => {
    const { number } = await abrir()
    await repositorio.excluirComAuditoria(number, bruno)

    const resultado = await repositorio.mudarStatusComAuditoria({
      numero: number,
      de: 'aberto',
      para: 'em_andamento',
      esperada: 1,
      autor: bruno,
    })

    expect(resultado).toBeNull()

    const [linha] = await db.select().from(tickets).where(eq(tickets.number, number))
    expect(linha?.status).toBe('aberto')
  })

  it('e nao deixa auditoria da mudanca que nao aconteceu', async () => {
    const { number } = await abrir()
    await repositorio.excluirComAuditoria(number, bruno)

    await repositorio.mudarStatusComAuditoria({
      numero: number,
      de: 'aberto',
      para: 'em_andamento',
      esperada: 1,
      autor: bruno,
    })

    const linhas = await db.execute(
      sql`SELECT count(*)::int AS total FROM audit_entries WHERE acao = 'mudar_status'`,
    )
    expect(linhas[0]?.total).toBe(0)
  })
})

describe('o gargalo continua valendo na mutacao (AC #3)', () => {
  it('Chamado excluido nao muda de Status, nem com a versao certa', async () => {
    const { number } = await abrir()
    await repositorio.excluirComAuditoria(number, bruno)

    const erro = await erroDe(
      mudar({ numero: number, novoStatus: 'em_andamento', versao: 1 }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('TicketNaoEncontrado')

    const [linha] = await db.select().from(tickets).where(eq(tickets.number, number))
    expect(linha?.status).toBe('aberto')
  })
})
