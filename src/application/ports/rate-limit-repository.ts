/**
 * Port de saida do contador de chamadas (Story 1.5, FR-21).
 *
 * O adapter nao conhece o limite — ele conta. Quem sabe que 60 e o teto e o
 * limitador em `platform/limites`, onde a politica e testavel em unidade com
 * relogio injetado. Mesmo desenho da Story 1.3: o repositorio de identidade
 * consome o link, e quem decide se ele ainda valia e o servico.
 */
export type RateLimitRepository = {
  /**
   * Incrementa e devolve o contador **depois** do incremento, em UMA operacao
   * atomica (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`).
   *
   * Devolver o valor ja incrementado nao e detalhe: se o port devolvesse o
   * valor anterior, quem chama teria que somar 1 por conta propria, e duas
   * chamadas simultaneas somariam sobre o mesmo numero.
   */
  registrarChamada(identity: string, janela: Date): Promise<number>
}
