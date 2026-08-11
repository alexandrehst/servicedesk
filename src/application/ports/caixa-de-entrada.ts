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
   * Marca mensagens como processadas, EM LOTE, para que a proxima varredura
   * nao as traga de novo.
   *
   * Recebe a lista inteira de uma vez, e nao uma mensagem por chamada, porque
   * a implementacao real abre uma sessao por chamada: uma varredura de 50
   * mensagens custaria 51 handshakes IMAP em vez de 2, e provedor corporativo
   * limita conexoes simultaneas. O `ImapFlow` marca varios UIDs numa operacao
   * so.
   *
   * Chamada DEPOIS do processamento, e nao antes: marcar primeiro perderia a
   * mensagem se o processo morresse no meio. Marcar depois, em lote, tem o
   * risco oposto — morrer entre processar e marcar faz as mensagens voltarem
   * na proxima varredura. E aceitavel exatamente porque a dedup por
   * `Message-ID` as reconhece; sem ela, este desenho abriria Chamado repetido.
   */
  marcarProcessadas(ids: readonly string[]): Promise<void>
}
