import { describe, expect, it } from 'vitest'
import type { ChamadoImportado } from '../../domain/importacao.js'
import type { Principal } from '../contracts/principal.js'
import { importarCsv } from './importar-csv.js'

/**
 * O que o LOTE PARALELO introduziu, e que so aparece aqui (Story 4.2).
 *
 * O `claude-review` do PR #79 mostrou que o `for` sequencial fazia 5 viagens ao
 * Postgres por linha, uma esperando a outra. Paralelizar resolve — e cria dois
 * riscos novos, que sao exatamente o que estes testes medem:
 *
 * 1. **a ordem do relatorio** deixa de ser a do arquivo se ninguem a impuser,
 *    porque passa a ser a ordem em que o banco respondeu;
 * 2. **duas linhas com o mesmo `numero_legado` no mesmo lote** disputam o mesmo
 *    indice, e quem vence vira indeterminado.
 *
 * O teste de integracao nao pega nenhum dos dois de forma confiavel: com poucas
 * linhas o lote nao chega a embaralhar, e a corrida do indice as vezes resolve
 * "certo" por acaso. Aqui o duble torna os dois deterministas.
 */
const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }

const CABECALHO = 'numero_legado,titulo,descricao,solicitante'
const linha = (numeroLegado: string, titulo = 'VPN nao conecta') =>
  `${numeroLegado},${titulo},Sem acesso remoto.,marina@empresa.com`
const arquivo = (...linhas: string[]) => [CABECALHO, ...linhas].join('\n')

/**
 * Repositorio que responde FORA DE ORDEM de proposito: quanto mais tarde a
 * linha aparece no arquivo, mais rapido ele responde. E o pior caso do lote
 * paralelo, e o unico jeito de provar que a ordenacao do relatorio nao e
 * coincidencia.
 */
const repositorioQueInverteAOrdem = (total: number) => {
  const chamadas: string[] = []
  let proximoNumero = 5000

  return {
    chamadas,
    async importarComAuditoria(novo: ChamadoImportado) {
      chamadas.push(novo.numeroLegado)
      const posicao = Number(novo.numeroLegado.replace('INC-', ''))
      await new Promise((resolva) => setTimeout(resolva, (total - posicao) * 2))
      proximoNumero += 1
      return { number: proximoNumero }
    },
  }
}

describe('o relatorio segue o ARQUIVO, nao o banco', () => {
  it('mesmo com o banco respondendo na ordem inversa, as aceitas saem em ordem de linha', async () => {
    const repositorio = repositorioQueInverteAOrdem(6)
    const csv = arquivo(...Array.from({ length: 6 }, (_, i) => linha(`INC-${i + 1}`)))

    const saida = await importarCsv({ repositorio })({ csv }, bruno)

    expect(saida.aceitas.map((a) => a.linha)).toEqual([2, 3, 4, 5, 6, 7])
    expect(saida.aceitas.map((a) => a.numeroLegado)).toEqual([
      'INC-1',
      'INC-2',
      'INC-3',
      'INC-4',
      'INC-5',
      'INC-6',
    ])
  })

  it('rejeitadas e aceitas se intercalam no arquivo e cada lista sai ordenada', async () => {
    const repositorio = repositorioQueInverteAOrdem(4)
    const csv = arquivo(
      linha('INC-1'),
      linha('', 'sem numero legado'),
      linha('INC-2'),
      linha('INC-3', ''),
      linha('INC-4'),
    )

    const saida = await importarCsv({ repositorio })({ csv }, bruno)

    expect(saida.aceitas.map((a) => a.linha)).toEqual([2, 4, 6])
    expect(saida.rejeitadas.map((r) => r.linha)).toEqual([3, 5])
  })
})

