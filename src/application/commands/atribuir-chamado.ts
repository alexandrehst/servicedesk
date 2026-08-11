import { normalizarEmail } from '../../domain/email.js'
import { DomainError } from '../../domain/errors.js'
import { pode } from '../../domain/papeis.js'
import { ticketNaoEncontrado, visivelPara } from '../../domain/visibilidade.js'
import type { AtribuirChamadoInput, AtribuirChamadoOutput } from '../contracts/atribuir-chamado.js'
import type { Principal } from '../contracts/principal.js'
import type { IdentityRepository } from '../ports/identity-repository.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { conflitoOuSumico } from './mutacao-versionada.js'

/**
 * Command handler de atribuicao de Dono (Story 2.3, FR-5).
 *
 * AD-2, AD-3 e AD-10 como nas anteriores. O que esta story acrescenta e a
 * verificacao do DESTINATARIO: um Chamado atribuido a quem nao atende nao tem
 * Dono, tem um nome — e a fila o mostraria como atendido.
 */
export type AtribuirChamadoDeps = {
  /**
   * `Pick` em vez do port inteiro (padrao da 1.9): este caso de uso consome
   * duas operacoes, e declarar isso deixa obvio o que ele NAO faz — nao abre
   * Chamado, nao comenta, nao muda Status.
   */
  readonly repositorio: Pick<TicketRepository, 'buscarPorNumero' | 'atribuirComAuditoria'>
  /** So `buscarUsuarioPorEmail`: este caso de uso nao cria sessao nem token. */
  readonly identidades: Pick<IdentityRepository, 'buscarUsuarioPorEmail'>
}

const semPermissao = (): DomainError =>
  new DomainError('SemPermissao', 'Voce nao pode atribuir este Chamado.')

/**
 * UM erro para tres causas: destinatario fora do cadastro, destinatario que nao
 * e Agente, e reatribuicao ao mesmo Dono.
 *
 * As duas primeiras precisam ser indistinguiveis: separa-las diria a quem chama
 * se um e-mail pertence a alguem da empresa, e transformaria a tool num
 * verificador de quadro de funcionarios (o raciocinio da resposta cega da
 * Story 1.3). A terceira entra junto porque tambem e "este destinatario nao
 * serve", e o codigo nao precisa de granularidade que ninguem usa.
 */
const atribuicaoInvalida = (): DomainError =>
  new DomainError('AtribuicaoInvalida', 'Nao e possivel atribuir o Chamado a esse destinatario.')

export const atribuirChamado =
  ({ repositorio, identidades }: AtribuirChamadoDeps) =>
  async (input: AtribuirChamadoInput, autor: Principal): Promise<AtribuirChamadoOutput> => {
    const bruto = await repositorio.buscarPorNumero(input.numero)
    const visivel = bruto === null ? null : visivelPara(autor, bruto)

    if (visivel === null) {
      throw ticketNaoEncontrado(input.numero)
    }

    // Autorizacao antes de qualquer validacao do destinatario: quem nao pode
    // atribuir nao deve descobrir, pela mensagem de erro, quem esta cadastrado.
    if (!pode(autor.role, 'atribuiChamado')) {
      throw semPermissao()
    }

    // Ausencia = self-assign. A normalizacao e a mesma do resto do sistema
    // (dominio, Story 1.9): sem ela, `Bruno@Empresa.com` e `bruno@empresa.com`
    // virariam duas pessoas.
    const destinatario = normalizarEmail(input.agente ?? autor.identity)
    const donoAtual = visivel.ticket.assignee

    // Reatribuir ao mesmo Dono nao e mudanca — e gravaria no Log um evento que
    // nao aconteceu (mesmo raciocinio da auto-transicao na 2.2).
    if (donoAtual !== null && normalizarEmail(donoAtual) === destinatario) {
      throw atribuicaoInvalida()
    }

    // O cadastro e a fonte: o papel vem de `users`, nunca da entrada. E a
    // capacidade e `recebeAtribuicao`, nao `atribuiChamado` — quem distribui
    // trabalho e quem recebe trabalho sao papeis que hoje coincidem, mas nao
    // sao a mesma pergunta.
    const usuario = await identidades.buscarUsuarioPorEmail(destinatario)

    if (usuario === null || !pode(usuario.papel, 'recebeAtribuicao')) {
      throw atribuicaoInvalida()
    }

    const resultado = await repositorio.atribuirComAuditoria({
      numero: input.numero,
      de: donoAtual,
      para: usuario.email,
      esperada: input.versao,
      autor,
    })

    if (resultado === null) {
      // `return` e nao `await`: a funcao devolve `Promise<never>`, e o `return`
      // e o que faz o TypeScript entender que o fluxo termina aqui.
      return conflitoOuSumico(repositorio, input.numero, autor)
    }

    return {
      numero: input.numero,
      de: donoAtual,
      para: usuario.email,
      versao: resultado.version,
    }
  }
