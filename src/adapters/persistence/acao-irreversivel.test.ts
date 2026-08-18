import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { acaoIrreversivel } from '../../application/commands/acao-irreversivel.js'
import { mudarPrioridade } from '../../application/commands/mudar-prioridade.js'
import { mudarStatus } from '../../application/commands/mudar-status.js'
import type { Principal } from '../../application/contracts/principal.js'
import { verHistorico } from '../../application/queries/ver-historico.js'
import { ehDomainError } from '../../domain/errors.js'
import {
  consumirConfirmacao,
  emitirConfirmacao,
  VALIDADE_DA_CONFIRMACAO_MS,
} from '../../platform/confirmacao/confirmacao-de-acao.js'
import { criarConfirmacaoRepository } from './confirmacao-repository.js'
import { criarTicketRepository } from './ticket-repository.js'

/**
 * O AD-7 contra o Postgres REAL (Story 2.6).
 *
 * O escopo do token — outra acao, outro Chamado, outra identidade — e o uso
 * unico vivem no `WHERE` do consumo. Com duble, "o token nao serve" seria
 * apenas o que o duble foi programado para dizer; aqui e o banco que recusa.
 */
const url =
  process.env.DATABASE_URL ?? 'postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
const sqlClient = postgres(url, { max: 4 })
const db = drizzle(sqlClient)
const repositorio = criarTicketRepository(db)
const confirmacoes = criarConfirmacaoRepository(db)

const AGORA = new Date('2026-08-18T12:00:00.000Z')
let relogio = AGORA

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const ana: Principal = { identity: 'ana@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const confirmacao = {
  emitir: emitirConfirmacao({ repositorio: confirmacoes, agora: () => relogio }),
  consumir: consumirConfirmacao({ repositorio: confirmacoes, agora: () => relogio }),
}

const executar = acaoIrreversivel({ repositorio, confirmacao })
const mudar = mudarStatus({ repositorio })

const abrir = () =>
  abrirChamado({ repositorio })(
    { titulo: 'Notebook nao liga', descricao: 'Sem resposta ao botao.', categoria: 'hardware' },
    marina,
  )

const erroDe = async (promessa: Promise<unknown>): Promise<Error> => {
  try {
    await promessa
  } catch (erro) {
    if (ehDomainError(erro)) return erro
    throw erro
  }
  throw new Error('Esperava erro de dominio, mas a operacao passou.')
}

/** Extrai o token da mensagem — e a unica vez que ele existe. */
const tokenDa = (erro: Error): string => {
  const achado = /confirmacao="([^"]+)"/.exec(erro.message)
  if (achado?.[1] === undefined) {
    throw new Error(`A mensagem nao trouxe token: ${erro.message}`)
  }
  return achado[1]
}

/** Leva o Chamado ate `resolvido`, que e de onde se fecha. */
const ateResolvido = async () => {
  const { number } = await abrir()
  const emAndamento = await mudar({ numero: number, novoStatus: 'em_andamento', versao: 1 }, bruno)
  const resolvido = await mudar(
    { numero: number, novoStatus: 'resolvido', versao: emAndamento.versao },
    bruno,
  )
  return { numero: number, versao: resolvido.versao }
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE tickets, audit_entries, comments, confirmacoes RESTART IDENTITY`)
  await db.execute(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1000`)
  relogio = AGORA
})

afterAll(async () => {
  await sqlClient.end()
})

/**
 * Assercao contra o CATALOGO do banco, provando os DOIS lados: que a estrutura
 * existe e que ela tem a restricao esperada (padrao da 1.7).
 */
describe('o schema da confirmacao (AC #2, #3)', () => {
  it('confirmacoes existe com token_hash UNIQUE', async () => {
    const colunas = await db.execute(sql`
      SELECT column_name, is_nullable
        FROM information_schema.columns
       WHERE table_name = 'confirmacoes'
    `)

    const nomes = colunas.map((c) => c.column_name)
    expect(nomes).toEqual(
      expect.arrayContaining(['ticket_number', 'acao', 'identity', 'token_hash', 'expira_em']),
    )

    const unicos = await db.execute(sql`
      SELECT indexdef FROM pg_indexes
       WHERE tablename = 'confirmacoes' AND indexdef LIKE '%UNIQUE%token_hash%'
    `)
    expect(unicos).toHaveLength(1)
  })

  it('audit_entries.motivo existe e e nula', async () => {
    const linhas = await db.execute(sql`
      SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'audit_entries' AND column_name = 'motivo'
    `)

    expect(linhas).toHaveLength(1)
    // NULA de proposito: so `reabrir_chamado` a preenche, e '' seria inventar
    // um dado que ninguem informou.
    expect(linhas[0]?.is_nullable).toBe('YES')
  })
})

