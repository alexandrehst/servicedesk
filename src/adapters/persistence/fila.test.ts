import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buscarChamadosInputSchema } from '../../application/contracts/buscar-chamados.js'
import type { Principal } from '../../application/contracts/principal.js'
import { buscarChamados } from '../../application/queries/buscar-chamados.js'
import { filaVisivelPara } from '../../domain/visibilidade.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * A Fila contra o Postgres REAL (Story 3.1).
 *
 * O `WHERE` do escopo, o filtro de excluidos, a ordem estavel e a paginacao sao
 * do BANCO. Com duble, cada um deles seria apenas o que o duble foi programado
 * para fazer — e o modo de falha desta story e silencioso: uma lista com
 * Chamado alheio vem ordenada, filtrada e plausivel.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 4 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

const buscar = buscarChamados({ repositorio })
const padrao = buscarChamadosInputSchema.parse({})

/**
 * Insere direto no banco: esta suite precisa de CONTROLE sobre `criado_em`,
 * `status` e `requester`, e abrir pelo command daria `now()` e `aberto` para
 * todos — nao daria para testar ordem nem filtro.
 */
const inserir = async (
  linhas: {
    numero: number
    requester: string
    status?: string
    categoria?: string
    assignee?: string | null
    prioridade?: string
    criadoEm?: string
    excluido?: boolean
    titulo?: string
    descricao?: string
    numeroLegado?: string
  }[],
) => {
  for (const l of linhas) {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester, assignee, criado_em, deleted_at, numero_legado)
      VALUES (
        ${l.numero}, ${l.titulo ?? `Chamado ${l.numero}`},
        ${l.descricao ?? 'descricao longa que a Fila NAO devolve'},
        ${l.categoria ?? 'hardware'}, ${l.status ?? 'aberto'}, ${l.prioridade ?? 'media'},
        ${l.requester}, ${l.assignee ?? null},
        ${l.criadoEm ?? '2026-08-18T09:00:00Z'}, ${l.excluido === true ? sql`now()` : null},
        ${l.numeroLegado ?? null}
      )
    `)
  }
}

/** Story 3.4 — Comentario direto no banco: a suite precisa controlar `internal`. */
const comentar = async (
  numero: number,
  corpo: string,
  opcoes: { interno?: boolean; excluido?: boolean } = {},
) => {
  await db.execute(sql`
    INSERT INTO comments (ticket_number, autor, corpo, internal, deleted_at)
    VALUES (
      ${numero}, 'bruno@empresa.com', ${corpo}, ${opcoes.interno === true},
      ${opcoes.excluido === true ? sql`now()` : null}
    )
  `)
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments RESTART IDENTITY`)
})

afterAll(async () => {
  await sqlClient.end()
})

describe('o escopo, no WHERE (AC #2)', () => {
  /**
   * O teste que o epico inteiro precisa: DUAS identidades com dados de AMBAS no
   * banco. "O Solicitante ve os dele" passaria mesmo com o filtro quebrado se
   * so houvesse dados dele.
   */
  it('o Solicitante nao alcanca Chamado de terceiro', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'carlos@empresa.com' },
      { numero: 1002, requester: 'marina@empresa.com' },
    ])

    const saida = await buscar(padrao, marina)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1002])
  })

  it('cada Solicitante ve a propria fatia, e nenhuma linha se cruza', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'carlos@empresa.com' },
    ])

    const daMarina = await buscar(padrao, marina)
    const doCarlos = await buscar(padrao, carlos)

    expect(daMarina.itens.map((i) => i.numero)).toEqual([1000])
    expect(doCarlos.itens.map((i) => i.numero)).toEqual([1001])
  })

  it('o Agente alcanca a Fila inteira', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'carlos@empresa.com' },
    ])

    expect((await buscar(padrao, bruno)).itens).toHaveLength(2)
  })
})

