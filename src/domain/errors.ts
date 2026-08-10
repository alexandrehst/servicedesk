/**
 * Erros de dominio tipados.
 *
 * O shape do erro NASCE aqui (Consistency Conventions da spine): o adapter
 * HTTP mapeia para status HTTP e o adapter MCP para erro de tool, mas nenhum
 * dos dois inventa formato proprio. Assim os dois pontos de entrada nao
 * divergem no que reportam.
 */

export type DomainErrorCode = 'TituloObrigatorio' | 'DescricaoObrigatoria' | 'CategoriaInvalida'

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export const ehDomainError = (erro: unknown): erro is DomainError => erro instanceof DomainError
