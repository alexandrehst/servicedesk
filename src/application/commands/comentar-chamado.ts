import { acaoDeComentario } from '../../domain/auditoria.js'
import { criarComentario } from '../../domain/comentario.js'
import { DomainError } from '../../domain/errors.js'
import { pode } from '../../domain/papeis.js'
import { ticketNaoEncontrado, visivelPara } from '../../domain/visibilidade.js'
import type { ComentarChamadoOutput } from '../contracts/comentar-chamado.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'

/**
 * Command handler de Comentario (Story 2.1, FR-3).
 *
 * AD-2: unico caminho de escrita. AD-3: o Comentario e o registro de auditoria
 * saem na mesma transacao, dentro do repositorio.
 *
 * A ordem das checagens copia `excluirChamado` (1.7) e nao e estilo — ver o
 * comentario de `semPermissao` abaixo.
 */
export type ComentarChamadoDeps = {
  readonly repositorio: TicketRepository
}

export type ComentarChamadoEntrada = {
  readonly numero: number
  readonly texto: string
  readonly interno: boolean
}

/**
 * Quem VE o Chamado mas nao pode criar Comentario Interno.
 *
 * Distinto de `TicketNaoEncontrado` pelo mesmo motivo da Story 1.7: quem ja
 * enxerga o Chamado nao ganha protecao nenhuma com "nao encontrado", so
 * confusao. E a mensagem nao diz qual papel seria necessario — isso e mapa da
 * politica de autorizacao para quem esta sondando.
 */
const semPermissao = (): DomainError =>
  new DomainError('SemPermissao', 'Voce nao pode criar Comentario Interno.')

export const comentarChamado =
  ({ repositorio }: ComentarChamadoDeps) =>
  async (entrada: ComentarChamadoEntrada, autor: Principal): Promise<ComentarChamadoOutput> => {
    const bruto = await repositorio.buscarPorNumero(entrada.numero)

    // `visivelPara` ja descarta Chamado excluido (1.7) e alheio (1.4).
    // Comentar no que nao se pode ver e indistinguivel de comentar no que nao
    // existe — e e assim que deve ser: os Numeros sao sequenciais (AD-4), e a
    // distincao viraria um oraculo de existencia.
    const visivel = bruto === null ? null : visivelPara(autor, bruto)

    if (visivel === null) {
      throw ticketNaoEncontrado(entrada.numero)
    }

    // A posse ja foi resolvida acima. O que sobra e a capacidade, e ela e sobre
    // INTERNO — nao sobre comentar: o Solicitante comenta o proprio Chamado.
    if (entrada.interno && !pode(autor.role, 'comentaInterno')) {
      // Recusa explicita, e nao rebaixamento silencioso para publico. Quem
      // escreveu achando que era interno precisa saber que nao foi; criar um
      // Comentario publico a revelia exporia o texto a quem ele quis esconder.
      throw semPermissao()
    }

    // O dominio valida e rejeita com erro tipado. Se lancar, nada e persistido
    // porque a persistencia so acontece depois desta linha (1.1, 1.7).
    const novo = criarComentario({
      corpo: entrada.texto,
      autor: autor.identity,
      interno: entrada.interno,
    })

    // A acao do Log e decidida pelo DOMINIO, e chega pronta ao adapter — ele
    // grava, nao interpreta (achado do `claude-review` no PR #46).
    const { criadoEm } = await repositorio.criarComentarioComAuditoria(
      entrada.numero,
      novo,
      autor,
      acaoDeComentario(novo.internal),
    )

    return {
      numero: entrada.numero,
      autor: novo.autor,
      interno: novo.internal,
      criadoEm: criadoEm.toISOString(),
    }
  }