/**
 * O `WHERE` do escopo, ISOLADO do gargalo do dominio (AC #2, #3).
 *
 * Pela saida da query, remover o `WHERE` nao muda NADA: `filaVisivelPara`
 * corrige, e era esse o desenho. Mas entao o `WHERE` fica sem teste — e uma
 * mutacao que o removesse sobreviveria, exatamente como aconteceu na primeira
 * rodada desta story.
 *
 * A saida e a mesma da Story 2.2 com o `deleted_at IS NULL` do UPDATE: chamar o
 * REPOSITORIO direto. Aqui o embrulho e aberto com um AGENTE, que ve tudo —
 * entao o que sobrar veio do SQL, nao do dominio.
 */
describe('o WHERE do escopo, sem a rede do dominio (AC #2, #3)', () => {
  it('a consulta com escopo apenasDe ja volta sem Chamado de terceiro', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'carlos@empresa.com' },
    ])

    const bruta = await repositorio.buscarFilaBruta(
      { tipo: 'apenasDe', requester: 'marina@empresa.com' },
      { dono: { tipo: 'qualquer' } },
      { limite: 20, deslocamento: 0, ordem: 'asc' },
    )

    // Aberto por um AGENTE: se o `WHERE` tivesse deixado passar, apareceria.
    expect(filaVisivelPara(bruno, bruta).itens.map((i) => i.number)).toEqual([1000])
  })

  /**
   * Aqui abrir com um Agente NAO isola nada: `podeVerTicket` tambem descarta
   * excluido, entao o gargalo esconderia a falta do `WHERE`. Quem denuncia e o
   * `temMais` — ele vem do SQL (`limite + 1` linhas) e o dominio NAO o
   * recalcula.
   *
   * Com limite 1 e apenas UM Chamado vivo: se o `deleted_at IS NULL` estiver no
   * lugar, o banco acha 1 linha e `temMais` e falso. Sem ele, acha 2 e diz que
   * ha mais — uma pagina seguinte que nao existe.
   */
  it('a consulta ja volta sem Chamado excluido, e o temMais prova isso', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'marina@empresa.com', excluido: true },
    ])

    const bruta = await repositorio.buscarFilaBruta(
      { tipo: 'todos' },
      { dono: { tipo: 'qualquer' } },
      { limite: 1, deslocamento: 0, ordem: 'asc' },
    )

    const visivel = filaVisivelPara(bruno, bruta)
    expect(visivel.itens.map((i) => i.number)).toEqual([1000])
    expect(visivel.temMais).toBe(false)
  })
})

describe('Chamado excluido nao aparece (AC #3)', () => {
  it('nem para o dono, nem para o Agente', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com' },
      { numero: 1001, requester: 'marina@empresa.com', excluido: true },
    ])

    expect((await buscar(padrao, marina)).itens.map((i) => i.numero)).toEqual([1000])
    expect((await buscar(padrao, bruno)).itens.map((i) => i.numero)).toEqual([1000])
  })
})

describe('filtros combinados (AC #1)', () => {
  beforeEach(async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', status: 'aberto', categoria: 'rede' },
      {
        numero: 1001,
        requester: 'marina@empresa.com',
        status: 'em_andamento',
        categoria: 'rede',
        assignee: 'bruno@empresa.com',
      },
      { numero: 1002, requester: 'carlos@empresa.com', status: 'aberto', categoria: 'hardware' },
      {
        numero: 1003,
        requester: 'carlos@empresa.com',
        status: 'em_andamento',
        categoria: 'rede',
        assignee: 'ana@empresa.com',
      },
    ])
  })

  it('filtra por status', async () => {
    const saida = await buscar({ ...padrao, status: 'aberto' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1002])
  })

  it('filtra por dono', async () => {
    const saida = await buscar({ ...padrao, dono: 'bruno@empresa.com' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1001])
  })

  it('filtra por categoria', async () => {
    const saida = await buscar({ ...padrao, categoria: 'rede' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1001, 1003])
  })

  it('combina os tres', async () => {
    const saida = await buscar(
      { ...padrao, status: 'em_andamento', categoria: 'rede', dono: 'ana@empresa.com' },
      bruno,
    )

    expect(saida.itens.map((i) => i.numero)).toEqual([1003])
  })

  /** O filtro NAO pode furar o escopo: eles se combinam, nao competem. */
  it('o filtro do Solicitante continua dentro do escopo dele', async () => {
    const saida = await buscar({ ...padrao, categoria: 'rede' }, marina)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1001])
  })
})

