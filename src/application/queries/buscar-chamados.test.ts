import { beforeEach, describe, expect, it } from 'vitest'
import type { Status } from '../../domain/ticket.js'
import { embrulharBruto, type ItemDaFilaBruto } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import { buscarChamados } from './buscar-chamados.js'

/**
 * A SEGUNDA camada do AD-8 na Fila (Story 3.1).
 *
 * O `WHERE` do escopo e do banco e esta em `adapters/persistence/fila.test.ts`.
 * Aqui se prova o que acontece quando ele FALHA: o repositorio devolve linha
 * alheia de proposito, e a query precisa descartar.
 */

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const item = (
  number: number,
  requester: string,
  extra: Partial<ItemDaFilaBruto> = {},
): ItemDaFilaBruto => ({
  number,
  titulo: `Chamado ${number}`,
  status: 'aberto' as Status,
  prioridade: 'media',
  requester,
  assignee: null,
  criadoEm: new Date('2026-08-18T09:00:00.000Z'),
  excluidoEm: null,
  ...extra,
})

let devolvidos: readonly ItemDaFilaBruto[]
let temMais: boolean
let recebido: { escopo: unknown; filtros: unknown; pagina: unknown } | null

const repositorio = {
  async buscarFilaBruta(escopo: unknown, filtros: unknown, pagina: unknown) {
    recebido = { escopo, filtros, pagina }
    return embrulharBruto({ itens: devolvidos, temMais })
  },
}

const buscar = buscarChamados({
  repositorio: repositorio as unknown as Parameters<typeof buscarChamados>[0]['repositorio'],
})

const pagina = { limite: 20, deslocamento: 0, ordem: 'asc' as const }

beforeEach(() => {
  devolvidos = []
  temMais = false
  recebido = null
})

describe('o escopo entregue ao repositorio (AC #2)', () => {
  it('o Agente pede "todos"', async () => {
    await buscar(pagina, bruno)

    expect(recebido?.escopo).toEqual({ tipo: 'todos' })
  })

  it('o Solicitante pede apenas os dele', async () => {
    await buscar(pagina, marina)

    expect(recebido?.escopo).toEqual({ tipo: 'apenasDe', requester: 'marina@empresa.com' })
  })
})

describe('o gargalo do dominio (AC #2)', () => {
  /**
   * O teste central da segunda camada. Se o `WHERE` fosse esquecido — adapter
   * novo, refatoracao, filtro perdido —, a lista chegaria com Chamado alheio, e
   * NADA na resposta denunciaria isso. Aqui o dominio corrige.
   */
  it('descarta o que o repositorio devolveu e nao era da pessoa', async () => {
    devolvidos = [item(1000, 'marina@empresa.com'), item(1001, 'carlos@empresa.com')]

    const saida = await buscar(pagina, marina)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000])
  })

  it('descarta Chamado excluido, mesmo para o Agente', async () => {
    devolvidos = [
      item(1000, 'marina@empresa.com'),
      item(1001, 'carlos@empresa.com', { excluidoEm: new Date() }),
    ]

    const saida = await buscar(pagina, bruno)

    expect(saida.itens.map((i) => i.numero)).toEqual([1000])
  })
})

describe('a forma da linha (AC #1)', () => {
  it('e um RESUMO: sem descricao, sem comentarios', async () => {
    devolvidos = [
      item(1042, 'marina@empresa.com', {
        titulo: 'Notebook nao liga',
        status: 'em_andamento' as Status,
        prioridade: 'alta',
        assignee: 'bruno@empresa.com',
      }),
    ]

    const saida = await buscar(pagina, bruno)

    expect(saida.itens[0]).toEqual({
      numero: 1042,
      titulo: 'Notebook nao liga',
      status: 'em_andamento',
      prioridade: 'alta',
      dono: 'bruno@empresa.com',
      criadoEm: '2026-08-18T09:00:00.000Z',
    })
  })

  it('data sai como string ISO (Consistency Conventions da spine)', async () => {
    devolvidos = [item(1000, 'marina@empresa.com')]

    const saida = await buscar(pagina, marina)

    expect(saida.itens[0]?.criadoEm).toBe('2026-08-18T09:00:00.000Z')
  })
})

describe('filtros e paginacao repassados (AC #1, #4)', () => {
  it('repassa os filtros informados', async () => {
    await buscar(
      { ...pagina, status: 'aberto', dono: 'bruno@empresa.com', categoria: 'rede' },
      bruno,
    )

    expect(recebido?.filtros).toEqual({
      status: 'aberto',
      // Story 3.2 — o Dono chega DECIDIDO pelo dominio, nao como string solta.
      dono: { tipo: 'identidade', identity: 'bruno@empresa.com' },
      categoria: 'rede',
    })
  })

  /**
   * Filtro ausente NAO vira `undefined` explicito: com
   * `exactOptionalPropertyTypes`, passar a chave com `undefined` e diferente de
   * nao passa-la — e o adapter monta o `WHERE` a partir da presenca.
   *
   * `dono` e a excecao a partir da 3.2: ele sempre viaja, porque "nao filtrar"
   * tambem e uma decisao do dominio (`{ tipo: 'qualquer' }`).
   */
  it('filtro ausente nao vira chave com undefined', async () => {
    await buscar(pagina, bruno)

    expect(recebido?.filtros).toEqual({ dono: { tipo: 'qualquer' } })
  })

  /** Story 3.2 — o recorte vira filtro de Dono, decidido no dominio. */
  it.each([
    ['meus', { tipo: 'identidade', identity: 'bruno@empresa.com' }],
    ['sem_dono', { tipo: 'ninguem' }],
  ] as const)('o recorte %s vira o filtro certo', async (recorte, esperado) => {
    await buscar({ ...pagina, recorte }, bruno)

    expect(recebido?.filtros).toEqual({ dono: esperado })
  })

  /**
   * A recusa vem do DOMINIO, e a query so a propaga — nao ha `.refine()` no
   * schema fazendo o mesmo trabalho em outro lugar.
   */
  it('recorte com dono e recusado antes de tocar o repositorio', async () => {
    await expect(
      buscar({ ...pagina, recorte: 'meus', dono: 'ana@empresa.com' }, bruno),
    ).rejects.toThrow(/recorte/)

    expect(recebido).toBeNull()
  })

  it('repassa limite, deslocamento e ordem', async () => {
    await buscar({ limite: 5, deslocamento: 10, ordem: 'desc' }, bruno)

    expect(recebido?.pagina).toEqual({ limite: 5, deslocamento: 10, ordem: 'desc' })
  })

  it('temMais atravessa do repositorio para a saida', async () => {
    devolvidos = [item(1000, 'marina@empresa.com')]
    temMais = true

    expect((await buscar(pagina, marina)).temMais).toBe(true)
  })
})
