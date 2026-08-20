import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { importarCsv } from '../../application/commands/importar-csv.js'
import { exportarCsvInputSchema } from '../../application/contracts/exportar-csv.js'
import type { Principal } from '../../application/contracts/principal.js'
import { exportarCsv } from '../../application/queries/exportar-csv.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * O import contra o Postgres REAL (Story 4.2, FR-25).
 *
 * Aqui o dado vem de FORA, e as sondas foram escritas ANTES das mutacoes desta
 * vez (o prompt registra seis ocorrencias em que nao foram):
 *
 * - a **contagem de aceitas** so prova algo se vier do que foi realmente
 *   inserido — por isso todo teste confere o banco depois;
 * - o **relatorio de rejeitadas** e a unica prova de que a validacao rodou:
 *   contar aceitas nao distingue "rejeitou" de "nao processou";
 * - o **Numero nativo** prova que o AD-4 nao foi contornado.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 4 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }

/** O log tem sonda propria em `commands/importar-csv.test.ts`; aqui ele so precisa existir. */
const semLog = { erro: () => {}, aviso: () => {} }

/** Guarda o que foi registrado, para o teste de vazamento. */
const logQueGuarda = () => {
  const erros: { evento: string; dados: Record<string, string | number> }[] = []
  return {
    erros,
    erro: (evento: string, dados: Record<string, string | number>) => {
      erros.push({ evento, dados })
    },
    aviso: () => {},
  }
}

const importar = importarCsv({ repositorio, logger: semLog })

const CABECALHO =
  'numero_legado,titulo,descricao,categoria,status,prioridade,solicitante,dono,criado_em'
const linha = (numeroLegado: string, extra: Partial<Record<string, string>> = {}) =>
  [
    numeroLegado,
    extra.titulo ?? 'VPN nao conecta',
    extra.descricao ?? 'Sem acesso remoto.',
    extra.categoria ?? 'rede',
    extra.status ?? 'aberto',
    extra.prioridade ?? 'media',
    extra.solicitante ?? 'marina@empresa.com',
    extra.dono ?? '',
    extra.criado_em ?? '2024-03-15T10:30:00Z',
  ].join(',')

const arquivo = (...linhas: string[]) => [CABECALHO, ...linhas].join('\n')

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments RESTART IDENTITY`)
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 5000`)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('o Numero e deste sistema; o antigo e referencia (AC #1)', () => {
  it('o Chamado recebe Numero da sequence, e o legado fica guardado', async () => {
    const saida = await importar({ csv: arquivo(linha('INC-4711')) }, bruno)

    expect(saida.aceitas).toEqual([{ linha: 2, numeroLegado: 'INC-4711', numero: 5000 }])

    const [gravado] = await db.execute(
      sql`SELECT number, numero_legado FROM tickets WHERE numero_legado = 'INC-4711'`,
    )
    expect(gravado?.number).toBe(5000)
    expect(gravado?.numero_legado).toBe('INC-4711')
  })

  /** O AD-4 nao pode ser contornado nem quando o arquivo traz um "numero". */
  it('um campo `numero` no CSV nao vira o Numero nativo', async () => {
    const csv = ['numero,numero_legado,titulo,descricao,solicitante', '99,INC-1,T,D,m@e.com'].join(
      '\n',
    )

    const saida = await importar({ csv }, bruno)

    expect(saida.aceitas[0]?.numero).toBe(5000)
  })
})

describe('linha ruim nao aborta o lote (AC #2)', () => {
  it('a linha seguinte entra, e a rejeitada volta com motivo e numero', async () => {
    const saida = await importar(
      {
        csv: arquivo(linha('INC-1'), linha('INC-2', { categoria: 'impressoras' }), linha('INC-3')),
      },
      bruno,
    )

    expect(saida.aceitas.map((a) => a.numeroLegado)).toEqual(['INC-1', 'INC-3'])
    expect(saida.rejeitadas).toEqual([
      { linha: 3, numeroLegado: 'INC-2', motivo: expect.stringMatching(/categoria/i) },
    ])

    const gravados = await db.execute(sql`SELECT numero_legado FROM tickets ORDER BY number`)
    expect(gravados.map((g) => g.numero_legado)).toEqual(['INC-1', 'INC-3'])
  })

  it('o numero da linha e o do ARQUIVO, contando o cabecalho', async () => {
    const saida = await importar(
      { csv: arquivo(linha('INC-1'), linha('INC-2', { titulo: '' })) },
      bruno,
    )

    // Cabecalho e 1; a segunda linha de dados e a 3.
    expect(saida.rejeitadas[0]?.linha).toBe(3)
  })
})

