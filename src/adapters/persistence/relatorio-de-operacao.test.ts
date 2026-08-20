import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Principal } from '../../application/contracts/principal.js'
import { relatorioDeOperacao } from '../../application/queries/relatorio-de-operacao.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * O relatorio de operacao contra o Postgres real (Story 4.4).
 *
 * Este arquivo mede a metade da pergunta do corte de contrato que o sistema
 * consegue provar sozinho. A outra metade — o baseline do software anterior e
 * "zero Chamados perdidos fora dele" — nao e mensuravel daqui, e esta na
 * checklist de paridade.
 *
 * As sondas foram escritas ANTES do codigo:
 *
 * - **base vazia** devolve nulo, e nao `NaN` — um relatorio que quebra sem
 *   dados e inutil justamente no primeiro dia;
 * - **Chamado sem resolucao** nao entra na media, e a contagem dele aparece;
 * - **reaberto** usa a regra declarada (o ULTIMO 'resolvido'), com assercao
 *   sobre o NUMERO, nao sobre "nao deu erro";
 * - **o periodo corta de verdade** — sem esta, o filtro pode nem existir.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 2 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const AGORA = new Date('2026-08-20T12:00:00Z')
const relatorio = relatorioDeOperacao({ repositorio, agora: () => AGORA })

