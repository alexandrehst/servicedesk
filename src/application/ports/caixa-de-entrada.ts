/**
 * Port de entrada do intake por e-mail (Story 1.9).
 *
 * Repare no que NAO esta aqui: nada de IMAP, pasta, webhook, conexao ou
 * credencial. O caso de uso sabe que existem mensagens para processar e que
 * uma mensagem pode ser marcada como processada — nada mais. Trocar IMAP por
 * webhook amanha nao toca uma linha de `application`.
 *
 * O texto BRUTO atravessa este port de proposito. Interpretar RFC 5322 —
 * encoding, multipart, cabecalho dobrado — e trabalho de biblioteca, e fica no
 * adapter; o que sobe para a aplicacao ja e `MensagemRecebida` validada.
 */
export type MensagemNaCaixa = {
  /**
   * Identificador do TRANSPORTE (UID no IMAP), nao o `Message-ID` do RFC.
   *
   * Sao coisas diferentes e a confusao seria cara: o UID identifica a copia
   * naquela caixa e serve para marca-la como lida; o `Message-ID` identifica a
   * MENSAGEM e e o que deduplica. A mesma mensagem entregue duas vezes tem
   * dois UIDs e um `Message-ID` so — que e exatamente o caso que a dedup
   * precisa pegar.
   */
  readonly id: string
  /** A mensagem crua, como chegou (RFC 5322). */
  readonly bruto: string
}

export type CaixaDeEntrada = {
  /** Mensagens ainda nao processadas, na ordem em que a caixa as devolver. */
  buscarNaoProcessadas(): Promise<readonly MensagemNaCaixa[]>

  /**
   * Marca a mensagem como processada na caixa, para que a proxima varredura
   * nao a traga de novo.
   *
   * Chamada DEPOIS do processamento, e nao antes: marcar primeiro perderia a
   * mensagem se o processo morresse no meio. Falhar aqui depois de abrir o
   * Chamado faz a mensagem voltar na proxima varredura — e a dedup por
   * `Message-ID` a reconhece. E por isso que a dedup nao e opcional.
   */
  marcarProcessada(id: string): Promise<void>
}