describe('reimportar nao duplica (AC #4)', () => {
  it('a segunda passada relata repetidas, e o banco nao muda', async () => {
    const csv = arquivo(linha('INC-1'), linha('INC-2'))

    const primeira = await importar({ csv }, bruno)
    const segunda = await importar({ csv }, bruno)

    expect(primeira.aceitas).toHaveLength(2)
    expect(segunda.aceitas).toHaveLength(0)
    expect(segunda.repetidas.map((r) => r.numeroLegado)).toEqual(['INC-1', 'INC-2'])

    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM tickets`,
    )
    expect(total).toBe(2)
  })

  /**
   * A garantia e do BANCO, nao da consulta: entre verificar e inserir cabe
   * outra execucao do mesmo arquivo. O UNIQUE parcial da 0013 e quem resolve.
   */
  it('o UNIQUE parcial existe e cobre so os nao-nulos', async () => {
    const indices = await db.execute(sql`
      SELECT indexdef FROM pg_indexes
       WHERE tablename = 'tickets' AND indexname = 'tickets_numero_legado_unico_idx'
    `)

    expect(indices).toHaveLength(1)
    expect(String(indices[0]?.indexdef)).toContain('UNIQUE')
    expect(String(indices[0]?.indexdef)).toContain('numero_legado IS NOT NULL')
  })

  it('Chamado nativo (numero_legado nulo) nao colide com outro nativo', async () => {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester)
      VALUES (1, 'a', 'b', 'rede', 'aberto', 'media', 'x@e.com'),
             (2, 'c', 'd', 'rede', 'aberto', 'media', 'y@e.com')
    `)

    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM tickets WHERE numero_legado IS NULL`,
    )
    expect(total).toBe(2)
  })
})

describe('quem importou responde (AC #5)', () => {
  it('a abertura e auditada com o autor e a origem de quem rodou', async () => {
    await importar({ csv: arquivo(linha('INC-1')) }, bruno)

    const [entrada] = await db.execute(
      sql`SELECT acao, autor, origin FROM audit_entries ORDER BY id`,
    )

    expect(entrada?.acao).toBe('abrir_chamado')
    // Quem TROUXE o Chamado — diferente do `requester`, que e de quem ele e.
    expect(entrada?.autor).toBe('bruno@empresa.com')
    expect(entrada?.origin).toBe('mcp')
  })

  it('o requester continua sendo o do arquivo, nao quem importou', async () => {
    await importar(
      { csv: arquivo(linha('INC-1', { solicitante: 'quem.saiu@empresa.com' })) },
      bruno,
    )

    const [gravado] = await db.execute(sql`SELECT requester FROM tickets`)
    expect(gravado?.requester).toBe('quem.saiu@empresa.com')
  })

  /** Linha rejeitada nao pode deixar Chamado nem auditoria orfa. */
  it('linha rejeitada nao grava nada', async () => {
    await importar({ csv: arquivo(linha('INC-1', { status: 'pendente' })) }, bruno)

    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM audit_entries`,
    )
    expect(total).toBe(0)
  })
})

describe('o historico e preservado (AC #6)', () => {
  it('a data de abertura vem do arquivo', async () => {
    await importar({ csv: arquivo(linha('INC-1', { criado_em: '2023-01-10T08:00:00Z' })) }, bruno)

    const [gravado] = await db.execute(sql`SELECT criado_em FROM tickets`)
    expect(new Date(String(gravado?.criado_em)).toISOString()).toBe('2023-01-10T08:00:00.000Z')
  })

  it('Chamado ja fechado entra fechado, sem passar pela maquina de estados', async () => {
    await importar({ csv: arquivo(linha('INC-1', { status: 'fechado' })) }, bruno)

    const [gravado] = await db.execute(sql`SELECT status FROM tickets`)
    expect(gravado?.status).toBe('fechado')

    // E o Log tem SO a abertura: nenhuma transicao foi inventada.
    const acoes = await db.execute(sql`SELECT acao FROM audit_entries ORDER BY id`)
    expect(acoes.map((a) => a.acao)).toEqual(['abrir_chamado'])
  })

  /**
   * Sem data no arquivo, o Chamado entra com a data de hoje — e isso vai no
   * relatorio: quem migra precisa saber que o historico daquelas linhas comeca
   * agora.
   */
  it('sem data original, o relatorio avisa', async () => {
    const saida = await importar({ csv: arquivo(linha('INC-1', { criado_em: '' })) }, bruno)

    expect(saida.semDataOriginal).toBe(1)
    expect(saida.aceitas).toHaveLength(1)
  })
})