/** Cria um Chamado com abertura e (opcionalmente) resolucoes em instantes dados. */
const chamado = async (
  numero: number,
  abertoEm: string,
  resolvidoEm: readonly string[] = [],
  origem = 'mcp',
) => {
  await db.execute(sql`
    INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester)
    VALUES (${numero}, 'T', 'D', 'rede', 'aberto', 'media', 'marina@empresa.com')
  `)
  await db.execute(sql`
    INSERT INTO audit_entries (ticket_number, acao, autor, origin, registrado_em)
    VALUES (${numero}, 'abrir_chamado', 'marina@empresa.com', ${origem}, ${abertoEm})
  `)
  for (const instante of resolvidoEm) {
    await db.execute(sql`
      INSERT INTO audit_entries (ticket_number, acao, autor, origin, de, para, registrado_em)
      VALUES (${numero}, 'mudar_status', 'bruno@empresa.com', ${origem}, 'em_andamento', 'resolvido', ${instante})
    `)
  }
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, comments, audit_entries RESTART IDENTITY`)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('base vazia (AC #1)', () => {
  it('devolve nulo, e nao NaN — "nao resolveu nada" nao e "resolveu em 0h"', async () => {
    const saida = await relatorio({}, bruno)

    expect(saida.resolucao.medianaHoras).toBeNull()
    expect(saida.resolucao.mediaHoras).toBeNull()
    expect(saida.resolucao.resolvidos).toBe(0)
    expect(saida.origem.percentualMcp).toBeNull()
    expect(saida.adocao.autoresDistintos).toBe(0)
  })
})

describe('o tempo de resolucao (AC #1, SM-3)', () => {
  it('conta da abertura ate a resolucao, em horas', async () => {
    await chamado(1000, '2026-08-19T10:00:00Z', ['2026-08-19T14:00:00Z'])

    const saida = await relatorio({}, bruno)

    expect(saida.resolucao.mediaHoras).toBeCloseTo(4, 5)
    expect(saida.resolucao.medianaHoras).toBeCloseTo(4, 5)
    expect(saida.resolucao.resolvidos).toBe(1)
  })

  /**
   * A razao de a story exigir as duas medidas: numa fila pequena, UM Chamado
   * esquecido arrasta a media e faz o sistema parecer pior do que e. A mediana
   * e o numero honesto para comparar com o baseline.
   */
  it('a mediana resiste ao Chamado esquecido; a media nao', async () => {
    await chamado(1000, '2026-08-19T10:00:00Z', ['2026-08-19T12:00:00Z']) // 2h
    await chamado(1001, '2026-08-19T10:00:00Z', ['2026-08-19T13:00:00Z']) // 3h
    await chamado(1002, '2026-08-19T10:00:00Z', ['2026-08-19T14:00:00Z']) // 4h
    await chamado(1003, '2026-08-01T10:00:00Z', ['2026-08-19T10:00:00Z']) // 432h

    const saida = await relatorio({}, bruno)

    expect(saida.resolucao.medianaHoras).toBeCloseTo(3.5, 5)
    // A media passa de 110h por causa de um so.
    expect(saida.resolucao.mediaHoras).toBeGreaterThan(100)
    expect(saida.resolucao.resolvidos).toBe(4)
  })

  it('Chamado sem resolucao fica FORA da media, e aparece na contagem', async () => {
    await chamado(1000, '2026-08-19T10:00:00Z', ['2026-08-19T14:00:00Z'])
    await chamado(1001, '2026-08-19T10:00:00Z')

    const saida = await relatorio({}, bruno)

    expect(saida.resolucao.mediaHoras).toBeCloseTo(4, 5)
    expect(saida.resolucao.resolvidos).toBe(1)
    expect(saida.resolucao.semResolucao).toBe(1)
    // E os dois contam como abertos: a adocao mede entrada, nao conclusao.
    expect(saida.adocao.chamadosAbertos).toBe(2)
  })

  /**
   * A sonda que a mutacao pediu: com SO um Chamado sem resolucao, um `LEFT
   * JOIN` no lugar do `JOIN` faria ele entrar na conta com tempo nulo. Com
   * dois Chamados (um resolvido, um nao) o `resolvidos` continuava 1 por
   * acaso — a media e que mudaria, e nenhuma assercao a pegava sozinha.
   *
   * Aqui NAO HA nenhum resolvido: se o Chamado aberto vazar para o calculo,
   * `resolvidos` vira 1 e a mediana deixa de ser nula.
   */
  it('com APENAS Chamados sem resolucao, nada entra no calculo', async () => {
    await chamado(1000, '2026-08-19T10:00:00Z')
    await chamado(1001, '2026-08-19T11:00:00Z')

    const saida = await relatorio({}, bruno)

    expect(saida.resolucao.resolvidos).toBe(0)
    expect(saida.resolucao.medianaHoras).toBeNull()
    expect(saida.resolucao.mediaHoras).toBeNull()
    expect(saida.resolucao.semResolucao).toBe(2)
  })
})

describe('o Chamado reaberto usa o ULTIMO resolvido (AC #3)', () => {
  /**
   * A decisao esta na story: a metrica responde "quanto tempo o Solicitante
   * esperou ate o problema ACABAR", e uma reabertura diz que nao tinha acabado.
   * Usar o PRIMEIRO faria o numero melhorar quando o atendimento piora.
   */
  it('resolvido em 2h, reaberto e resolvido em 10h conta 10h', async () => {
    await chamado(1000, '2026-08-19T10:00:00Z', ['2026-08-19T12:00:00Z', '2026-08-19T20:00:00Z'])

    const saida = await relatorio({}, bruno)

    expect(saida.resolucao.mediaHoras).toBeCloseTo(10, 5)
    // UM Chamado, nao dois: duas resolucoes do mesmo Chamado nao viram dois.
    expect(saida.resolucao.resolvidos).toBe(1)
  })
})

describe('o periodo corta de verdade (AC #1)', () => {
  it('Chamado aberto ANTES do periodo fica fora', async () => {
    await chamado(1000, '2026-06-01T10:00:00Z', ['2026-06-01T14:00:00Z'])
    await chamado(1001, '2026-08-19T10:00:00Z', ['2026-08-19T18:00:00Z'])

    const saida = await relatorio({}, bruno)

    // O padrao sao 30 dias: junho esta fora.
    expect(saida.resolucao.resolvidos).toBe(1)
    expect(saida.resolucao.mediaHoras).toBeCloseTo(8, 5)
  })

  it('o periodo informado e respeitado', async () => {
    await chamado(1000, '2026-08-10T10:00:00Z', ['2026-08-10T12:00:00Z'])
    await chamado(1001, '2026-08-19T10:00:00Z', ['2026-08-19T12:00:00Z'])

    const saida = await relatorio(
      { de: '2026-08-15T00:00:00Z', ate: '2026-08-20T00:00:00Z' },
      bruno,
    )

    expect(saida.adocao.chamadosAbertos).toBe(1)
    expect(saida.periodo.de).toBe('2026-08-15T00:00:00.000Z')
  })

  it('periodo invertido e RECUSADO, nao devolve vazio', async () => {
    await expect(
      relatorio({ de: '2026-08-20T00:00:00Z', ate: '2026-08-10T00:00:00Z' }, bruno),
    ).rejects.toThrow(/anterior ao fim/i)
  })
})

describe('a origem das acoes (AC #2, SM-4)', () => {
  it('conta por origem e devolve o percentual via MCP', async () => {
    await chamado(1000, '2026-08-19T10:00:00Z', ['2026-08-19T12:00:00Z'], 'mcp')
    await chamado(1001, '2026-08-19T10:00:00Z', [], 'email')

    const saida = await relatorio({}, bruno)

    // 2 acoes mcp (abrir + resolver), 1 email (abrir).
    expect(saida.origem.mcp).toBe(2)
    expect(saida.origem.email).toBe(1)
    expect(saida.origem.api).toBe(0)
    expect(saida.origem.percentualMcp).toBeCloseTo(66.7, 1)
  })
})

describe('a adocao (AC #2, SM-5)', () => {
  it('conta pessoas distintas que agiram', async () => {
    await chamado(1000, '2026-08-19T10:00:00Z', ['2026-08-19T12:00:00Z'])
    await chamado(1001, '2026-08-19T10:00:00Z', ['2026-08-19T12:00:00Z'])

    const saida = await relatorio({}, bruno)

    // marina abriu os dois, bruno resolveu os dois.
    expect(saida.adocao.autoresDistintos).toBe(2)
  })

  /**
   * Sonda que faltava, e a mutacao mostrou: sem ela, o filtro de periodo desta
   * subconsulta podia SUMIR sem nenhum teste notar — porque todos os outros so
   * criam acao DENTRO da janela.
   *
   * O efeito seria o SM-5 inflado: quem agiu ha seis meses e nunca mais voltou
   * contaria como "operando no ServiceDesk", e o numero que sustenta a decisao
   * de corte diria que a adocao e maior do que e. **A metrica erraria para o
   * lado otimista**, que e o pior lado para uma metrica de decisao.
   */
  it('quem agiu FORA do periodo nao conta', async () => {
    // Ana so agiu em junho; o padrao do relatorio sao os ultimos 30 dias.
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester)
      VALUES (900, 'antigo', 'D', 'rede', 'aberto', 'media', 'marina@empresa.com')
    `)
    await db.execute(sql`
      INSERT INTO audit_entries (ticket_number, acao, autor, origin, registrado_em)
      VALUES (900, 'abrir_chamado', 'ana@empresa.com', 'mcp', '2026-06-01T10:00:00Z')
    `)

    await chamado(1000, '2026-08-19T10:00:00Z', ['2026-08-19T12:00:00Z'])

    const saida = await relatorio({}, bruno)

    // marina e bruno agiram no periodo; ana nao.
    expect(saida.adocao.autoresDistintos).toBe(2)
  })
})

