import type { Papel, Principal } from '../contracts/principal.js'

/**
 * Port de saida da identidade (Story 1.3, FR-19).
 *
 * O adapter nunca decide se uma credencial vale: ele guarda, busca e consome.
 * A politica (expirou? ja foi usado? papel de quem?) vive em `platform/auth`,
 * onde e testavel em unidade com relogio injetado. Mesmo raciocinio do AD-8,
 * que mantem autorizacao fora do adapter.
 *
 * O que trafega aqui e sempre o HASH do token. O token cru nao entra no port.
 */

export type UsuarioCadastrado = {
  readonly email: string
  readonly papel: Papel
}

export type LinkConsumido = {
  readonly email: string
  readonly expiraEm: Date
}

export type SessaoEncontrada = {
  readonly email: string
  readonly papel: Papel
  readonly expiraEm: Date
}

/**
 * Credencial de maquina do cliente MCP (Story 1.5).
 *
 * `expiraEm` nulo significa "nao expira": o prazo nao foi decidido, e inventar
 * um padrao aqui seria politica de seguranca fabricada. Quem emite decide.
 *
 * O adapter devolve `revogadoEm` e `expiraEm` em vez de ja filtrar: quem tem o
 * relogio — e quem decide o que cada estado significa — e o servico, como na
 * Story 1.3.
 */
export type TokenMcpEncontrado = {
  readonly identity: string
  readonly papel: Papel
  readonly expiraEm: Date | null
  readonly revogadoEm: Date | null
}

export type IdentityRepository = {
  /**
   * Story 4.3 — exclusao logica do Usuario (FR-23, AD-3).
   *
   * A marcacao e o registro no Log saem na MESMA transacao, como toda escrita
   * deste projeto. O registro vai com `ticket_number` NULO: excluir uma pessoa
   * nao e sobre um Chamado, e inventar um numero seria registrar um evento
   * falso.
   *
   * `false` quando nao havia o que excluir — e-mail que nao existe ou ja
   * excluido. Quem chama traduz.
   */
  excluirUsuarioComAuditoria(email: string, autor: Principal): Promise<boolean>

  /** `null` quando o e-mail nao esta cadastrado. Quem decide o que fazer com isso e o servico. */
  buscarUsuarioPorEmail(email: string): Promise<UsuarioCadastrado | null>

  criarLinkDeLogin(entrada: {
    readonly email: string
    readonly tokenHash: string
    readonly expiraEm: Date
  }): Promise<void>

  /**
   * Marca o link como usado e devolve seus dados — em UMA operacao atomica
   * (`UPDATE ... WHERE usado_em IS NULL RETURNING`).
   *
   * Ler primeiro e marcar depois deixaria uma janela entre as duas chamadas
   * em que o mesmo link seria consumido duas vezes. O uso unico e uma
   * garantia do banco aqui, nao da ordem em que o codigo roda.
   *
   * Devolve `null` se o token nao existe OU se ja tinha sido usado. A
   * expiracao NAO e checada aqui: quem tem o relogio e o servico.
   */
  consumirLinkDeLogin(tokenHash: string): Promise<LinkConsumido | null>

  criarSessao(entrada: {
    readonly email: string
    readonly tokenHash: string
    readonly expiraEm: Date
  }): Promise<void>

  /**
   * Sessao + papel ATUAL do usuario (join com `users`), nao o papel de quando
   * a sessao nasceu. Usuario removido do cadastro deixa de resolver, mesmo
   * com sessao dentro da validade.
   */
  buscarSessaoPorHash(tokenHash: string): Promise<SessaoEncontrada | null>

  /** Token de maquina + papel ATUAL do cadastro, pelo mesmo join da sessao. */
  buscarTokenMcpPorHash(tokenHash: string): Promise<TokenMcpEncontrado | null>
}
