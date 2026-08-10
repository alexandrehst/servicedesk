/**
 * Erros de dominio tipados.
 *
 * O shape do erro NASCE aqui (Consistency Conventions da spine): o adapter
 * HTTP mapeia para status HTTP e o adapter MCP para erro de tool, mas nenhum
 * dos dois inventa formato proprio. Assim os dois pontos de entrada nao
 * divergem no que reportam.
 */

export type DomainErrorCode =
  | 'TituloObrigatorio'
  | 'DescricaoObrigatoria'
  | 'CategoriaInvalida'
  | 'TicketNaoEncontrado'
  // Credencial ausente, malformada, expirada, ja usada ou inexistente — um
  // codigo so, deliberadamente (Story 1.3). A spine cita `Unauthorized` entre
  // os erros de dominio tipados, entao o shape continua nascendo aqui em vez
  // de o modulo de auth inventar uma classe paralela.
  | 'CredencialInvalida'

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export const ehDomainError = (erro: unknown): erro is DomainError => erro instanceof DomainError
