import { beforeEach, describe, expect, it } from 'vitest'
import type { Status } from '../../domain/ticket.js'
import { embrulharBruto, type ItemDeExportacaoBruto } from '../../domain/visibilidade.js'
import { exportarCsvInputSchema } from '../contracts/exportar-csv.js'
import type { Principal } from '../contracts/principal.js'
import { exportarCsv } from './exportar-csv.js'

/**
 * A SEGUNDA camada do AD-8 no export, e o que a query PEDE.
 *
 * As duas coisas precisam de duble: com o `WHERE` correto, o gargalo e o escopo
 * dao o mesmo resultado e se mascaram (licao da 3.5). Foi assim que "o export
 * pede sempre 'todos'" sobreviveu na primeira rodada de mutacao.
 */

const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }

const item = (number: number, requester: string): ItemDeExportacaoBruto => ({
  number,
  titulo: `Chamado ${number}`,
  descricao: 'descricao',
  categoria: 'hardware',
  status: 'aberto' as Status,
  prioridade: 'media',
  requester,
  assignee: null,
  criadoEm: new Date('2026-08-19T09:00:00.000Z'),
  numeroLegado: null,
  excluidoEm: null,
})

let pedido: { escopo: unknown; filtros: unknown; pagina: unknown } | null

const exportarCom = (itens: readonly ItemDeExportacaoBruto[]) =>
  exportarCsv({
    repositorio: {
      async buscarParaExportarBruto(escopo, filtros, pagina) {
        pedido = { escopo, filtros, pagina }
        return embrulharBruto({ itens, temMais: false })
      },
    },
  })

const padrao = exportarCsvInputSchema.parse({})

beforeEach(() => {
  pedido = null
})

describe('o escopo que o export PEDE (AC #2)', () => {
  /**
   * A mutacao "pede sempre todos" nao e pega pelos testes de saida: o gargalo
   * descarta o alheio depois. Quem a pega e esta assercao — mesmo padrao das
   * Stories 3.5 e 3.6.
   */
  it('o Solicitante exporta dentro do proprio escopo', async () => {
    await exportarCom([])(padrao, marina)

    expect(pedido?.escopo).toEqual({ tipo: 'apenasDe', requester: 'marina@empresa.com' })
  })

  it('o Agente exporta a base', async () => {
    await exportarCom([])(padrao, bruno)

    expect(pedido?.escopo).toEqual({ tipo: 'todos' })
  })
})

describe('o gargalo do dominio (AC #2)', () => {
  it('descarta Chamado alheio que o repositorio devolveu', async () => {
    const saida = await exportarCom([
      item(1000, 'marina@empresa.com'),
      item(1001, 'carlos@empresa.com'),
    ])(padrao, marina)

    expect(saida.linhas).toBe(1)
    expect(saida.csv).not.toContain('1001')
  })

  it('descarta Chamado excluido que o repositorio devolveu', async () => {
    const saida = await exportarCom([
      { ...item(1000, 'marina@empresa.com'), excluidoEm: new Date() },
      item(1001, 'marina@empresa.com'),
    ])(padrao, marina)

    expect(saida.linhas).toBe(1)
    expect(saida.csv).toContain('1001')
  })
})

describe('os limites do export sao proprios (AC #5)', () => {
  it('o padrao e 1.000, e nao os 100 da Fila', async () => {
    await exportarCom([])(padrao, bruno)

    expect(pedido?.pagina).toEqual({ limite: 1_000, deslocamento: 0 })
  })

  it('o cabecalho e repassado ao gerador', async () => {
    const semCabecalho = await exportarCom([item(1000, 'marina@empresa.com')])(
      { ...padrao, cabecalho: false },
      marina,
    )

    expect(semCabecalho.csv.startsWith('numero,')).toBe(false)
    expect(semCabecalho.csv.startsWith('1000,')).toBe(true)
  })
})
