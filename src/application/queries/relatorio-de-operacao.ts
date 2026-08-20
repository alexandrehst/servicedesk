import { DomainError } from '../../domain/errors.js'
import { relatorioVisivelPara } from '../../domain/visibilidade.js'
import type { Principal } from '../contracts/principal.js'
import {
  DIAS_PADRAO_DO_RELATORIO,
  type RelatorioDeOperacaoInput,
  type RelatorioDeOperacaoOutput,
} from '../contracts/relatorio-de-operacao.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * O relatorio de operacao (Story 4.4, SM-3/SM-4/SM-5).
 *
 * Existe para UMA decisao: cortar ou nao o contrato do software atual. E ele
 * responde **metade** da pergunta — a metade que o proprio sistema consegue
 * provar. A outra metade (o baseline do contratado, e "zero Chamados perdidos
 * fora dele") nao e mensuravel daqui, esta na checklist de paridade, e o Dev
 * Agent Record da story diz exatamente quem responde por ela.
 */
export type RelatorioDeOperacaoDeps = {
  readonly repositorio: Pick<TicketRepository, 'medirOperacao'>
  /** Injetado, como em todo lugar que decide prazo: testavel sem esperar. */
  readonly agora: () => Date
}

const MS_POR_DIA = 24 * 60 * 60 * 1000

export const relatorioDeOperacao =
  ({ repositorio, agora }: RelatorioDeOperacaoDeps) =>
  async (input: RelatorioDeOperacaoInput, quem: Principal): Promise<RelatorioDeOperacaoOutput> => {
    const ate = input.ate === undefined ? agora() : new Date(input.ate)
    const de =
      input.de === undefined
        ? new Date(ate.getTime() - DIAS_PADRAO_DO_RELATORIO * MS_POR_DIA)
        : new Date(input.de)

    if (de >= ate) {
      // Recusar em vez de devolver vazio: um relatorio vazio com cara de
      // resposta faria alguem concluir "nao houve atendimento no periodo" a
      // partir de um periodo que nao existe.
      throw new DomainError('PeriodoInvalido', 'O inicio do periodo precisa ser anterior ao fim.')
    }

    const bruto = await repositorio.medirOperacao({ de, ate })
    const medidas = relatorioVisivelPara(quem, bruto)

    if (medidas === null) {
      // Mesma resposta da Story 1.8 para o historico: quem nao pode ver o que
      // aconteceu no sistema nao ve o agregado disso.
      throw new DomainError(
        'SemPermissao',
        'Voce nao pode ver o relatorio de operacao deste sistema.',
      )
    }

    const totalDeAcoes = medidas.porOrigem.mcp + medidas.porOrigem.api + medidas.porOrigem.email

    return {
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      resolucao: {
        medianaHoras: medidas.medianaHoras,
        mediaHoras: medidas.mediaHoras,
        resolvidos: medidas.resolvidos,
        semResolucao: medidas.semResolucao,
      },
      origem: {
        ...medidas.porOrigem,
        // `null`, e nao 0, quando nao houve acao nenhuma: "0% via MCP" afirma
        // que houve atividade e ela nao passou pelo MCP — e o que houve foi
        // silencio.
        percentualMcp:
          totalDeAcoes === 0
            ? null
            : Math.round((medidas.porOrigem.mcp / totalDeAcoes) * 1000) / 10,
      },
      adocao: {
        autoresDistintos: medidas.autoresDistintos,
        chamadosAbertos: medidas.chamadosAbertos,
      },
    }
  }