describe('a linha da Fila vem do banco, e e resumo (AC #1)', () => {
  /**
   * Sem esta assercao, trocar `titulo` por `descricao` no SELECT sobrevive a
   * suite inteira: o teste unitario usa duble, e os demais testes daqui so
   * olham Numeros. Foi uma mutacao sobrevivente na primeira rodada.
   */
  it('cada campo vem da coluna certa', async () => {
    await inserir([
      {
        numero: 1042,
        requester: 'marina@empresa.com',
        status: 'em_andamento',
        prioridade: 'alta',
        assignee: 'bruno@empresa.com',
        criadoEm: '2026-08-18T09:00:00Z',
      },
    ])

    const saida = await buscar(padrao, bruno)

    expect(saida.itens[0]).toEqual({
      numero: 1042,
      titulo: 'Chamado 1042',
      status: 'em_andamento',
      prioridade: 'alta',
      dono: 'bruno@empresa.com',
      criadoEm: '2026-08-18T09:00:00.000Z',
    })
  })

  /** O resumo NAO carrega a Descricao — nem no tipo, nem por acidente. */
  it('a Descricao nao viaja na Fila', async () => {
    await inserir([{ numero: 1000, requester: 'marina@empresa.com' }])

    const saida = await buscar(padrao, marina)

    expect(JSON.stringify(saida)).not.toContain('descricao longa')
  })
})

/**
 * Story 3.2 — os recortes (FR-9).
 *
 * Repare que aqui o gargalo do dominio NAO e rede de seguranca: `podeVerTicket`
 * nao sabe nada sobre Dono, entao um erro no `WHERE` do recorte chega inteiro a
 * saida. O que continua exigindo duas identidades e a interacao recorte x
 * escopo, onde o gargalo volta a mascarar.
 */
describe('recortes: meus e sem dono (Story 3.2)', () => {
  beforeEach(async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', assignee: null },
      { numero: 1001, requester: 'marina@empresa.com', assignee: 'bruno@empresa.com' },
      { numero: 1002, requester: 'carlos@empresa.com', assignee: null },
      { numero: 1003, requester: 'carlos@empresa.com', assignee: 'ana@empresa.com' },
    ])
  })

  it('sem_dono traz apenas os que nao tem Dono (AC #1)', async () => {
    const saida = await buscar({ ...padrao, recorte: 'sem_dono' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1002])
  })

  it('meus traz apenas os Chamados de quem esta autenticado (AC #2)', async () => {
    const doBruno = await buscar({ ...padrao, recorte: 'meus' }, bruno)

    expect(doBruno.itens.map((i) => i.numero)).toEqual([1001])
  })

  /**
   * A identidade sai do PRINCIPAL: a mesma chamada, feita por outra pessoa,
   * devolve outro conjunto. Se `meus` fosse acucar para preencher `dono`, esta
   * diferenca dependeria de quem chama escrever a identidade certa.
   */
  it('o mesmo recorte devolve conjuntos diferentes para pessoas diferentes', async () => {
    const daAna: Principal = { identity: 'ana@empresa.com', role: 'agente', origin: 'mcp' }

    const doBruno = await buscar({ ...padrao, recorte: 'meus' }, bruno)
    const daAnaSaida = await buscar({ ...padrao, recorte: 'meus' }, daAna)

    expect(doBruno.itens.map((i) => i.numero)).toEqual([1001])
    expect(daAnaSaida.itens.map((i) => i.numero)).toEqual([1003])
  })

  /**
   * O Solicitante nunca recebe atribuicao (2.3), entao `meus` e vazio para ele
   * — e NAO "os que eu abri", que ja sao o escopo padrao dele.
   */
  it('o Solicitante com meus recebe vazio, nao os que abriu (AC #4)', async () => {
    const comRecorte = await buscar({ ...padrao, recorte: 'meus' }, marina)
    const semRecorte = await buscar(padrao, marina)

    expect(comRecorte.itens).toEqual([])
    expect(semRecorte.itens.map((i) => i.numero)).toEqual([1000, 1001])
  })

  /**
   * O TESTE QUE IMPORTA para o vazamento: recorte e escopo se SOMAM. Um
   * Solicitante pedindo "sem dono" recebe os DELE sem Dono — se o recorte
   * substituisse o escopo, viria o 1002, que e do Carlos.
   */
  it('o recorte nao amplia o escopo (AC #5)', async () => {
    const saida = await buscar({ ...padrao, recorte: 'sem_dono' }, marina)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000])
  })

  it('o recorte se combina com os filtros da 3.1', async () => {
    await inserir([
      { numero: 1004, requester: 'carlos@empresa.com', assignee: null, status: 'em_andamento' },
    ])

    const saida = await buscar({ ...padrao, recorte: 'sem_dono', status: 'em_andamento' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1004])
  })

  it('o filtro por dono explicito continua funcionando', async () => {
    const saida = await buscar({ ...padrao, dono: 'ana@empresa.com' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1003])
  })

  /**
   * O TESTE que a mutacao pediu. Pela saida, fazer o recorte SUBSTITUIR o
   * escopo nao muda nada: `filaVisivelPara` descarta o Chamado alheio que
   * entraria — o gargalo mascara, exatamente como na 3.1 com o `WHERE` do
   * escopo.
   *
   * A saida e a mesma: chamar o repositorio DIRETO e abrir com um Agente, que
   * ve tudo. O que sobrar veio do SQL.
   */
  it('escopo e recorte se somam no proprio WHERE (AC #5)', async () => {
    const bruta = await repositorio.buscarFilaBruta(
      { tipo: 'apenasDe', requester: 'marina@empresa.com' },
      { dono: { tipo: 'ninguem' } },
      { limite: 20, deslocamento: 0, ordem: 'asc' },
    )

    // 1000 e da marina e sem Dono; 1002 e sem Dono mas do carlos.
    expect(filaVisivelPara(bruno, bruta).itens.map((i) => i.number)).toEqual([1000])
  })

  it('recorte com dono e recusado (AC #3)', async () => {
    await expect(
      buscar({ ...padrao, recorte: 'sem_dono', dono: 'ana@empresa.com' }, bruno),
    ).rejects.toThrow(/recorte/)
  })
})