describe('as duas fases, ponta a ponta (AC #1, #2, #5)', () => {
  it('a primeira chamada nao muda nada, a segunda fecha', async () => {
    const { numero, versao } = await ateResolvido()

    const pedido = await erroDe(executar('fechar_chamado')({ numero, versao }, bruno))
    expect(ehDomainError(pedido) && pedido.code).toBe('ConfirmationRequired')

    // NADA mudou: nem Status, nem versao.
    const [antes] = await db.execute(
      sql`SELECT status, version FROM tickets WHERE number = ${numero}`,
    )
    expect(antes?.status).toBe('resolvido')
    expect(antes?.version).toBe(versao)

    const saida = await executar('fechar_chamado')(
      { numero, versao, confirmacao: tokenDa(pedido) },
      bruno,
    )

    expect(saida.para).toBe('fechado')
    const [depois] = await db.execute(
      sql`SELECT status, version FROM tickets WHERE number = ${numero}`,
    )
    expect(depois?.status).toBe('fechado')
    expect(depois?.version).toBe(versao + 1)
  })

  /**
   * As DUAS etapas no Log (AC #5). E o unico jeito de ver que a IA confirmou
   * sozinha: o intervalo entre `solicitar_confirmacao` e a acao.
   */
  it('o Log registra o pedido E a execucao, com autor e origem', async () => {
    const { numero, versao } = await ateResolvido()
    const pedido = await erroDe(executar('fechar_chamado')({ numero, versao }, bruno))
    await executar('fechar_chamado')({ numero, versao, confirmacao: tokenDa(pedido) }, bruno)

    const historico = await verHistorico({ repositorio })({ numero }, bruno)
    const acoes = historico.entradas.map((e) => e.acao)

    expect(acoes).toContain('solicitar_confirmacao')
    expect(acoes).toContain('fechar_chamado')

    const solicitacao = historico.entradas.find((e) => e.acao === 'solicitar_confirmacao')
    expect(solicitacao?.autor).toBe('bruno@empresa.com')
    expect(solicitacao?.origin).toBe('mcp')
    // O par de/para do PEDIDO diz o que se pretendia fazer.
    expect(solicitacao?.de).toBe('resolvido')
    expect(solicitacao?.para).toBe('fechado')
  })

  it('reabrir grava o motivo no Log', async () => {
    const { numero, versao } = await ateResolvido()
    const pedidoFechar = await erroDe(executar('fechar_chamado')({ numero, versao }, bruno))
    const fechado = await executar('fechar_chamado')(
      { numero, versao, confirmacao: tokenDa(pedidoFechar) },
      bruno,
    )

    const pedidoReabrir = await erroDe(
      executar('reabrir_chamado')(
        { numero, versao: fechado.versao, motivo: 'O problema voltou depois de dois dias.' },
        bruno,
      ),
    )
    await executar('reabrir_chamado')(
      {
        numero,
        versao: fechado.versao,
        motivo: 'O problema voltou depois de dois dias.',
        confirmacao: tokenDa(pedidoReabrir),
      },
      bruno,
    )

    const [linha] = await db.execute(
      sql`SELECT motivo FROM audit_entries WHERE acao = 'reabrir_chamado' AND ticket_number = ${numero}`,
    )
    expect(linha?.motivo).toBe('O problema voltou depois de dois dias.')

    // E o Chamado voltou ao atendimento (FR-7).
    const [ticket] = await db.execute(sql`SELECT status FROM tickets WHERE number = ${numero}`)
    expect(ticket?.status).toBe('em_andamento')
  })

  /** Fechar e cancelar nao tem motivo: a coluna fica NULA, nao vazia. */
  it('fechar deixa o motivo nulo', async () => {
    const { numero, versao } = await ateResolvido()
    const pedido = await erroDe(executar('fechar_chamado')({ numero, versao }, bruno))
    await executar('fechar_chamado')({ numero, versao, confirmacao: tokenDa(pedido) }, bruno)

    const [linha] = await db.execute(
      sql`SELECT motivo FROM audit_entries WHERE acao = 'fechar_chamado' AND ticket_number = ${numero}`,
    )
    expect(linha?.motivo).toBeNull()
  })
})

