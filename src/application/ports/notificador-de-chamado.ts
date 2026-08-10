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

export type NotificadorDeChamado = {
  enviarChamadoAberto(mensagem: ChamadoAberto): Promise<void>
}