describe('ordem estavel (AC #5)', () => {
  /**
   * Insere FORA de ordem, com timestamps IGUAIS: sem o desempate por Numero, o
   * Postgres devolve na ordem fisica e o teste passa por acaso — ate parar de
   * passar (licao da 1.2).
   */
  it('desempata por Numero quando a data e a mesma', async () => {
    await inserir([
      { numero: 1003, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
      { numero: 1001, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
      { numero: 1002, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
    ])

    const saida = await buscar(padrao, marina)

    expect(saida.itens.map((i) => i.numero)).toEqual([1001, 1002, 1003])
  })

  it('o mais antigo vem primeiro por padrao, como se atende uma fila', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', criadoEm: '2026-08-18T12:00:00Z' },
      { numero: 1001, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
    ])

    expect((await buscar(padrao, marina)).itens.map((i) => i.numero)).toEqual([1001, 1000])
  })

  it('ordem desc inverte, mantendo o desempate', async () => {
    await inserir([
      { numero: 1000, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
      { numero: 1001, requester: 'marina@empresa.com', criadoEm: '2026-08-18T09:00:00Z' },
    ])

    const saida = await buscar({ ...padrao, ordem: 'desc' }, marina)

    expect(saida.itens.map((i) => i.numero)).toEqual([1001, 1000])
  })
})

describe('paginacao (AC #4)', () => {
  beforeEach(async () => {
    await inserir(
      Array.from({ length: 25 }, (_, i) => ({
        numero: 1000 + i,
        requester: 'marina@empresa.com',
        criadoEm: `2026-08-18T09:${String(i).padStart(2, '0')}:00Z`,
      })),
    )
  })

  it('o padrao devolve 20 e avisa que ha mais', async () => {
    const saida = await buscar(padrao, marina)

    expect(saida.itens).toHaveLength(20)
    expect(saida.temMais).toBe(true)
  })

  it('a ultima pagina nao mente sobre haver mais', async () => {
    const saida = await buscar({ ...padrao, deslocamento: 20 }, marina)

    expect(saida.itens).toHaveLength(5)
    expect(saida.temMais).toBe(false)
  })

  /** Ordem estavel + deslocamento: nenhuma linha se repete nem some. */
  it('as paginas nao se sobrepoem nem deixam buraco', async () => {
    const p1 = await buscar({ ...padrao, limite: 10 }, marina)
    const p2 = await buscar({ ...padrao, limite: 10, deslocamento: 10 }, marina)
    const p3 = await buscar({ ...padrao, limite: 10, deslocamento: 20 }, marina)

    const todos = [...p1.itens, ...p2.itens, ...p3.itens].map((i) => i.numero)

    expect(new Set(todos).size).toBe(25)
    expect(todos).toEqual([...todos].sort((a, b) => a - b))
  })
})

describe('o teto do limite e do CONTRATO (AC #4)', () => {
  /**
   * Recusa, e nao truncamento: pedir 500 e receber 100 em silencio faria a IA
   * concluir que viu tudo.
   */
  it('limite acima de 100 e recusado pelo schema', () => {
    expect(buscarChamadosInputSchema.safeParse({ limite: 101 }).success).toBe(false)
    expect(buscarChamadosInputSchema.safeParse({ limite: 100 }).success).toBe(true)
  })

  it('os defaults sao 20, 0 e asc', () => {
    expect(buscarChamadosInputSchema.parse({})).toEqual({
      limite: 20,
      deslocamento: 0,
      ordem: 'asc',
    })
  })
})

/**
 * Story 3.4 — busca textual (FR-11).
 *
 * O caso do Comentario Interno vem PRIMEIRO porque e a razao de a story existir
 * do jeito que existe: o gargalo do dominio nao pega esse vazamento.
 */
describe('busca textual (Story 3.4)', () => {
  beforeEach(async () => {
    await inserir([
      {
        numero: 1000,
        requester: 'marina@empresa.com',
        titulo: 'VPN nao conecta',
        descricao: 'Erro ao entrar na rede.',
      },
      {
        numero: 1001,
        requester: 'marina@empresa.com',
        titulo: 'Notebook lento',
        descricao: 'Demora para abrir a VPN tambem.',
      },
      {
        numero: 1002,
        requester: 'carlos@empresa.com',
        titulo: 'Impressora',
        descricao: 'Sem toner.',
        status: 'fechado',
      },
    ])
  })

  it('casa no Titulo e na Descricao (AC #1)', async () => {
    const saida = await buscar({ ...padrao, texto: 'VPN' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1001])
  })

  it('casa em Comentario publico', async () => {
    await comentar(1002, 'Troquei o toner e a impressora voltou.')

    const saida = await buscar({ ...padrao, texto: 'toner' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1002])
  })

  /**
   * O TESTE CENTRAL da story. O Comentario Interno e do Chamado DELA, entao
   * `filaVisivelPara` deixa passar sem hesitar: ele sabe de posse e exclusao,
   * nao de conteudo. Se o recorte nao estiver no `WHERE`, ela descobre que a
   * conversa do time fala de "juridico".
   */
  it('Comentario INTERNO nao faz o Chamado casar para o Solicitante (AC #2)', async () => {
    await comentar(1000, 'Cliente insistente, escalar para o juridico.', { interno: true })

    const dela = await buscar({ ...padrao, texto: 'juridico' }, marina)
    const dele = await buscar({ ...padrao, texto: 'juridico' }, bruno)

    expect(dela.itens).toEqual([])
    // Para o Agente, que ja pode ler a conversa, o resultado nao conta nada novo.
    expect(dele.itens.map((i) => i.numero)).toEqual([1000])
  })

  it('Comentario EXCLUIDO nao faz o Chamado casar, nem para o Agente (AC #3)', async () => {
    await comentar(1002, 'Palavra rarissima: xilofone.', { excluido: true })

    const saida = await buscar({ ...padrao, texto: 'xilofone' }, bruno)

    expect(saida.itens).toEqual([])
  })

  /**
   * FR-11 existe para "nao reabrir um problema ja resolvido": a busca PRECISA
   * alcancar o que ja foi encerrado. Este teste existe para impedir que alguem
   * "conserte" isso copiando o filtro de carga do resumo (3.3).
   */
  it('encerrados aparecem na busca (AC #1)', async () => {
    const saida = await buscar({ ...padrao, texto: 'Impressora' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1002])
  })

  it('acha pelo numero do sistema anterior (AC #4)', async () => {
    await inserir([
      { numero: 1003, requester: 'marina@empresa.com', numeroLegado: 'INC-4711' },
      { numero: 1004, requester: 'marina@empresa.com', numeroLegado: 'INC-47110' },
    ])

    const saida = await buscar({ ...padrao, texto: 'INC-4711' }, bruno)

    // IGUALDADE, nao trigrama: o 1004 tem um numero legado que CONTEM o termo.
    expect(saida.itens.map((i) => i.numero)).toEqual([1003])
  })

  /** O texto se soma ao escopo — nunca o amplia. */
  it('o Solicitante busca apenas dentro do que alcanca (AC #5)', async () => {
    await inserir([{ numero: 1005, requester: 'carlos@empresa.com', titulo: 'VPN do carlos' }])

    const saida = await buscar({ ...padrao, texto: 'VPN' }, marina)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1001])
  })

  it('o texto se combina com filtro e recorte (AC #5)', async () => {
    const saida = await buscar({ ...padrao, texto: 'VPN', status: 'aberto' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1001])

    const comRecorte = await buscar({ ...padrao, texto: 'VPN', recorte: 'sem_dono' }, bruno)
    expect(comRecorte.itens.map((i) => i.numero)).toEqual([1000, 1001])
  })

  /**
   * Pela saida, fazer o texto SUBSTITUIR o escopo nao muda nada: o Chamado
   * alheio que entraria e descartado por `filaVisivelPara`. O gargalo mascara —
   * como na 3.1 com o `WHERE` do escopo e na 3.2 com o recorte.
   *
   * Chamar o repositorio DIRETO e abrir com um Agente e o que isola: o que
   * sobrar veio do SQL.
   */
  it('escopo e busca se somam no proprio WHERE (AC #5)', async () => {
    await inserir([{ numero: 1006, requester: 'carlos@empresa.com', titulo: 'VPN do carlos' }])

    const bruta = await repositorio.buscarFilaBruta(
      { tipo: 'apenasDe', requester: 'marina@empresa.com' },
      { dono: { tipo: 'qualquer' }, busca: { termo: 'VPN', comentarios: 'todos' } },
      { limite: 20, deslocamento: 0, ordem: 'asc' },
    )

    expect(filaVisivelPara(bruno, bruta).itens.map((i) => i.number)).toEqual([1000, 1001])
  })

  it('termo vazio e recusado pelo dominio', async () => {
    await expect(buscar({ ...padrao, texto: '   ' }, bruno)).rejects.toThrow(/termo/i)
  })

  it('a busca ignora maiusculas', async () => {
    const saida = await buscar({ ...padrao, texto: 'vpn' }, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000, 1001])
  })
})

