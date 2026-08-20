import { z } from 'zod'

/**
 * AD-6: fonte UNICA do contrato do import (Story 4.2, FR-25).
 *
 * O formato real do fornecedor e desconhecido (AC do epico). O que esta story
 * define e o **contrato de entrada**: as colunas que este sistema aceita. O
 * mapeamento do CSV real vira quando o arquivo existir — e a lacuna sera a
 * diferenca entre as duas listas.
 */

/** As colunas do arquivo de entrada. Sao as mesmas que o export (4.1) produz. */
export const COLUNAS_DO_IMPORT = {
  obrigatorias: ['numero_legado', 'titulo', 'descricao', 'solicitante'],
  opcionais: ['categoria', 'status', 'prioridade', 'dono', 'criado_em'],
} as const

export const importarCsvInputSchema = z.object({
  /** O conteudo do arquivo. A primeira linha e o cabecalho. */
  csv: z.string().min(1),
})

export type ImportarCsvInput = z.infer<typeof importarCsvInputSchema>

export const linhaRejeitadaSchema = z.object({
  /**
   * O numero da linha NO ARQUIVO, contando o cabecalho como 1. Sem ele, quem
   * migra recebe "37 erros" e nao sabe onde olhar.
   */
  linha: z.number().int().positive(),
  numeroLegado: z.string(),
  motivo: z.string(),
})

export const importarCsvOutputSchema = z.object({
  /** Chamados criados, com o Numero NATIVO que cada um recebeu. */
  aceitas: z.array(
    z.object({ linha: z.number().int().positive(), numeroLegado: z.string(), numero: z.number() }),
  ),
  /** Ja existiam: o `numero_legado` bateu. Reimport e o caso normal, nao erro. */
  repetidas: z.array(z.object({ linha: z.number().int().positive(), numeroLegado: z.string() })),
  rejeitadas: z.array(linhaRejeitadaSchema),
  /**
   * Linhas VALIDAS que o banco nao gravou (timeout, deadlock, conexao caindo).
   *
   * Separada de `rejeitadas` porque a acao que cada uma pede e diferente:
   * rejeitada quer dizer "corrija o CSV"; falha quer dizer "a linha esta boa,
   * rode de novo". Uma falha no meio do arquivo NAO interrompe o import — o
   * resto continua, e o relatorio diz onde retomar. Como o reimport nao
   * duplica, retomar e rodar o mesmo arquivo.
   */
  falhas: z.array(
    z.object({
      linha: z.number().int().positive(),
      numeroLegado: z.string(),
      erro: z.string(),
    }),
  ),
  /**
   * Linhas cuja data de abertura nao veio no arquivo e ficou com a data do
   * import. Nao e erro — mas quem migra precisa saber que o historico daquelas
   * linhas comeca hoje.
   */
  semDataOriginal: z.number().int().min(0),
})

export type ImportarCsvOutput = z.infer<typeof importarCsvOutputSchema>
