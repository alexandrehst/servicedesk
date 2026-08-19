import { DomainError } from '../../domain/errors.js'
import { type ChamadoImportado, linhaImportada } from '../../domain/importacao.js'
import { pode } from '../../domain/papeis.js'
import { deCsv } from '../../platform/csv/csv.js'
import type { ImportarCsvInput, ImportarCsvOutput } from '../contracts/importar-csv.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * Command handler do import de migracao (Story 4.2, FR-25).
 *
 * Duas decisoes moldam este arquivo:
 *
 * 1. **Transacao POR LINHA.** `importarComAuditoria` e transacional (AD-3: o
 *    Chamado e sua auditoria entram juntos ou nao entram), mas nao ha transacao
 *    do LOTE — a AC exige que a linha 5.000 entre mesmo que a 4.999 falhe. As
 *    linhas vao ao banco em lotes concorrentes (ver `LINHAS_POR_LOTE`), e isso
 *    NAO as junta numa transacao: e so quantas viagens acontecem ao mesmo
 *    tempo.
 * 2. **A validacao NAO lanca** (`linhaImportada`): o caso normal de um arquivo
 *    de migracao e ter sujeira, e sujeira nao pode ser caminho de excecao.
 *
 * O retorno e o RELATORIO — e ele e a entrega da story tanto quanto os Chamados
 * criados: quem migra precisa saber o que ficou de fora e por que.
 */
export type ImportarCsvDeps = {
  readonly repositorio: Pick<TicketRepository, 'importarComAuditoria'>
}

/**
 * AD-8: a autorizacao e do DOMINIO, nao do adapter — o HTTP herda a mesma regra.
 *
 * Repare que ela e checada UMA vez, antes de ler o arquivo: nao ha nada por
 * linha que possa mudar quem esta chamando, e verificar por linha daria a
 * impressao errada de que ha.
 */
const semPermissao = (): DomainError =>
  new DomainError('SemPermissao', 'Voce nao pode importar Chamados.')

/**
 * Quantas linhas vao ao banco ao mesmo tempo.
 *
 * O `for` sequencial que esta funcao tinha antes fazia 5 idas ao Postgres por
 * linha (BEGIN, consulta previa, dois INSERT, COMMIT), uma esperando a outra:
 * num arquivo de 5.000 linhas — o tamanho que a propria AC usa de referencia —
 * sao 25.000 viagens em fila, e a tool trava por minutos antes de devolver o
 * relatorio.
 *
 * 8 e conservador de proposito: quem monta o servidor escolhe o tamanho do pool
 * de conexoes, e um lote maior que o pool nao acelera nada — as chamadas
 * excedentes esperam por conexao em vez de esperar pelo banco.
 */
const LINHAS_POR_LOTE = 8

type Pendente = { readonly linha: number; readonly novo: ChamadoImportado }

export const importarCsv =
  ({ repositorio }: ImportarCsvDeps) =>
  async (input: ImportarCsvInput, autor: Principal): Promise<ImportarCsvOutput> => {
    if (!pode(autor.role, 'importa')) {
      throw semPermissao()
    }

    const linhas = deCsv(input.csv)

    const aceitas: ImportarCsvOutput['aceitas'][number][] = []
    const repetidas: ImportarCsvOutput['repetidas'][number][] = []
    const rejeitadas: ImportarCsvOutput['rejeitadas'][number][] = []
    let semDataOriginal = 0

    const pendentes: Pendente[] = []
    // O `numero_legado` de cada linha que ja vai ser gravada. Ver abaixo por que
    // a deduplicacao acontece AQUI, e nao no banco.
    const jaNoLote = new Set<string>()

    for (const [indice, bruta] of linhas.entries()) {
      // +2: o cabecalho e a linha 1, e `entries()` comeca em 0. O numero e o do
      // ARQUIVO, que e onde quem migra vai olhar.
      const linha = indice + 2
      const resultado = linhaImportada(bruta)

      if (!resultado.ok) {
        rejeitadas.push({
          linha,
          numeroLegado: bruta.numero_legado ?? '',
          motivo: resultado.motivo,
        })
        continue
      }

      // Repetida DENTRO do proprio arquivo. O banco pegaria isso sozinho — o
      // UNIQUE parcial da 0013 existe justamente para isso —, mas em paralelo
      // as duas linhas disputariam o mesmo indice e **quem venceria dependeria
      // da ordem de conclusao**. Quem migra espera que a primeira ocorrencia no
      // arquivo seja a que entra; decidir aqui torna isso verdade, e de quebra
      // evita a transacao que so serviria para falhar.
      if (jaNoLote.has(resultado.novo.numeroLegado)) {
        repetidas.push({ linha, numeroLegado: resultado.novo.numeroLegado })
        continue
      }

      jaNoLote.add(resultado.novo.numeroLegado)
      pendentes.push({ linha, novo: resultado.novo })
    }

    for (let inicio = 0; inicio < pendentes.length; inicio += LINHAS_POR_LOTE) {
      const lote = pendentes.slice(inicio, inicio + LINHAS_POR_LOTE)

      // Cada chamada e uma transacao independente (AD-3): o Chamado e sua
      // auditoria entram juntos ou nao entram. NAO ha transacao do lote — a
      // AC #2 exige que a linha 5.000 entre mesmo que a 4.999 falhe, e um
      // `Promise.all` que abortasse no primeiro erro reintroduziria o
      // "tudo ou nada" pela porta dos fundos. Por isso o resultado de cada uma
      // e capturado, e nenhuma rejeicao escapa.
      const gravadas = await Promise.all(
        lote.map(async ({ linha, novo }) => ({
          linha,
          novo,
          criado: await repositorio.importarComAuditoria(novo, autor),
        })),
      )

      for (const { linha, novo, criado } of gravadas) {
        if (criado === null) {
          // `numero_legado` ja existia na base: o arquivo esta sendo importado
          // de novo.
          repetidas.push({ linha, numeroLegado: novo.numeroLegado })
          continue
        }

        if (novo.criadoEm === undefined) {
          semDataOriginal += 1
        }

        aceitas.push({ linha, numeroLegado: novo.numeroLegado, numero: criado.number })
      }
    }

    // O relatorio segue a ordem do ARQUIVO, nao a ordem em que o banco
    // respondeu: quem migra le o relatorio ao lado do CSV aberto. Sem isto, o
    // paralelismo vazaria para a saida.
    const porLinha = <T extends { readonly linha: number }>(itens: readonly T[]): T[] =>
      [...itens].sort((a, b) => a.linha - b.linha)

    return {
      aceitas: porLinha(aceitas),
      repetidas: porLinha(repetidas),
      rejeitadas: porLinha(rejeitadas),
      semDataOriginal,
    }
  }