describe('dado corrompido nao estraga a media em silencio', () => {
  /**
   * Resolucao ANTES da abertura nao deveria existir. Se existir — relogio
   * torto, migracao mal feita, `INSERT` manual —, ela produz um tempo NEGATIVO
   * que entra na media e a puxa para baixo **sem nenhum sinal**: o relatorio
   * continua devolvendo um numero plausivel, e alguem decide o corte do
   * contrato com ele.
   *
   * O `WHERE r.resolucao >= ab.abertura` barra isso. Este teste existe porque a
   * mutacao que remove aquele `WHERE` SOBREVIVEU — e, pior, eu tinha escrito no
   * proprio script de mutacao que ela "morre", para justificar a remocao de
   * outra. **Afirmacao nao e teste**, pela quarta vez neste projeto; desta vez
   * a afirmacao estava no arquivo que existe para verificar afirmacoes.
   */
  it('resolucao anterior a abertura fica FORA da media', async () => {
    // O Chamado bom: 4h.
    await chamado(1000, '2026-08-19T10:00:00Z', ['2026-08-19T14:00:00Z'])

    // O corrompido: resolvido "antes" de ser aberto.
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester)
      VALUES (1001, 'torto', 'D', 'rede', 'aberto', 'media', 'marina@empresa.com')
    `)
    await db.execute(sql`
      INSERT INTO audit_entries (ticket_number, acao, autor, origin, registrado_em)
      VALUES (1001, 'abrir_chamado', 'marina@empresa.com', 'mcp', '2026-08-19T15:00:00Z')
    `)
    await db.execute(sql`
      INSERT INTO audit_entries (ticket_number, acao, autor, origin, de, para, registrado_em)
      VALUES (1001, 'mudar_status', 'bruno@empresa.com', 'mcp', 'em_andamento', 'resolvido', '2026-08-19T09:00:00Z')
    `)

    const saida = await relatorio({}, bruno)

    // So o Chamado bom entra: sem a guarda, a media viraria (4 + -6) / 2 = -1.
    expect(saida.resolucao.resolvidos).toBe(1)
    expect(saida.resolucao.mediaHoras).toBeCloseTo(4, 5)
    // E nunca negativa, que e o sintoma que ninguem olharia.
    expect(saida.resolucao.mediaHoras).toBeGreaterThan(0)
  })
})

describe('Chamado excluido fica fora (FR-23)', () => {
  /**
   * `audit_entries` NAO tem `deleted_at` (e append-only, decisao da 1.7), entao
   * um `SELECT` sobre ele veria o Chamado excluido a menos que junte com
   * `tickets`. E o tipo de vazamento que a 3.1 achou na leitura, agora numa
   * agregacao.
   */
  it('o excluido nao entra na contagem nem na media', async () => {
    await chamado(1000, '2026-08-19T10:00:00Z', ['2026-08-19T14:00:00Z'])
    await chamado(1001, '2026-08-19T10:00:00Z', ['2026-08-19T12:00:00Z'])
    await db.execute(sql`UPDATE tickets SET deleted_at = now() WHERE number = 1001`)

    const saida = await relatorio({}, bruno)

    expect(saida.adocao.chamadosAbertos).toBe(1)
    expect(saida.resolucao.resolvidos).toBe(1)
    expect(saida.resolucao.mediaHoras).toBeCloseTo(4, 5)
  })
})

describe('quem pode ver o relatorio (AD-8)', () => {
  it('o Solicitante nao ve — nem uma versao reduzida', async () => {
    await chamado(1000, '2026-08-19T10:00:00Z', ['2026-08-19T14:00:00Z'])

    await expect(relatorio({}, marina)).rejects.toThrow(/nao pode ver o relatorio/i)
  })
})
