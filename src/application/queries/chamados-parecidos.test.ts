import { beforeEach, describe, expect, it } from 'vitest'
import type { Status } from '../../domain/ticket.js'
import { embrulharBruto, type ItemDaFilaBruto } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import { chamadosParecidos } from './chamados-parecidos.js'

/**
 * A SEGUNDA camada do AD-8 na sugestao (Story 3.5).
 *
 * O `WHERE` da similaridade e do banco e esta em
 * `adapters/persistence/parecidos.test.ts`. Aqui se prova o que acontece quando
 * ele FALHA: o repositorio devolve Chamado alheio, e a query precisa descartar.
 *
 * Sem este teste, a mutacao "a query pula o gargalo" sobrevive — porque com o
 * `WHERE` correto as duas camadas dao o mesmo resultado e se mascaram.
 */

const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }

const item = (number: number, requester: string): ItemDaFilaBruto => ({
  number,
  titulo: `Chamado ${number}`,
  status: 'aberto' as Status,
  prioridade: 'media',
  requester,
  assignee: null,
  criadoEm: new Date('2026-08-19T09:00:00.000Z'),
  excluidoEm: null,
})

let recebido: { escopo: unknown; texto: string; limiar: number; limite: number } | null = null

const sugerirCom = (itens: readonly ItemDaFilaBruto[]) =>
  chamadosParecidos({
    repositorio: {
      async buscarParecidosBruto(entrada) {
        recebido = entrada
        return embrulharBruto({ itens, temMais: false })
      },
    },
  })

beforeEach(() => {
  recebido = null
})

describe('o escopo que a query envia (AC #2)', () => {
  /**
   * A mutacao "sugerir de toda a base" NAO e pega pelos testes de saida: o
   * gargalo descarta o alheio depois. Quem a pega e esta assercao sobre o que a
   * query PEDIU — e o mesmo padrao usado na Story 3.1.
   */
  it('o Solicitante pede sugestao apenas dentro do que alcanca', async () => {
    await sugerirCom([])({ texto: 'VPN nao conecta' }, marina)

    expect(recebido?.escopo).toEqual({ tipo: 'apenasDe', requester: 'marina@empresa.com' })
  })

  it('o Agente pede em toda a base', async () => {
    const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }

    await sugerirCom([])({ texto: 'VPN nao conecta' }, bruno)

    expect(recebido?.escopo).toEqual({ tipo: 'todos' })
  })

  it('o texto vai normalizado, com o limiar do dominio', async () => {
    await sugerirCom([])({ texto: '  VPN nao conecta  ' }, marina)

    expect(recebido?.texto).toBe('VPN nao conecta')
    expect(recebido?.limiar).toBe(0.3)
  })
})

describe('o gargalo do dominio (AC #2)', () => {
  it('descarta sugestao de Chamado alheio que o repositorio devolveu', async () => {
    const sugerir = sugerirCom([item(1000, 'marina@empresa.com'), item(1001, 'carlos@empresa.com')])

    const saida = await sugerir({ texto: 'VPN nao conecta' }, marina)

    expect(saida.parecidos.map((p) => p.numero)).toEqual([1000])
  })

  it('descarta Chamado excluido que o repositorio devolveu', async () => {
    const sugerir = sugerirCom([
      { ...item(1000, 'marina@empresa.com'), excluidoEm: new Date() },
      item(1001, 'marina@empresa.com'),
    ])

    const saida = await sugerir({ texto: 'VPN nao conecta' }, marina)

    expect(saida.parecidos.map((p) => p.numero)).toEqual([1001])
  })

  /** A ordem vem do SQL (por semelhanca) e o dominio NAO a refaz. */
  it('preserva a ordem em que o repositorio devolveu', async () => {
    const sugerir = sugerirCom([item(1005, 'marina@empresa.com'), item(1000, 'marina@empresa.com')])

    const saida = await sugerir({ texto: 'VPN nao conecta' }, marina)

    expect(saida.parecidos.map((p) => p.numero)).toEqual([1005, 1000])
  })
})