describe('o mesmo numero_legado duas vezes no MESMO arquivo', () => {
  /**
   * Sem esta decisao, as duas linhas iriam ao banco no mesmo lote, colidiriam
   * no UNIQUE e o vencedor dependeria de qual transacao comitasse primeiro. A
   * contagem de chamadas e a sonda: ela distingue "o banco recusou a segunda"
   * de "a segunda nunca foi enviada".
   */
  it('so a PRIMEIRA ocorrencia vai ao banco; a segunda ja volta como repetida', async () => {
    const repositorio = repositorioQueInverteAOrdem(3)
    const csv = arquivo(
      linha('INC-1', 'o titulo que deve entrar'),
      linha('INC-1', 'o titulo que NAO deve entrar'),
      linha('INC-2'),
    )

    const saida = await importarCsv({ repositorio })({ csv }, bruno)

    expect(repositorio.chamadas).toEqual(['INC-1', 'INC-2'])
    expect(saida.aceitas.map((a) => a.linha)).toEqual([2, 4])
    expect(saida.repetidas).toEqual([{ linha: 3, numeroLegado: 'INC-1' }])
  })
})

describe('as duas fases de "repetida" se misturam no relatorio', () => {
  /**
   * `repetidas` e preenchida em DOIS momentos: na leitura do arquivo (duplicata
   * interna) e depois de cada lote (o `numero_legado` ja existia na base). Sem
   * ordenar, uma repetida interna da linha 5 aparece ANTES de uma repetida de
   * banco da linha 2 — o relatorio sai fora da ordem do arquivo justamente na
   * lista em que quem migra mais precisa conferir linha a linha.
   *
   * Este e o unico caso em que a ordem quebra de verdade: `Promise.all`
   * preserva a ordem do lote, e os lotes sao sequenciais.
   */
  it('a repetida de banco (linha 2) vem antes da repetida interna (linha 5)', async () => {
    const repositorio = {
      async importarComAuditoria(novo: ChamadoImportado) {
        // 'INC-JA-EXISTE' e o que a base ja tem: so ele volta null.
        return novo.numeroLegado === 'INC-JA-EXISTE' ? null : { number: 5000 }
      },
    }
    const csv = arquivo(
      linha('INC-JA-EXISTE'),
      linha('INC-NOVO'),
      linha('INC-DUPLA'),
      linha('INC-DUPLA', 'a segunda ocorrencia no arquivo'),
    )

    const saida = await importarCsv({ repositorio })({ csv }, bruno)

    expect(saida.repetidas).toEqual([
      { linha: 2, numeroLegado: 'INC-JA-EXISTE' },
      { linha: 5, numeroLegado: 'INC-DUPLA' },
    ])
  })
})

describe('o arquivo maior que um lote', () => {
  /**
   * `LINHAS_POR_LOTE` e 8. Um arquivo de 20 linhas atravessa tres lotes — e o
   * risco de um bug de fatiamento (perder a ultima fatia, ou repetir a
   * primeira) so aparece acima do tamanho do lote.
   */
  it('20 linhas entram todas, uma vez cada', async () => {
    const repositorio = repositorioQueInverteAOrdem(20)
    const csv = arquivo(...Array.from({ length: 20 }, (_, i) => linha(`INC-${i + 1}`)))

    const saida = await importarCsv({ repositorio })({ csv }, bruno)

    expect(saida.aceitas).toHaveLength(20)
    expect(new Set(repositorio.chamadas).size).toBe(20)
    expect(saida.aceitas.map((a) => a.linha)).toEqual(Array.from({ length: 20 }, (_, i) => i + 2))
  })

  /** Uma linha que o banco recusa nao pode derrubar o resto do lote (AC #2). */
  it('uma repetida no meio do lote nao impede as outras', async () => {
    const repositorio = {
      async importarComAuditoria(novo: ChamadoImportado) {
        return novo.numeroLegado === 'INC-3' ? null : { number: 5000 }
      },
    }
    const csv = arquivo(...Array.from({ length: 12 }, (_, i) => linha(`INC-${i + 1}`)))

    const saida = await importarCsv({ repositorio })({ csv }, bruno)

    expect(saida.aceitas).toHaveLength(11)
    expect(saida.repetidas).toEqual([{ linha: 4, numeroLegado: 'INC-3' }])
  })
})
