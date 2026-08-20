import {
  ACOES_IRREVERSIVEIS,
  type AcaoIrreversivel,
  motivoValido,
} from '../../domain/acoes-irreversiveis.js'
import { type AlvoDeConfirmacao, alvoDoChamado } from '../../domain/alvo-de-confirmacao.js'
import { DomainError } from '../../domain/errors.js'
import { pode } from '../../domain/papeis.js'
import type { Status } from '../../domain/ticket.js'
import { exigeConfirmacao } from '../../domain/transicoes.js'
import { ticketNaoEncontrado, visivelPara } from '../../domain/visibilidade.js'
import type {
  AcaoIrreversivelInput,
  AcaoIrreversivelOutput,
} from '../contracts/acao-irreversivel.js'
import type { Principal } from '../contracts/principal.js'
import type { AcaoDeConfirmacao } from '../ports/confirmacao-repository.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { conflitoOuSumico } from './mutacao-versionada.js'

/**
 * Command handler das Acoes irreversiveis (Story 2.6, AD-7, FR-7, FR-15, FR-17).
 *
 * UM command para as tres — fechar, cancelar e reabrir sao a MESMA coisa: uma
 * transicao de `TRANSICOES_COM_CONFIRMACAO` que exige confirmacao. O que varia
 * (destino, capacidade, exigir motivo) e DADO, e mora em `ACOES_IRREVERSIVEIS`,
 * no dominio. Tres commands copiados seriam a duplicacao que o Sonar reprovou
 * no PR #50 — e tres chances de uma delas esquecer uma garantia.
 *
 * AD-7: a exigencia de confirmacao vive AQUI, no caso de uso, e nao no adapter
 * MCP. Um adapter HTTP futuro e a UI da Fase 1.5 a herdam sem poder pula-la.
 */
/**
 * Story 4.3: o escopo do token deixou de ser "um Chamado" e passou a ser "um
 * OBJETO" (`AlvoDeConfirmacao`), porque as exclusoes de Comentario e Usuario
 * tambem exigem confirmacao e nenhuma delas e sobre um Chamado. Este command
 * continua montando o alvo pelo dominio (`alvoDoChamado`), nunca a mao.
 */
export type Confirmacao = {
  /** Emite o token e registra o PEDIDO no Log, na mesma transacao. */
  readonly emitir: (pedido: {
    readonly alvo: AlvoDeConfirmacao
    readonly ticketNumber: number | null
    readonly acao: AcaoDeConfirmacao
    readonly autor: Principal
    readonly de: Status | null
    readonly para: Status | null
  }) => Promise<string>
  /** Consome; `false` para nao existe, escopo errado, expirado ou ja usado. */
  readonly consumir: (
    token: string,
    escopo: {
      readonly alvo: AlvoDeConfirmacao
      readonly acao: AcaoDeConfirmacao
      readonly identity: string
    },
  ) => Promise<boolean>
}

export type AcaoIrreversivelDeps = {
  readonly repositorio: Pick<
    TicketRepository,
    'buscarPorNumero' | 'executarAcaoIrreversivelComAuditoria'
  >
  readonly confirmacao: Confirmacao
}

/**
 * A MESMA resposta para os cinco casos: nao mandou confirmacao, mandou uma que
 * nao existe, de outra acao, de outro Chamado, expirada ou ja usada.
 *
 * Distinguir "expirou" de "nao existe" so ensina a sondar — decisao da 1.3
 * (`CredencialInvalida`) e da 2.3 (`AtribuicaoInvalida`).
 *
 * O token cru viaja NESTA mensagem, e e a unica vez que ele existe. Ele nao vai
 * para log nenhum (AD-9); e de baixo valor por construcao — 5 minutos, uso
 * unico, escopo de uma acao num Chamado.
 */
const confirmacaoNecessaria = (
  numero: number,
  acao: AcaoIrreversivel,
  token?: string,
): DomainError =>
  new DomainError(
    'ConfirmationRequired',
    token === undefined
      ? `Confirmacao invalida ou expirada para "${acao}" no Chamado #${numero}. Peca uma nova.`
      : `A acao "${acao}" no Chamado #${numero} e IRREVERSIVEL e exige confirmacao humana explicita. ` +
          `Mostre isto a quem decide e, com o aval, repita a chamada com confirmacao="${token}" (vale 5 minutos, uma vez so).`,
  )

