import type { TicketAccessRepository } from '../../application/ports/ticket-access-repository.js'
import { DomainError } from '../../domain/errors.js'
import { gerarToken, hashToken } from '../auth/token.js'

/**
 * Link de acesso ao Chamado (Story 1.6, FR-18).
 *
 * O e-mail de abertura precisa levar um link que "da acesso" — e o mecanismo
 * de token deste projeto ja existe desde a Story 1.3. O que muda aqui sao duas
 * decisoes, e as duas contrariam o link de login de proposito:
 *
 * - **Reutilizavel**, nao de uso unico. Quem pede login usa o link em seguida;
 *   quem recebe e-mail de abertura clica, fecha a aba e volta no dia seguinte
 *   para ver se responderam.
 * - **7 dias**, nao 15 minutos. Os 15 minutos existem porque o link de login
 *   vai para quem esta esperando por ele. Este vai para quem nao pediu nada.
 *
 * O que NAO muda: escopo minimo. O token da acesso a UM Chamado, entao um
 * e-mail encaminhado por engano expoe aquele Chamado, nao a caixa inteira.
 */

/** Decisao registrada em 2026-08-10. Nao mudar sem revisita-la. */
export const VALIDADE_DO_LINK_MS = 7 * 24 * 60 * 60 * 1000

export type LinkDeAcessoDeps = {
  readonly repositorio: TicketAccessRepository
  readonly agora: () => Date
}

/** Mesma mensagem cega das Stories 1.3 e 1.5 — expirado e inexistente sao iguais. */
const credencialInvalida = (): DomainError =>
  new DomainError('CredencialInvalida', 'Credencial invalida.')

/**
 * Cria o link e devolve o token **cru**, que existe uma vez so: ele vai para o
 * corpo do e-mail e some. O banco fica com o hash.
 */
export const criarLinkDeAcesso =
  ({ repositorio, agora }: LinkDeAcessoDeps) =>
  async (entrada: { readonly ticketNumber: number; readonly email: string }): Promise<string> => {
    const token = gerarToken()

    await repositorio.criarLinkDeAcesso({
      ticketNumber: entrada.ticketNumber,
      email: entrada.email,
      tokenHash: hashToken(token),
      expiraEm: new Date(agora().getTime() + VALIDADE_DO_LINK_MS),
    })

    return token
  }

/**
 * Resolve o token no Chamado a que ele da acesso.
 *
 * Quem consome isto e o portal (Fase 1.5) ou o adapter HTTP, nenhum dos dois
 * existente ainda. A resolucao entra agora porque sem ela o link do e-mail
 * seria decorativo — e um link decorativo nao "da acesso" coisa nenhuma.
 */
export const resolverAcessoAoChamado =
  ({ repositorio, agora }: LinkDeAcessoDeps) =>
  async (token: string): Promise<{ ticketNumber: number; email: string }> => {
    if (token.length === 0) {
      throw credencialInvalida()
    }

    const link = await repositorio.buscarLinkDeAcessoPorHash(hashToken(token))

    if (link === null || link.expiraEm.getTime() <= agora().getTime()) {
      throw credencialInvalida()
    }

    return { ticketNumber: link.ticketNumber, email: link.email }
  }
