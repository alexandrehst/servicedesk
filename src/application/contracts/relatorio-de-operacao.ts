import { z } from 'zod'

/**
 * AD-6: fonte UNICA do contrato do relatorio (Story 4.4, SM-3/SM-4/SM-5).
 *
 * O relatorio existe para uma decisao especifica: **cortar ou nao o contrato do
 * software atual**. Por isso ele devolve as tres metricas juntas e nao tres
 * numeros soltos — quem decide olha as tres no MESMO periodo, e tres consultas
 * separadas seriam tres chances de discordarem sobre qual periodo era.
 */

/** Sem periodo, os ultimos 30 dias — a janela que a AC do epico usa. */
export const DIAS_PADRAO_DO_RELATORIO = 30

export const relatorioDeOperacaoInputSchema = z.object({
  /** Inicio do periodo (ISO). Ausente: 30 dias atras. */
  de: z.iso.datetime().optional(),
  /** Fim do periodo (ISO). Ausente: agora. */
  ate: z.iso.datetime().optional(),
})

export type RelatorioDeOperacaoInput = z.infer<typeof relatorioDeOperacaoInputSchema>

export const relatorioDeOperacaoOutputSchema = z.object({
  periodo: z.object({ de: z.iso.datetime(), ate: z.iso.datetime() }),

  /**
   * SM-3 — tempo de resolucao, em HORAS.
   *
   * Mediana E media, e as duas de proposito. A AC pede "tempo medio", mas numa
   * fila de 8 Agentes um unico Chamado esquecido por dois meses arrasta a media
   * e faz o sistema parecer pior do que e. **A mediana e o numero honesto para
   * comparar com o baseline; a media e o que o SM-3 pediu.** Devolver so a
   * media, sabendo disso, seria entregar o numero que engana.
   */
  resolucao: z.object({
    medianaHoras: z.number().nullable(),
    mediaHoras: z.number().nullable(),
    /**
     * Quantos Chamados entraram no calculo. Uma media de 3 Chamados nao
     * sustenta decisao de corte de contrato, e quem le precisa ver isso.
     */
    resolvidos: z.number().int().min(0),
    /**
     * Abertos no periodo e ainda sem resolucao. FORA do calculo: um Chamado
     * aberto ha tres meses nao tem tempo de resolucao, e assumir "ate agora"
     * misturaria "demorou" com "nao acabou".
     */
    semResolucao: z.number().int().min(0),
  }),

  /** SM-4 — a meta e >= 50% via MCP no primeiro trimestre. */
  origem: z.object({
    mcp: z.number().int().min(0),
    api: z.number().int().min(0),
    email: z.number().int().min(0),
    percentualMcp: z.number().nullable(),
  }),

  /**
   * SM-5 — a parte que E medivel daqui.
   *
   * Conta quem AGIU, nao se sao "os 8 Agentes": o sistema nao sabe quantos
   * Agentes a empresa tem. A outra metade do SM-5 — "zero Chamados perdidos
   * fora dele" — e sobre o que NAO esta aqui, e nenhuma consulta interna
   * enxerga isso. Esta na checklist.
   */
  adocao: z.object({
    autoresDistintos: z.number().int().min(0),
    chamadosAbertos: z.number().int().min(0),
  }),
})

export type RelatorioDeOperacaoOutput = z.infer<typeof relatorioDeOperacaoOutputSchema>