describe('a Fila usa INDICE, nao varredura (AC #6)', () => {
  /**
   * O pilar Performatico nunca foi exercitado neste projeto (QUALITY-GATE
   * §3.1). Este e o primeiro teste que o toca — e ele so significa alguma coisa
   * COM VOLUME: com 20 linhas o planejador escolhe `Seq Scan` de qualquer jeito,
   * porque ler a tabela inteira e mais barato que consultar o indice.
   *
   * `enable_seqscan = off` NAO e opcao: testaria o `SET`, nao o indice.
   */
  beforeEach(async () => {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester, assignee, criado_em)
      SELECT
        i, 'Chamado ' || i, 'descricao', 'hardware',
        CASE WHEN i % 50 = 0 THEN 'resolvido' ELSE 'aberto' END,
        'media',
        'pessoa' || (i % 200) || '@empresa.com',
        -- "Sem Dono" e MINORIA (1 em 10), como numa fila real: se quase nada
        -- tivesse Dono, o planejador escolheria varredura com razao, e o teste
        -- estaria medindo o dado, nao o indice.
        CASE WHEN i % 10 = 0 THEN NULL ELSE 'agente' || (i % 8) || '@empresa.com' END,
        now() - (i || ' minutes')::interval
      FROM generate_series(1, 5000) AS i
    `)
    await db.execute(sql`ANALYZE tickets`)
  })

  const plano = async (consulta: ReturnType<typeof sql>): Promise<string> => {
    const linhas = await db.execute(consulta)
    return linhas.map((l) => String(Object.values(l)[0])).join('\n')
  }

  it('o filtro por status seletivo usa Index Scan', async () => {
    const texto = await plano(sql`
      EXPLAIN SELECT number FROM tickets
       WHERE deleted_at IS NULL AND status = 'resolvido'
       ORDER BY criado_em, number LIMIT 21
    `)

    expect(texto).toContain('tickets_fila_status_idx')
    expect(texto).not.toContain('Seq Scan')
  })

  /**
   * Story 3.2 — `assignee IS NULL` tambem precisa do indice. B-tree do Postgres
   * indexa NULL, entao ele PODE usar `tickets_fila_assignee_idx` — mas "pode"
   * nao e "usa", e a diferenca so aparece com volume.
   *
   * Os dados fazem "sem Dono" ser MINORIA (1 em 10), e sao gerados assim no
   * INSERT: uma primeira versao deste teste usava `UPDATE` para atribuir Dono
   * depois, e o bloat resultante dobrou as paginas da tabela — o planejador
   * passou a preferir varredura, e o teste reprovava medindo o bloat, nao o
   * indice.
   */
  it('o recorte sem_dono usa Index Scan', async () => {
    const texto = await plano(sql`
      EXPLAIN SELECT number FROM tickets
       WHERE deleted_at IS NULL AND assignee IS NULL
       ORDER BY criado_em, number LIMIT 21
    `)

    expect(texto).toContain('tickets_fila_assignee_idx')
    expect(texto).not.toContain('Seq Scan')
  })

  it('o escopo do Solicitante usa Index Scan', async () => {
    const texto = await plano(sql`
      EXPLAIN SELECT number FROM tickets
       WHERE deleted_at IS NULL AND requester = 'pessoa7@empresa.com'
       ORDER BY criado_em, number LIMIT 21
    `)

    expect(texto).toContain('tickets_fila_requester_idx')
    expect(texto).not.toContain('Seq Scan')
  })
})

/**
 * Story 3.4 — o indice de trigramas (AC #6).
 *
 * Bloco proprio porque o dado e outro: `ILIKE '%termo%'` so vale a pena indexar
 * quando a tabela e grande o bastante para a varredura ficar cara, e quando o
 * TEXTO e realista. Com 5.000 linhas de titulo curto ("Chamado 42"), o
 * planejador varre — e acerta.
 *
 * Medido em 2026-08-18: com 20.000 linhas de titulo longo, o plano passa a usar
 * `Bitmap Index Scan` no indice GIN. O termo precisa ter tres caracteres ou
 * mais (trigrama e isso) e ser seletivo.
 */
describe('a busca textual usa o indice GIN (AC #6)', () => {
  beforeEach(async () => {
    await db.execute(sql`
      INSERT INTO tickets (number, titulo, descricao, categoria, status, priority, requester)
      SELECT
        i,
        'Chamado sobre problema recorrente numero ' || i || ' na estacao de trabalho',
        'descricao do problema relatado pelo solicitante',
        'hardware', 'aberto', 'media',
        'pessoa' || (i % 200) || '@empresa.com'
      FROM generate_series(1, 20000) AS i
    `)
    await db.execute(sql`ANALYZE tickets`)
  })

  it('o ILIKE no titulo usa tickets_busca_titulo_idx', async () => {
    const linhas = await db.execute(sql`
      EXPLAIN SELECT number FROM tickets
       WHERE deleted_at IS NULL AND titulo ILIKE '%14711%'
       ORDER BY criado_em, number LIMIT 21
    `)
    const texto = linhas.map((l) => String(Object.values(l)[0])).join('\n')

    expect(texto).toContain('tickets_busca_titulo_idx')
    expect(texto).not.toContain('Seq Scan')
  })
})