export const acaoIrreversivel =
  ({ repositorio, confirmacao }: AcaoIrreversivelDeps) =>
  (acao: AcaoIrreversivel) =>
  async (input: AcaoIrreversivelInput, autor: Principal): Promise<AcaoIrreversivelOutput> => {
    const { destino, capacidade } = ACOES_IRREVERSIVEIS[acao]

    const bruto = await repositorio.buscarPorNumero(input.numero)
    const visivel = bruto === null ? null : visivelPara(autor, bruto)

    // `visivelPara` ja descarta excluido (1.7) e alheio (1.4).
    if (visivel === null) {
      throw ticketNaoEncontrado(input.numero)
    }

    // Autorizacao ANTES de qualquer coisa que produza efeito ou informacao.
    // Emitir confirmacao para quem nao pode agir vazaria duas coisas: que o
    // Chamado esta naquele estado, e que a acao seria valida.
    if (!pode(autor.role, capacidade)) {
      throw new DomainError('SemPermissao', `Voce nao pode executar "${acao}" neste Chamado.`)
    }

    const de = visivel.ticket.status

    // A maquina de estados decide, como em `mudar_status` (AD-5). Fechar um
    // Chamado `aberto` nao e irreversivel: e invalido — e emitir confirmacao
    // para ele ensinaria a maquina de estados a quem esta sondando.
    if (!exigeConfirmacao(de, destino)) {
      throw new DomainError(
        'TransicaoInvalida',
        `Nao e possivel executar "${acao}" em um Chamado "${de}".`,
      )
    }

    // A exigencia do motivo vem do DOMINIO, nao do schema Zod: validar so no
    // contrato faria o adapter HTTP e a UI da Fase 1.5 dependerem de lembrar
    // dela (AD-7).
    if (!motivoValido(acao, input.motivo)) {
      throw new DomainError(
        'MotivoObrigatorio',
        `Reabrir um Chamado exige o motivo: o Log registra que alguem desfez um encerramento, e sem o porque o registro nao serve para nada.`,
      )
    }

    if (input.confirmacao === undefined) {
      const token = await confirmacao.emitir({
        alvo: alvoDoChamado(input.numero),
        ticketNumber: input.numero,
        acao,
        autor,
        de,
        para: destino,
      })

      throw confirmacaoNecessaria(input.numero, acao, token)
    }

    // Consumir ANTES do UPDATE, e isso e deliberado: se a versao divergiu, a
    // confirmacao JA queimou e a IA precisa pedir outra. O humano confirmou
    // "fechar o Chamado na versao N", e a versao mudou — reaproveitar o aval
    // seria executa-lo sobre um Chamado que ja nao e o que ele viu.
    const valeu = await confirmacao.consumir(input.confirmacao, {
      alvo: alvoDoChamado(input.numero),
      acao,
      identity: autor.identity,
    })

    if (!valeu) {
      throw confirmacaoNecessaria(input.numero, acao)
    }

    const resultado = await repositorio.executarAcaoIrreversivelComAuditoria({
      numero: input.numero,
      acao,
      de,
      para: destino,
      // Da ENTRADA, nunca do Chamado lido (AD-10): usar a lida faria o command
      // estar sempre "certo" sobre a versao, e nao haveria conflito nenhum.
      esperada: input.versao,
      autor,
      // Espalhado condicionalmente, e nao `motivo: input.motivo`: com
      // `exactOptionalPropertyTypes`, passar `undefined` explicito para um
      // campo opcional e diferente de nao passa-lo — e o que vai ao banco
      // precisa ser a ausencia, nao um `undefined` viajando.
      ...(input.motivo === undefined ? {} : { motivo: input.motivo }),
    })

    if (resultado === null) {
      return conflitoOuSumico(repositorio, input.numero, autor)
    }

    return { numero: input.numero, de, para: destino, versao: resultado.version }
  }
