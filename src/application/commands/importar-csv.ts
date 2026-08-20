import { DomainError } from '../../domain/errors.js'
import { type ChamadoImportado, linhaImportada } from '../../domain/importacao.js'
import { pode } from '../../domain/papeis.js'
import { deCsv } from '../../platform/csv/csv.js'
import type { ImportarCsvInput, ImportarCsvOutput } from '../contracts/importar-csv.js'
import type { Principal } from '../contracts/principal.js'
import type { Logger } from '../ports/logger.js'
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
  /**
   * A falha de banco tambem vai para o log, e nao so para o relatorio.
   *
   * O relatorio e sincrono: existe uma vez, na resposta daquela chamada. Se o
   * cliente MCP truncar o `structuredContent`, ou o processo cair antes de
   * responder, nao sobra rastro nenhum de por que a linha 2.003 nao entrou —
   * e engolir erro e violacao direta do pilar Observavel (o motivo pelo qual
   * este port existe, Story 1.6).
   *
   * Mesmo padrao de `adapters/email/varredura.ts`: cada item do lote que falha
   * vira registro estruturado, e a contagem ainda volta no resumo.
   */
  readonly logger: Logger
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

/**
 * O que o operador ve quando o banco falha numa linha.
 *
 * Vai para o relatorio, e nao so para o log do servidor, porque quem migra
 * precisa saber POR QUE a linha nao entrou — "falhou" sozinho nao distingue
 * timeout de deadlock de disco cheio, e a acao e diferente em cada caso. Quem
 * le e um Agente com a capacidade `importa`, o papel mais restrito do sistema.
 */
const mensagem = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro))

type Pendente = { readonly linha: number; readonly novo: ChamadoImportado }

export const importarCsv =
  ({ repositorio, logger }: ImportarCsvDeps) =>
  async (input: ImportarCsvInput, autor: Principal): Promise<ImportarCsvOutput> => {
    if (!pode(autor.role, 'importa')) {
      throw semPermissao()
    }

    const linhas = deCsv(input.csv)

    const aceitas: ImportarCsvOutput['aceitas'][number][] = []
    const repetidas: ImportarCsvOutput['repetidas'][number][] = []
    const rejeitadas: ImportarCsvOutput['rejeitadas'][number][] = []
    const falhas: ImportarCsvOutput['falhas'][number][] = []
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
      // auditoria entram juntos ou nao entram. NAO ha transacao do lote.
      //
      // `allSettled`, e nao `all`, e a diferenca IMPORTA. `Promise.all` rejeita
      // na primeira falha: um timeout na linha 2.003 derrubaria a funcao
      // inteira, os lotes seguintes nunca rodariam, e quem migra receberia um
      // erro sem relatorio nenhum — sem saber quantas linhas entraram nem onde
      // retomar. Isso e exatamente o "tudo ou nada" que a AC #2 proibe, so que
      // pela porta dos fundos. Pior: `all` nao cancela as irmas, entao as
      // chamadas em voo continuariam e poderiam COMITAR depois do erro, com
      // Chamado gravado e auditado que nao aparece em relatorio algum.
      const gravadas = await Promise.allSettled(
        lote.map(({ novo }) => repositorio.importarComAuditoria(novo, autor)),
      )

      for (const [posicao, resultado] of gravadas.entries()) {
        const pendente = lote[posicao]
        if (pendente === undefined) {
          continue
        }
        const { linha, novo } = pendente

        if (resultado.status === 'rejected') {
          // FALHA e coisa diferente de REJEITADA, e a distincao e a acao que
          // cada uma pede: rejeitada quer dizer "o dado esta errado, corrija o
          // CSV"; falha quer dizer "a linha esta boa, o banco e que nao
          // gravou — rode de novo". O reimport e seguro (o `numero_legado` ja
          // gravado volta como repetida), entao retomar e literalmente rodar o
          // mesmo arquivo.
          const causa = mensagem(resultado.reason)
          // NUNCA o conteudo da linha: Titulo e Descricao vem do Solicitante, e
          // log e um lugar por onde dado vaza (AD-9). O numero da linha e o
          // `numero_legado` bastam para achar a linha no arquivo.
          logger.erro('falha_ao_importar_linha', {
            linha,
            numero_legado: novo.numeroLegado,
            causa,
          })
          falhas.push({ linha, numeroLegado: novo.numeroLegado, erro: causa })
          continue
        }

        if (resultado.value === null) {
          // `numero_legado` ja existia na base: o arquivo esta sendo importado
          // de novo.
          repetidas.push({ linha, numeroLegado: novo.numeroLegado })
          continue
        }

        if (novo.criadoEm === undefined) {
          semDataOriginal += 1
        }

        aceitas.push({ linha, numeroLegado: novo.numeroLegado, numero: resultado.value.number })
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
      falhas: porLinha(falhas),
      semDataOriginal,
    }
  }
