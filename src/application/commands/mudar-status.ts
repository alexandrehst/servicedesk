import { duracaoLegivel } from '../../domain/duracao.js'
import { DomainError } from '../../domain/errors.js'
import { pode } from '../../domain/papeis.js'
import type { Status, Ticket } from '../../domain/ticket.js'
import { exigeConfirmacao, transicaoValida } from '../../domain/transicoes.js'
import { ticketNaoEncontrado, visivelPara } from '../../domain/visibilidade.js'
import type { MudarStatusInput, MudarStatusOutput } from '../contracts/mudar-status.js'
import type { Principal } from '../contracts/principal.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { conflitoOuSumico } from './mutacao-versionada.js'
import { type CanalDeNotificacao, notificarComLink } from './notificacao-de-chamado.js'

/**
 * Command handler de mudanca de Status (Story 2.2, FR-4).
 *
 * AD-2: unico caminho de escrita. AD-5: a maquina de estados que valida vive no
 * dominio, entao MCP e HTTP nao podem divergir. AD-10: a versao esperada e
 * verificada pelo BANCO, no proprio UPDATE.
 */
export type MudarStatusDeps = {
  readonly repositorio: TicketRepository
  /**
   * Story 2.5 — o e-mail de resolucao (FR-7, FR-18).
   *
   * Fica AQUI, no command, e nao numa tool dedicada, porque resolver ja e uma
   * transicao de `TRANSICOES` (2.2): uma acao propria criaria uma segunda porta
   * para o mesmo estado, e uma delas nao avisaria ninguem. Como o command e o
   * unico caminho de escrita (AD-2), MCP, HTTP e a UI da Fase 1.5 herdam a
   * notificacao sem poder pula-la.
   *
   * Opcional pelo mesmo motivo da 1.6: ha caminhos (testes, futuros scripts)
   * sem para quem avisar, e torna-la obrigatoria viraria acoplamento.
   */
  readonly notificacao?: CanalDeNotificacao & {
    /**
     * O relogio do "tempo total". Injetado como em todo o resto do projeto —
     * sem isso o teste da duracao mediria o relogio da maquina de CI.
     */
    readonly agora: () => Date
  }
}

const semPermissao = (): DomainError =>
  new DomainError('SemPermissao', 'Voce nao pode mudar o Status deste Chamado.')

/**
 * A transicao existe, mas so com confirmacao explicita (Story 2.6, AD-7).
 *
 * A mensagem diz QUAL acao usar porque quem chegou aqui ja tem permissao de
 * mudar Status — a informacao nao entrega nada a quem esta sondando, e sem ela
 * a IA ficaria tentando a tool generica em loop.
 */
const exigeAcaoDedicada = (para: Status): DomainError =>
  new DomainError(
    'TransicaoInvalida',
    `Mudar para "${para}" e acao irreversivel e exige confirmacao explicita: use a acao dedicada.`,
  )

export const mudarStatus =
  ({ repositorio, notificacao }: MudarStatusDeps) =>
  async (input: MudarStatusInput, autor: Principal): Promise<MudarStatusOutput> => {
    const bruto = await repositorio.buscarPorNumero(input.numero)
    const visivel = bruto === null ? null : visivelPara(autor, bruto)

    // `visivelPara` ja descarta excluido (1.7) e alheio (1.4).
    if (visivel === null) {
      throw ticketNaoEncontrado(input.numero)
    }

    // Autorizacao ANTES da validacao da transicao, e a ordem importa: um
    // Solicitante pedindo transicao invalida deve receber `SemPermissao`, e nao
    // `TransicaoInvalida`. O segundo lhe ensinaria como a maquina de estados
    // funciona, e ele nao tem direito de agir de qualquer forma.
    if (!pode(autor.role, 'mudaStatus')) {
      throw semPermissao()
    }

    const de = visivel.ticket.status
    const para = input.novoStatus

    // A porta dos fundos que nao pode existir: fechar, cancelar e reabrir tem
    // acoes dedicadas com confirmacao (2.6). Se `mudar_status` as executasse, a
    // IA encerraria Chamado sem human-in-the-loop.
    if (exigeConfirmacao(de, para)) {
      throw exigeAcaoDedicada(para)
    }

    if (!transicaoValida(de, para)) {
      throw new DomainError('TransicaoInvalida', `Nao e possivel mudar de "${de}" para "${para}".`)
    }

    const resultado = await repositorio.mudarStatusComAuditoria({
      numero: input.numero,
      de,
      para,
      esperada: input.versao,
      autor,
    })

    if (resultado === null) {
      // `return` e nao `await`: a funcao devolve `Promise<never>`, e o `return`
      // e o que faz o TypeScript entender que o fluxo termina aqui.
      //
      // Repare que o e-mail fica DEPOIS desta linha: notificar antes avisaria o
      // Solicitante de uma resolucao que perdeu o conflito e nao aconteceu. E a
      // licao da 1.7 ("escrita que nao aconteceu nao vira auditoria") aplicada
      // a notificacao.
      return conflitoOuSumico(repositorio, input.numero, autor)
    }

    // Fora da transacao do AD-3, que ja fechou: o SMTP dentro dela prenderia a
    // linha do Chamado e desfaria a resolucao se falhasse (decisao da 1.6).
    if (para === 'resolvido' && notificacao !== undefined) {
      await notificarResolucao(notificacao, visivel.ticket, autor)
    }

    return { numero: input.numero, de, para, versao: resultado.version }
  }

/**
 * A mensagem da RESOLUCAO. O que ela tem de comum com o e-mail de abertura —
 * emitir o link, absorver a falha sem engoli-la — vive em `notificarComLink`.
 */
const notificarResolucao = async (
  canal: NonNullable<MudarStatusDeps['notificacao']>,
  ticket: Ticket,
  autor: Principal,
): Promise<void> =>
  notificarComLink(
    canal,
    {
      numero: ticket.number,
      destinatario: ticket.requester,
      evento: 'falha_ao_notificar_resolucao',
    },
    (notificador, link) =>
      notificador.enviarChamadoResolvido({
        destinatario: ticket.requester,
        numero: ticket.number,
        titulo: ticket.titulo,
        // Quem EXECUTOU a acao (AD-9), nunca o Dono: um Agente pode resolver o
        // Chamado que esta na fila de outro.
        resolvidoPor: autor.identity,
        duracao: duracaoLegivel(ticket.criadoEm, canal.agora()),
        link,
      }),
  )
