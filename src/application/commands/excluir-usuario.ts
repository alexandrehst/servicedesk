import { alvoDoUsuario } from '../../domain/alvo-de-confirmacao.js'
import { DomainError } from '../../domain/errors.js'
import { pode } from '../../domain/papeis.js'
import type { ExcluirUsuarioInput } from '../contracts/excluir.js'
import type { Principal } from '../contracts/principal.js'
import type { IdentityRepository } from '../ports/identity-repository.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import type { Confirmacao } from './acao-irreversivel.js'

/**
 * Command handler da exclusao logica de Usuario (Story 4.3, FR-23).
 *
 * **E a acao mais destrutiva do sistema**, e nao por apagar dado — ela nao
 * apaga nada. E porque e a UNICA que tira o acesso de uma pessoa: a partir
 * daqui a sessao dela para de valer, o token MCP dela para de resolver, o
 * e-mail dela deixa de abrir Chamado e ninguem consegue atribuir trabalho a
 * ela. Nada mais neste projeto faz isso.
 *
 * Por isso ela exige confirmacao (AD-7) mesmo sendo "so" um UPDATE.
 */
export type ExcluirUsuarioDeps = {
  readonly identidades: Pick<
    IdentityRepository,
    'buscarUsuarioPorEmail' | 'excluirUsuarioComAuditoria'
  >
  readonly repositorio: Pick<TicketRepository, 'contarChamadosAbertosDe'>
  readonly confirmacao: Confirmacao
}

export type ExcluirUsuarioOutput = {
  readonly email: string
  /**
   * Quantos Chamados NAO encerrados ficaram sem Dono util.
   *
   * Nao ha redistribuicao automatica, e isso e deliberado: um UPDATE em massa
   * disparado por uma exclusao e exatamente o efeito colateral invisivel que o
   * AD-2 existe para evitar — e escolher o novo Dono e decisao de operacao, nao
   * consequencia de desligar alguem. O honesto e RELATAR: quem excluiu fica
   * sabendo na hora que ha trabalho parado, e redistribui com `atribuir_chamado`.
   */
  readonly chamadosSemDono: number
}

const semPermissao = (): DomainError =>
  new DomainError('SemPermissao', 'Voce nao pode excluir Usuarios.')

/**
 * Usuario inexistente e Usuario ja excluido recebem a MESMA resposta, pelo
 * mesmo raciocinio de `ticketNaoEncontrado` e de `CredencialInvalida` (1.3):
 * distinguir os dois transformaria esta tool num verificador de quem trabalha
 * aqui — e a lista de e-mails de uma empresa e exatamente o que alguem
 * sondando quer.
 */
const usuarioNaoEncontrado = (): DomainError =>
  new DomainError('UsuarioNaoEncontrado', 'Usuario nao encontrado.')

const confirmacaoNecessaria = (email: string, token?: string): DomainError =>
  new DomainError(
    'ConfirmationRequired',
    token === undefined
      ? `Confirmacao invalida ou expirada para excluir "${email}". Peca uma nova.`
      : `Excluir o Usuario "${email}" e IRREVERSIVEL: a sessao dele para de valer na hora, ` +
          `o token MCP dele para de resolver, o e-mail dele deixa de abrir Chamado e ninguem ` +
          `podera atribuir trabalho a ele. Os Chamados dele PERMANECEM. ` +
          `Mostre isto a quem decide e, com o aval, repita com confirmacao="${token}" ` +
          `(vale 5 minutos, uma vez so).`,
  )

export const excluirUsuario =
  ({ identidades, repositorio, confirmacao }: ExcluirUsuarioDeps) =>
  async (input: ExcluirUsuarioInput, autor: Principal): Promise<ExcluirUsuarioOutput> => {
    if (!pode(autor.role, 'excluiUsuario')) {
      throw semPermissao()
    }

    // Antes de emitir o token: um cracha para excluir quem nao existe seria
    // justamente o oraculo que `usuarioNaoEncontrado` evita — e a Story 2.6 ja
    // registrou a ordem certa ("emitir confirmacao ANTES de autorizar" e uma
    // das mutacoes que ela mata).
    const alvo = await identidades.buscarUsuarioPorEmail(input.email)

    if (alvo === null) {
      throw usuarioNaoEncontrado()
    }

    // Excluir a si mesmo derrubaria a propria sessao no meio da operacao, e o
    // sistema poderia ficar sem nenhum Agente. Nao e regra de negocio
    // sofisticada — e o guardrail que evita o unico erro irrecuperavel aqui.
    if (alvo.email === autor.identity) {
      throw new DomainError(
        'AutoExclusao',
        'Voce nao pode excluir a si mesmo: a sua sessao pararia de valer no mesmo instante.',
      )
    }

    if (input.confirmacao === undefined) {
      const token = await confirmacao.emitir({
        alvo: alvoDoUsuario(alvo.email),
        // Nulo: esta acao nao e sobre um Chamado.
        ticketNumber: null,
        acao: 'excluir_usuario',
        autor,
        // Excluir nao muda Status de nada; inventar um par seria evento falso.
        de: null,
        para: null,
      })

      throw confirmacaoNecessaria(alvo.email, token)
    }

    const valeu = await confirmacao.consumir(input.confirmacao, {
      alvo: alvoDoUsuario(alvo.email),
      acao: 'excluir_usuario',
      identity: autor.identity,
    })

    if (!valeu) {
      throw confirmacaoNecessaria(alvo.email)
    }

    // Contado ANTES da exclusao, e de proposito: depois dela o numero seria o
    // mesmo, mas quem le o relatorio quer saber o que ficou parado NAQUELE
    // instante.
    const chamadosSemDono = await repositorio.contarChamadosAbertosDe(alvo.email)

    const excluiu = await identidades.excluirUsuarioComAuditoria(alvo.email, autor)

    if (!excluiu) {
      // Outro pedido marcou primeiro — mesmo desfecho de nunca ter existido.
      throw usuarioNaoEncontrado()
    }

    return { email: alvo.email, chamadosSemDono }
  }
