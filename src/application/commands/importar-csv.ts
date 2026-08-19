import { DomainError } from '../../domain/errors.js'
import { linhaImportada } from '../../domain/importacao.js'
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
 *    do LOTE — a AC exige que a linha 5.000 entre mesmo que a 4.999 falhe.
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

export const importarCsv =
  ({ repositorio }: ImportarCsvDeps) =>
  async (input: ImportarCsvInput, autor: Principal): Promise<ImportarCsvOutput> => {
    if (!pode(autor.role, 'importa')) {
      throw semPermissao()
    }

    const linhas = deCsv(input.csv)

    const aceitas: ImportarCsvOutput['aceitas'] = []
    const repetidas: ImportarCsvOutput['repetidas'] = []
    const rejeitadas: ImportarCsvOutput['rejeitadas'] = []
    let semDataOriginal = 0

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

      const criado = await repositorio.importarComAuditoria(resultado.novo, autor)

      if (criado === null) {
        // `numero_legado` ja existe: o arquivo esta sendo importado de novo.
        repetidas.push({ linha, numeroLegado: resultado.novo.numeroLegado })
        continue
      }

      if (resultado.novo.criadoEm === undefined) {
        semDataOriginal += 1
      }

      aceitas.push({ linha, numeroLegado: resultado.novo.numeroLegado, numero: criado.number })
    }

    return { aceitas, repetidas, rejeitadas, semDataOriginal }
  }