describe('o ciclo exportar -> reimportar', () => {
  /**
   * A prova de que o formato fecha: o que a 4.1 escreve, esta story le de volta
   * e recria. Repare no que MUDA de proposito — o Numero e novo, porque o
   * antigo e referencia (AD-4).
   */
  it('o CSV exportado e reimportavel noutra base', async () => {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester, numero_legado, criado_em)
      VALUES (4000, 'Erro "grave", urgente', 'Quebra de linha:
segunda linha', 'rede', 'fechado', 'alta', 'marina@empresa.com', 'ORIG-1', '2024-05-05T12:00:00Z')
    `)

    const exportado = await exportarCsv({ repositorio })(exportarCsvInputSchema.parse({}), bruno)

    await db.execute(sql`TRUNCATE tickets, audit_entries RESTART IDENTITY`)
    await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 7000`)

    const saida = await importar({ csv: exportado.csv }, bruno)

    expect(saida.rejeitadas).toEqual([])
    expect(saida.aceitas).toHaveLength(1)

    const [recriado] = await db.execute(
      sql`SELECT number, titulo, descricao, status, priority, numero_legado FROM tickets`,
    )
    expect(recriado?.number).toBe(7000)
    expect(recriado?.titulo).toBe('Erro "grave", urgente')
    expect(String(recriado?.descricao)).toContain('segunda linha')
    expect(recriado?.status).toBe('fechado')
    expect(recriado?.numero_legado).toBe('ORIG-1')
  })
})

