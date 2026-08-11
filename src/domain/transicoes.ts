import type { Status } from './ticket.js'

/**
 * A maquina de estados do Chamado (AD-5, FR-4, Story 2.2).
 *
 * ZERO imports de application, adapters ou platform — nucleo puro.
 *
 * O AD-5 existe para impedir que "o adapter MCP permita uma transicao que a API
 * proibe". Por isso a tabela e UMA, aqui, e os dois pontos de entrada chamam a
 * mesma funcao.
 *
 * `Record<Status, ...>` e deliberado, como em `papeis.ts`: Status novo sem
 * decisao de transicao e erro de COMPILACAO, e nao uma lista vazia silenciosa
 * que faria alguem passar a tarde descobrindo por que o Chamado nao anda.
 */

/**
 * O que `mudar_status` executa.
 *
 * `em_andamento -> aberto` esta aqui de proposito: devolver um Chamado a fila
 * nao e destrutivo, e acontece quando o Agente percebe que nao e com ele. Nao
 * confundir com REABRIR, que traz de volta algo ja encerrado.
 */
export const TRANSICOES: Record<Status, readonly Status[]> = {
  aberto: ['em_andamento'],
  em_andamento: ['resolvido', 'aberto'],
  resolvido: ['em_andamento'],
  // Terminais para o fluxo comum: so se sai deles reabrindo, e reabrir exige
  // confirmacao (tabela abaixo).
  fechado: [],
  cancelado: [],
}

/**
 * As transicoes IRREVERSIVEIS, que a Story 2.6 vai executar com confirmacao
 * explicita (AD-7, FR-15, FR-17).
 *
 * Elas sao declaradas AGORA, e separadas, por um motivo de seguranca: se
 * `mudar_status` as aceitasse, a IA poderia encerrar um Chamado chamando a tool
 * generica, sem human-in-the-loop — e o guardrail da 2.6 nasceria furado.
 *
 * Aqui existe so a declaracao. O caminho de execucao e a 2.6.
 */
export const TRANSICOES_COM_CONFIRMACAO: Record<Status, readonly Status[]> = {
  aberto: ['cancelado'],
  em_andamento: ['cancelado'],
  resolvido: ['fechado'],
  // Reabrir devolve ao atendimento (o epics: "Reabrir volta o Status para Em
  // andamento").
  fechado: ['em_andamento'],
  cancelado: ['em_andamento'],
}

/**
 * A transicao pode ser executada por `mudar_status`?
 *
 * Nao ha guarda contra auto-transicao (`aberto -> aberto`) aqui, e isso e
 * deliberado: nenhuma tabela lista o proprio estado como destino, entao a
 * guarda seria codigo nao exercitado — uma mutacao que a removesse sobreviveria,
 * o que e o sintoma de que ela nao protege nada.
 *
 * A invariante vive onde ela e de fato decidida: nos DADOS. O teste
 * "nenhuma tabela tem auto-transicao" reprova se alguem escrever
 * `aberto: ['aberto']`.
 */
export const transicaoValida = (de: Status, para: Status): boolean => TRANSICOES[de].includes(para)

/** A transicao existe, mas so a Story 2.6 pode executa-la (com confirmacao). */
export const exigeConfirmacao = (de: Status, para: Status): boolean =>
  TRANSICOES_COM_CONFIRMACAO[de].includes(para)
