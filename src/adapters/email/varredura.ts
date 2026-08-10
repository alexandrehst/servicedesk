import type {
  MensagemRecebida,
  ResultadoDoIntake,
} from '../../application/contracts/intake-de-email.js'
import type { CaixaDeEntrada } from '../../application/ports/caixa-de-entrada.js'
import type { Logger } from '../../application/ports/logger.js'
import { analisarMensagem } from './mensagem.js'

/**
 * O laco que liga a caixa ao caso de uso (Story 1.9).
 *
 * Vive no adapter porque e aqui que texto bruto vira `MensagemRecebida` — e
 * interpretar RFC 5322 e detalhe de transporte. `application` recebe a
 * mensagem ja validada e nao sabe que IMAP existe.
 *
 * A responsabilidade propria deste modulo e uma so: garantir que UMA mensagem
 * ruim nao derrube o lote inteiro.
 */
export type VarreduraDeps = {
  readonly caixa: CaixaDeEntrada
  readonly processar: (mensagem: MensagemRecebida) => Promise<ResultadoDoIntake>
  readonly logger: Logger
}

/**
 * O que a varredura fez. Existe para ser observavel: sem contagem, "o intake
 * rodou" e "o intake rodou e nao achou nada" sao indistinguiveis de fora — e
 * um intake quebrado se parece exatamente com uma caixa vazia.
 */
export type ResumoDaVarredura = {
  readonly lidas: number
  readonly abertas: number
  readonly duplicadas: number
  readonly recusadas: number
  readonly falhas: number
}

export const criarVarredura =
  ({ caixa, processar, logger }: VarreduraDeps) =>
  async (): Promise<ResumoDaVarredura> => {
    const mensagens = await caixa.buscarNaoProcessadas()

    let abertas = 0
    let duplicadas = 0
    let recusadas = 0
    let falhas = 0

    for (const bruta of mensagens) {
      try {
        const resultado = await processar(await analisarMensagem(bruta.bruto))

        if (resultado.tipo === 'aberto') abertas += 1
        if (resultado.tipo === 'duplicado') duplicadas += 1
        if (resultado.tipo === 'recusado') recusadas += 1

        // Recusada TAMBEM e marcada: sem isso, todo e-mail de remetente
        // desconhecido voltaria em cada varredura e o log de recusa viraria
        // uma enxurrada que esconderia a recusa nova.
        await caixa.marcarProcessada(bruta.id)
      } catch (erro) {
        falhas += 1

        // A mensagem NAO e marcada — volta na proxima varredura. E seguro
        // porque a dedup por `Message-ID` reconhece o que ja virou Chamado;
        // sem ela, uma falha depois da abertura viraria Chamado repetido.
        //
        // O `continue` e o ponto do modulo: uma mensagem malformada nao pode
        // bloquear o intake ate alguem apagar o e-mail a mao.
        logger.erro('falha_ao_processar_mensagem', {
          mensagem: bruta.id,
          causa: erro instanceof Error ? erro.message : String(erro),
        })
      }
    }

    return { lidas: mensagens.length, abertas, duplicadas, recusadas, falhas }
  }
