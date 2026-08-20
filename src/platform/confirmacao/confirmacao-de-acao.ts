import type { Principal } from '../../application/contracts/principal.js'
import type {
  AcaoDeConfirmacao,
  ConfirmacaoRepository,
} from '../../application/ports/confirmacao-repository.js'
import type { AlvoDeConfirmacao } from '../../domain/alvo-de-confirmacao.js'
import type { Status } from '../../domain/ticket.js'
import { gerarToken, hashToken } from '../auth/token.js'

/**
 * Confirmacao de Acao irreversivel (Story 2.6, AD-7, FR-15, FR-17).
 *
 * O mecanismo e o mesmo do magic link (1.3) — token de 256 bits, hash no banco,
 * consumo atomico — e o que muda sao duas decisoes:
 *
 * - **Escopo triplo.** O token vale para UM objeto, UMA acao e UMA identidade.
 *   O link de login vale para uma pessoa; este vale para uma INTENCAO.
 *   (Story 4.3: o objeto era sempre um Chamado; virou `AlvoDeConfirmacao`,
 *   porque excluir Comentario e Usuario tambem exigem confirmacao.)
 * - **Cinco minutos.** Nao os 15 do login nem os 7 dias do link de acesso. A
 *   pergunta que fixa o numero e "quanto tempo e razoavel entre a IA perguntar
 *   e o humano responder na mesma conversa?" — e uma janela longa transforma a
 *   confirmacao em algo que fica pendurado, disponivel para ser usado depois
 *   que o contexto mudou.
 *
 * O que este modulo NAO consegue garantir, e que precisa estar dito: nenhum
 * protocolo do lado do servidor prova que um HUMANO confirmou. A IA pode
 * encadear as duas chamadas. O que ele garante e que nada muda sem um sinal que
 * o servidor emitiu, e que as duas etapas ficam no Log — o intervalo entre elas
 * e a evidencia que sobra.
 */

/** Decisao registrada em 2026-08-18. Nao mudar sem revisita-la. */
export const VALIDADE_DA_CONFIRMACAO_MS = 5 * 60 * 1000

export type ConfirmacaoDeps = {
  readonly repositorio: ConfirmacaoRepository
  readonly agora: () => Date
}

export type EscopoDaConfirmacao = {
  readonly alvo: AlvoDeConfirmacao
  readonly acao: AcaoDeConfirmacao
  readonly identity: string
}

export type PedidoDeConfirmacao = {
  readonly alvo: AlvoDeConfirmacao
  /** Nulo quando a acao nao e sobre um Chamado (4.3) — so para o Log. */
  readonly ticketNumber: number | null
  readonly acao: AcaoDeConfirmacao
  readonly autor: Principal
  /** Nulos nas exclusoes: excluir nao muda Status de nada. */
  readonly de: Status | null
  readonly para: Status | null
}

/**
 * Emite a confirmacao e devolve o token **cru**, que existe uma vez so: ele vai
 * na resposta do `ConfirmationRequired` e some. O banco fica com o hash.
 */
export const emitirConfirmacao =
  ({ repositorio, agora }: ConfirmacaoDeps) =>
  async (pedido: PedidoDeConfirmacao): Promise<string> => {
    const token = gerarToken()

    await repositorio.criarConfirmacaoComAuditoria({
      ...pedido,
      tokenHash: hashToken(token),
      expiraEm: new Date(agora().getTime() + VALIDADE_DA_CONFIRMACAO_MS),
    })

    return token
  }

/**
 * Consome a confirmacao. `false` para todos os motivos, sem distinguir:
 * "expirou" e "nao existe" contam a mesma coisa a quem esta sondando.
 */
export const consumirConfirmacao =
  ({ repositorio, agora }: ConfirmacaoDeps) =>
  async (token: string, escopo: EscopoDaConfirmacao): Promise<boolean> => {
    if (token.length === 0) {
      return false
    }

    return repositorio.consumirConfirmacao({
      ...escopo,
      tokenHash: hashToken(token),
      agora: agora(),
    })
  }