describe('quem pode importar (AD-8)', () => {
  const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

  /**
   * O import e a UNICA escrita em que o autor e o dono do registro sao pessoas
   * diferentes de proposito. Sem esta guarda, um Solicitante montaria o arquivo
   * e abriria Chamados no nome de quem quisesse.
   */
  it('Solicitante nao importa, e nada e gravado', async () => {
    await expect(importar({ csv: arquivo(linha('INC-1')) }, marina)).rejects.toThrow(
      /nao pode importar/i,
    )

    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM tickets`,
    )
    expect(total).toBe(0)
  })
})

describe('a corrida que so o banco resolve', () => {
  /**
   * A consulta previa NAO basta, e este teste e o unico lugar onde isso
   * aparece: entre "consultar se ja existe" e "inserir" cabe outra execucao do
   * mesmo arquivo — duas pessoas migrando ao mesmo tempo, ou o import
   * reiniciado. Quem decide e o UNIQUE parcial da 0013, traduzido de volta para
   * "repetida" pelo `catch`.
   *
   * Rodar N imports em paralelo NAO produz esta corrida: eles serializam, o
   * segundo enxerga o primeiro ja comitado e para na consulta previa — o
   * `catch` fica morto e uma mutacao que o apague sobrevive (foi o que
   * aconteceu na primeira versao deste teste). Por isso aqui a janela e aberta
   * a mao: uma transacao de FORA insere o mesmo `numero_legado` e fica aberta
   * enquanto o import passa pela consulta, e so comita quando o INSERT do
   * import ja esta bloqueado esperando por ela.
   */
  const IMPORTADO = {
    numeroLegado: 'INC-CORRIDA',
    titulo: 'VPN nao conecta',
    descricao: 'Sem acesso remoto.',
    categoria: 'rede' as const,
    status: 'aberto' as const,
    prioridade: 'media' as const,
    requester: 'marina@empresa.com',
    assignee: null,
  }

  /** Espera o INSERT do import travar no indice — sem isso, nao ha corrida. */
  const esperarOBloqueio = async () => {
    for (let tentativa = 0; tentativa < 300; tentativa += 1) {
      const [linha] = await sqlClient<{ total: number }[]>`
        SELECT count(*)::int AS total
          FROM pg_stat_activity
         WHERE wait_event_type = 'Lock'
           AND query ILIKE '%tickets%'
      `
      if ((linha?.total ?? 0) > 0) {
        return
      }
      await new Promise((resolva) => setTimeout(resolva, 10))
    }
    throw new Error('o INSERT do import nao bloqueou: a corrida nao aconteceu')
  }

  it('quando o outro comita primeiro, o import relata repetida em vez de falhar', async () => {
    const deFora = await sqlClient.reserve()
    let importado: { number: number } | null | undefined

    try {
      await deFora`BEGIN`
      await deFora`
        INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester, numero_legado)
        VALUES (nextval('ticket_number_seq'), 'de fora', 'd', 'rede', 'aberto', 'media', 'x@e.com', ${IMPORTADO.numeroLegado})
      `

      // A consulta previa do import roda AGORA e nao ve nada: a linha acima
      // ainda nao foi comitada. O INSERT dele entao trava no indice.
      const promessa = repositorio.importarComAuditoria(IMPORTADO, bruno)
      await esperarOBloqueio()
      await deFora`COMMIT`

      importado = await promessa
    } finally {
      await deFora.release()
    }

    expect(importado).toBeNull()

    const [{ total } = { total: 0 }] = await db.execute(
      sql`SELECT count(*)::int AS total FROM tickets WHERE numero_legado = 'INC-CORRIDA'`,
    )
    expect(total).toBe(1)
  })
})

describe('o erro REAL do banco nao vaza o conteudo da linha (AD-9)', () => {
  /**
   * Este teste existe porque o duble mentia.
   *
   * O teste de unidade "o log NAO leva o conteudo da linha" usava um duble que
   * lancava `new Error('timeout ao falar com o banco')` — string sintetica, sem
   * dado nenhum. Ele passava e nao provava nada: o `DrizzleQueryError` real
   * carrega a query E OS PARAMETROS. Medido contra este mesmo Postgres:
   *
   *   Failed query: insert into "tickets" (...) values ($1,$2,...)
   *   params: <Titulo>,<Descricao>,rede,aberto,media,<email>,,INC-1
   *
   * O byte nulo no meio do texto e o gatilho, e nao e caso de laboratorio:
   * arquivo de sistema legado tem byte nulo. O Postgres recusa com 22021.
   *
   * "Afirmacao nao e teste" pela terceira vez nesta story — e das tres, esta
   * foi a unica em que o teste EXISTIA e ainda assim nao provava o caminho.
   */
  const SEGREDO = 'ACESSO-NEGADO-AO-SISTEMA-DA-FOLHA'
  const DESCRICAO_SENSIVEL = 'a demissao da equipe toda sai na sexta'
  const EMAIL = 'quem.abriu@empresa.com'

  it('a causa que chega ao log e ao relatorio traz o SQLSTATE, nao os parametros', async () => {
    const logger = logQueGuarda()
    const csv = [
      CABECALHO,
      [
        'INC-BYTE-NULO',
        `${SEGREDO}${String.fromCharCode(0)}`,
        DESCRICAO_SENSIVEL,
        'rede',
        'aberto',
        'media',
        EMAIL,
        '',
        '2024-03-15T10:30:00Z',
      ].join(','),
    ].join('\n')

    const saida = await importarCsv({ repositorio, logger })({ csv }, bruno)

    expect(saida.aceitas).toEqual([])
    expect(saida.falhas).toHaveLength(1)

    // O que o operador VE — no relatorio e no log.
    const tudoQueSaiu = JSON.stringify([saida.falhas, logger.erros])

    expect(tudoQueSaiu).not.toContain(SEGREDO)
    expect(tudoQueSaiu).not.toContain(DESCRICAO_SENSIVEL)
    expect(tudoQueSaiu).not.toContain(EMAIL)
    expect(tudoQueSaiu).not.toContain('Failed query')
    expect(tudoQueSaiu).not.toContain('params:')

    // E ainda assim diz o que aconteceu.
    expect(saida.falhas[0]?.erro).toContain('22021')
    expect(saida.falhas[0]?.erro).toMatch(/UTF-8/)
    expect(saida.falhas[0]?.numeroLegado).toBe('INC-BYTE-NULO')
  })

  it('nada foi gravado, e o Chamado seguinte entra normalmente', async () => {
    const csv = [
      CABECALHO,
      [
        'INC-BYTE-NULO',
        `x${String.fromCharCode(0)}`,
        'd',
        'rede',
        'aberto',
        'media',
        EMAIL,
        '',
        '',
      ].join(','),
      linha('INC-BOM'),
    ].join('\n')

    const saida = await importar({ csv }, bruno)

    expect(saida.falhas.map((f) => f.numeroLegado)).toEqual(['INC-BYTE-NULO'])
    expect(saida.aceitas.map((a) => a.numeroLegado)).toEqual(['INC-BOM'])

    const gravados = await db.execute(sql`SELECT numero_legado FROM tickets`)
    expect(gravados.map((g) => g.numero_legado)).toEqual(['INC-BOM'])
  })
})
