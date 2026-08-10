/**
 * Port do link de acesso ao Chamado (Story 1.6).
 *
 * Como nas Stories 1.3 e 1.5: o adapter guarda e busca; quem decide se o link
 * ainda vale e o servico, que e onde o relogio vive.
 */
export type LinkDeAcesso = {
  readonly ticketNumber: number
  readonly email: string
  readonly expiraEm: Date
}

export type TicketAccessRepository = {
  criarLinkDeAcesso(entrada: {
    readonly ticketNumber: number
    readonly email: string
    readonly tokenHash: string
    readonly expiraEm: Date
  }): Promise<void>

  buscarLinkDeAcessoPorHash(tokenHash: string): Promise<LinkDeAcesso | null>
}