describe('o escopo do token (AC #3)', () => {
  /**
   * O token e do MESMO Chamado e da MESMA identidade: so a acao difere. Sem
   * isso o teste seria barrado pelo filtro de `ticket_number` antes de tocar no
   * de `acao` — e uma mutacao que removesse o filtro de acao sobreviveria
   * (foi o que aconteceu na primeira versao desta suite).
   *
   * Nenhum estado aceita duas acoes irreversiveis ao mesmo tempo, entao o
   * caminho e emitir num estado e tentar usar em outro: pedir para CANCELAR um
   * Chamado em andamento, resolve-lo, e tentar FECHAR com aquele token.
   */
  it('confirmacao de CANCELAR nao serve para FECHAR o mesmo Chamado', async () => {
    const { number } = await abrir()
    const emAndamento = await mudar(
      { numero: number, novoStatus: 'em_andamento', versao: 1 },
      bruno,
    )

    const pedidoCancelar = await erroDe(
      executar('cancelar_chamado')({ numero: number, versao: emAndamento.versao }, bruno),
    )
    const token = tokenDa(pedidoCancelar)

    const resolvido = await mudar(
      { numero: number, novoStatus: 'resolvido', versao: emAndamento.versao },
      bruno,
    )

    const erro = await erroDe(
      executar('fechar_chamado')(
        { numero: number, versao: resolvido.versao, confirmacao: token },
        bruno,
      ),
    )

    expect(ehDomainError(erro) && erro.code).toBe('ConfirmationRequired')
    const [linha] = await db.execute(sql`SELECT status FROM tickets WHERE number = ${number}`)
    expect(linha?.status).toBe('resolvido')
  })

  it('confirmacao de OUTRO Chamado nao serve', async () => {
    const a = await ateResolvido()
    const b = await ateResolvido()

    const pedido = await erroDe(
      executar('fechar_chamado')({ numero: a.numero, versao: a.versao }, bruno),
    )

    const erro = await erroDe(
      executar('fechar_chamado')(
        { numero: b.numero, versao: b.versao, confirmacao: tokenDa(pedido) },
        bruno,
      ),
    )

    expect(ehDomainError(erro) && erro.code).toBe('ConfirmationRequired')
  })

  /**
   * Confirmacao nao e transferivel: quem pediu e quem executa. Sem isso, um
   * Agente poderia colher o aval dado a outro.
   */
  it('confirmacao de OUTRA identidade nao serve', async () => {
    const { numero, versao } = await ateResolvido()
    const pedido = await erroDe(executar('fechar_chamado')({ numero, versao }, bruno))

    const erro = await erroDe(
      executar('fechar_chamado')({ numero, versao, confirmacao: tokenDa(pedido) }, ana),
    )

    expect(ehDomainError(erro) && erro.code).toBe('ConfirmationRequired')
  })

  it('confirmacao usada nao serve de novo', async () => {
    const { numero, versao } = await ateResolvido()
    const pedido = await erroDe(executar('fechar_chamado')({ numero, versao }, bruno))
    const token = tokenDa(pedido)

    const fechado = await executar('fechar_chamado')({ numero, versao, confirmacao: token }, bruno)

    // Reabrir para tentar fechar de novo com o MESMO token.
    const pedidoReabrir = await erroDe(
      executar('reabrir_chamado')({ numero, versao: fechado.versao, motivo: 'teste' }, bruno),
    )
    const reaberto = await executar('reabrir_chamado')(
      { numero, versao: fechado.versao, motivo: 'teste', confirmacao: tokenDa(pedidoReabrir) },
      bruno,
    )
    const resolvido = await mudar(
      { numero, novoStatus: 'resolvido', versao: reaberto.versao },
      bruno,
    )

    const erro = await erroDe(
      executar('fechar_chamado')({ numero, versao: resolvido.versao, confirmacao: token }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('ConfirmationRequired')
  })

  it('confirmacao expirada nao serve', async () => {
    const { numero, versao } = await ateResolvido()
    const pedido = await erroDe(executar('fechar_chamado')({ numero, versao }, bruno))

    // Um milissegundo depois do prazo.
    relogio = new Date(AGORA.getTime() + VALIDADE_DA_CONFIRMACAO_MS + 1)

    const erro = await erroDe(
      executar('fechar_chamado')({ numero, versao, confirmacao: tokenDa(pedido) }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('ConfirmationRequired')
    const [linha] = await db.execute(sql`SELECT status FROM tickets WHERE number = ${numero}`)
    expect(linha?.status).toBe('resolvido')
  })

  /**
   * Duas execucoes simultaneas com o MESMO token: o consumo e atomico
   * (`UPDATE ... WHERE usado_em IS NULL`), entao so uma casa. Ler-e-depois-
   * marcar deixaria as duas passarem — e a mesma confirmacao executaria duas
   * acoes irreversiveis.
   */
  it('o mesmo token nao executa duas vezes em paralelo', async () => {
    const { numero, versao } = await ateResolvido()
    const pedido = await erroDe(executar('fechar_chamado')({ numero, versao }, bruno))
    const token = tokenDa(pedido)

    const resultados = await Promise.allSettled([
      executar('fechar_chamado')({ numero, versao, confirmacao: token }, bruno),
      executar('fechar_chamado')({ numero, versao, confirmacao: token }, bruno),
    ])

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)

    const encerramentos = await db.execute(
      sql`SELECT id FROM audit_entries WHERE acao = 'fechar_chamado' AND ticket_number = ${numero}`,
    )
    expect(encerramentos).toHaveLength(1)
  })
})

describe('nada e emitido para quem nao pode (AC #4)', () => {
  it('o Solicitante nao gera confirmacao nenhuma', async () => {
    const { numero, versao } = await ateResolvido()

    await erroDe(executar('fechar_chamado')({ numero, versao }, marina))

    const linhas = await db.execute(sql`SELECT id FROM confirmacoes`)
    expect(linhas).toHaveLength(0)
    // E nem registro de pedido no Log: o pedido nao aconteceu.
    const log = await db.execute(
      sql`SELECT id FROM audit_entries WHERE acao = 'solicitar_confirmacao'`,
    )
    expect(log).toHaveLength(0)
  })
})

describe('a porta dos fundos continua fechada (AC #6)', () => {
  /**
   * A Story 2.2 recusou fechar/cancelar/reabrir em `mudar_status` quando as
   * acoes dedicadas ainda nao existiam. Agora que existem, a recusa precisa
   * continuar — senao a tool generica seria o caminho sem confirmacao.
   */
  it.each(['fechado', 'cancelado'] as const)(
    'mudar_status ainda recusa ir para %s',
    async (destino) => {
      const { numero, versao } = await ateResolvido()

      const erro = await erroDe(mudar({ numero, novoStatus: destino, versao }, bruno))

      expect(ehDomainError(erro) && erro.code).toBe('TransicaoInvalida')
      const [linha] = await db.execute(sql`SELECT status FROM tickets WHERE number = ${numero}`)
      expect(linha?.status).toBe('resolvido')
    },
  )

  it('mudar_status ainda recusa reabrir um Chamado fechado', async () => {
    const { numero, versao } = await ateResolvido()
    const pedido = await erroDe(executar('fechar_chamado')({ numero, versao }, bruno))
    const fechado = await executar('fechar_chamado')(
      { numero, versao, confirmacao: tokenDa(pedido) },
      bruno,
    )

    const erro = await erroDe(
      mudar({ numero, novoStatus: 'em_andamento', versao: fechado.versao }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('TransicaoInvalida')
  })
})

describe('conflito de versao (AD-10)', () => {
  /**
   * A confirmacao e consumida ANTES do UPDATE, e isso e deliberado: o humano
   * confirmou "fechar na versao N", e a versao mudou. Reaproveitar o aval seria
   * executa-lo sobre um Chamado que ja nao e o que ele viu.
   *
   * O que move a versao aqui e a PRIORIDADE, e nao o Status: mudar o Status
   * faria a transicao deixar de ser valida, e a recusa viria da maquina de
   * estados antes de o conflito existir — o teste passaria pelo motivo errado.
   */
  it('versao divergente vira Conflict, e o token JA queimou', async () => {
    const { numero, versao } = await ateResolvido()
    const pedido = await erroDe(executar('fechar_chamado')({ numero, versao }, bruno))
    const token = tokenDa(pedido)

    // Alguem mexe no Chamado no intervalo entre confirmar e executar. O Status
    // continua `resolvido`; so a versao andou.
    await mudarPrioridade({ repositorio })({ numero, prioridade: 'alta', versao }, bruno)

    const conflito = await erroDe(
      executar('fechar_chamado')({ numero, versao, confirmacao: token }, bruno),
    )
    expect(ehDomainError(conflito) && conflito.code).toBe('Conflict')

    // O token foi consumido mesmo assim: o aval era para a versao antiga.
    const [linha] = await db.execute(
      sql`SELECT usado_em FROM confirmacoes WHERE ticket_number = ${numero}`,
    )
    expect(linha?.usado_em).not.toBeNull()

    // E o Chamado NAO fechou.
    const [ticket] = await db.execute(sql`SELECT status FROM tickets WHERE number = ${numero}`)
    expect(ticket?.status).toBe('resolvido')
  })

  it('a confirmacao queimada nao serve na segunda tentativa', async () => {
    const { numero, versao } = await ateResolvido()
    const pedido = await erroDe(executar('fechar_chamado')({ numero, versao }, bruno))
    const token = tokenDa(pedido)

    const nova = await mudarPrioridade({ repositorio })(
      { numero, prioridade: 'alta', versao },
      bruno,
    )
    await erroDe(executar('fechar_chamado')({ numero, versao, confirmacao: token }, bruno))

    // Agora com a versao CERTA, e o mesmo token: continua recusado. Quem
    // confirmou precisa confirmar de novo.
    const erro = await erroDe(
      executar('fechar_chamado')({ numero, versao: nova.versao, confirmacao: token }, bruno),
    )

    expect(ehDomainError(erro) && erro.code).toBe('ConfirmationRequired')
  })
})
