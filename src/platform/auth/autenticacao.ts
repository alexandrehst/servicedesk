import type {
  AutenticarComLinkInput,
  SessaoCriadaOutput,
  SolicitarLinkInput,
  SolicitarLinkOutput,
} from '../../application/contracts/autenticacao.js'
import type { Principal } from '../../application/contracts/principal.js'
import type { IdentityRepository } from '../../application/ports/identity-repository.js'
import type { NotificadorDeLogin } from '../../application/ports/notificador-de-login.js'
import { DomainError } from '../../domain/errors.js'
import { gerarToken, hashToken } from './token.js'

/**
 * Autenticacao por magic link (Story 1.3, FR-19).
 *
 * Tres operacoes: pedir o link, trocar o link por sessao, e resolver a sessao
 * em principal. A politica de validade mora aqui — o adapter so guarda e busca
 * (mesmo raciocinio do AD-8, que mantem autorizacao fora do adapter).
 *
 * O relogio e injetado: expiracao testada por unidade, sem `sleep`.
 */

/** Decisao do dono do projeto em 2026-08-10 (PRD Q7). Nao mudar sem revisita-la. */
const VALIDADE_DO_LINK_MS = 15 * 60 * 1000
const VALIDADE_DA_SESSAO_MS = 8 * 60 * 60 * 1000

export type AutenticacaoDeps = {
  readonly repositorio: IdentityRepository
  readonly notificador: NotificadorDeLogin
  readonly agora: () => Date
}

/**
 * UM erro para todos os modos de falha de credencial: ausente, malformada,
 * inexistente, expirada, ja usada, ou de usuario que saiu do cadastro.
 *
 * A mensagem e deliberadamente cega. "Link expirado" diria a quem esta
 * sondando que o token e real e so envelheceu — informacao que separa um
 * palpite de um alvo. E o mesmo raciocinio do erro unico da Story 1.2, agora
 * na fronteira de autenticacao.
 *
 * A credencial NAO entra na mensagem (AD-9): erro tambem e um lugar por onde
 * segredo vaza — para o log, para o cliente, para o relatorio de crash.
 */
const credencialInvalida = (): DomainError =>
  new DomainError('CredencialInvalida', 'Credencial invalida.')

/**
 * Um unico ponto de normalizacao. Se o adapter tambem normalizasse, os dois
 * poderiam divergir e a mesma pessoa viraria duas identidades.
 */
const normalizarEmail = (email: string): string => email.trim().toLowerCase()

/**
 * Pede um link de acesso.
 *
 * A resposta e a MESMA para e-mail cadastrado e nao cadastrado, e o caminho do
 * nao cadastrado nao cria linha nem dispara envio. Sem isso, o formulario de
 * login viraria um verificador de quem trabalha na empresa — e uma lista de
 * funcionarios e material de phishing.
 */
export const solicitarLink =
  ({ repositorio, notificador, agora }: AutenticacaoDeps) =>
  async (input: SolicitarLinkInput): Promise<SolicitarLinkOutput> => {
    const email = normalizarEmail(input.email)
    const usuario = await repositorio.buscarUsuarioPorEmail(email)

    if (usuario !== null) {
      const token = gerarToken()

      await repositorio.criarLinkDeLogin({
        email: usuario.email,
        // So o hash vai ao banco. O token cru segue apenas para o dono do
        // e-mail, e some da memoria depois disso.
        tokenHash: hashToken(token),
        expiraEm: new Date(agora().getTime() + VALIDADE_DO_LINK_MS),
      })

      await notificador.enviarLinkDeLogin(usuario.email, token)
    }

    return { mensagem: 'Se o e-mail estiver cadastrado, o link de acesso foi enviado.' }
  }

/**
 * Troca o token do link por uma sessao.
 *
 * O consumo e atomico no repositorio (uso unico garantido pelo banco); aqui
 * ficam as duas decisoes que dependem de politica: o link ainda esta na
 * validade, e o dono dele ainda esta no cadastro.
 */
export const autenticarComLink =
  ({ repositorio, agora }: AutenticacaoDeps) =>
  async (input: AutenticarComLinkInput): Promise<SessaoCriadaOutput> => {
    const link = await repositorio.consumirLinkDeLogin(hashToken(input.token))

    if (link === null) {
      throw credencialInvalida()
    }

    const instante = agora()

    // `<=`: no instante exato do vencimento o link ja nao vale. A borda e
    // deliberada — "ainda vale por um milissegundo" nao e uma regra util.
    if (link.expiraEm.getTime() <= instante.getTime()) {
      throw credencialInvalida()
    }

    // O papel vem do cadastro, nunca da entrada: aceitar papel do cliente
    // seria deixar qualquer um se declarar Agente.
    const usuario = await repositorio.buscarUsuarioPorEmail(link.email)

    if (usuario === null) {
      throw credencialInvalida()
    }

    const tokenDeSessao = gerarToken()
    const expiraEm = new Date(instante.getTime() + VALIDADE_DA_SESSAO_MS)

    await repositorio.criarSessao({
      email: usuario.email,
      tokenHash: hashToken(tokenDeSessao),
      expiraEm,
    })

    return {
      // Unica vez que a credencial de sessao existe em texto claro fora do
      // cliente. Nao ha como recupera-la depois — e essa e a intencao.
      tokenDeSessao,
      identity: usuario.email,
      role: usuario.papel,
      expiraEm: expiraEm.toISOString(),
    }
  }

/**
 * Resolve o token de sessao no principal que os casos de uso recebem (AD-8).
 *
 * `origin` NAO sai daqui: quem carimba e o adapter, porque so ele sabe se a
 * chamada veio do MCP ou da API (AD-9).
 */
export const resolverPrincipal =
  ({ repositorio, agora }: AutenticacaoDeps) =>
  async (tokenDeSessao: string): Promise<Omit<Principal, 'origin'>> => {
    if (tokenDeSessao.length === 0) {
      throw credencialInvalida()
    }

    const sessao = await repositorio.buscarSessaoPorHash(hashToken(tokenDeSessao))

    if (sessao === null || sessao.expiraEm.getTime() <= agora().getTime()) {
      throw credencialInvalida()
    }

    return { identity: sessao.email, role: sessao.papel }
  }
