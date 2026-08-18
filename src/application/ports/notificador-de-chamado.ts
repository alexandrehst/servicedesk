/**
 * Port de saida do e-mail de Chamado (Story 1.6, FR-18).
 *
 * Separado de `NotificadorDeLogin` de proposito: sao mensagens diferentes, e
 * quem so precisa mandar link de login nao deveria ter que saber montar e-mail
 * de Chamado. Um unico adapter implementa os dois — o transporte e o mesmo, o
 * contrato nao precisa ser.
 */
export type ChamadoAberto = {
  readonly destinatario: string
  readonly numero: number
  readonly status: string
  readonly titulo: string
  /** URL completa, com o token de acesso ja embutido. */
  readonly link: string
}

/**
 * Story 2.5 — o segundo (e ultimo) evento que gera e-mail no MVP.
 *
 * FR-18 e explicito: so abertura e resolucao. Comentario, atribuicao e
 * prioridade NAO notificam — a caixa de entrada de quem abriu um Chamado nao
 * pode virar o log de tudo o que o time faz.
 */
export type ChamadoResolvido = {
  readonly destinatario: string
  readonly numero: number
  readonly titulo: string
  /**
   * Quem resolveu: a IDENTIDADE de quem executou a acao (AD-9), nunca o Dono —
   * os dois podem ser pessoas diferentes.
   */
  readonly resolvidoPor: string
  /**
   * O tempo total entre a abertura e a resolucao, ja em TEXTO
   * (`duracaoLegivel`, no dominio). O adapter recebe a frase pronta pelo mesmo
   * motivo que recebe o rotulo de auditoria pronto: se ele a montasse, cada
   * ponto de entrada teria a sua.
   */
  readonly duracao: string
  /** URL completa, com o token de acesso ja embutido. */
  readonly link: string
}

export type NotificadorDeChamado = {
  enviarChamadoAberto(mensagem: ChamadoAberto): Promise<void>
  enviarChamadoResolvido(mensagem: ChamadoResolvido): Promise<void>
}
