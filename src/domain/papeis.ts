/**
 * Papeis e o que cada um pode ver (FR-20, AD-8).
 *
 * ZERO imports de application, adapters ou platform — nucleo puro.
 *
 * A razao de existir deste modulo: ate a Story 1.3 a decisao de papel era uma
 * comparacao `role === 'agente'` escrita em cada lugar que precisava dela. Duas
 * ocorrencias ainda dava para acompanhar; o Epic 3 traz fila, busca, resumo e
 * "parecidos", e cada leitura nova seria mais uma chance de escrever a regra
 * de um jeito ligeiramente diferente. Aqui a regra e UMA tabela.
 */

export const PAPEIS = ['solicitante', 'agente'] as const
export type Papel = (typeof PAPEIS)[number]

/**
 * Capacidades sao declaradas pelo que a pessoa VE, nao por nome de tela ou de
 * tool: "ve Comentario Interno" continua valendo quando a interface mudar.
 */
export type Capacidade = 'veChamadoDeTerceiro' | 'veComentarioInterno' | 'excluiChamado'

/**
 * Quem pode o quê. `Record<Capacidade, ...>` é deliberado: o TypeScript exige
 * uma linha para **cada** capacidade, então acrescentar uma sem decidir quem a
 * tem é erro de COMPILAÇÃO.
 *
 * A direção importa. Uma tabela `papel -> capacidades` deixaria capacidade nova
 * cair silenciosamente em "ninguém pode" — seguro, mas invisível, e alguém
 * passaria uma tarde descobrindo por que o Agente não consegue agir. Do jeito
 * que está, quem acrescenta a capacidade é obrigado a declarar a política junto.
 *
 * Papel novo em `PAPEIS` que não apareça em nenhuma lista fica sem privilégio
 * algum — o default seguro.
 */
const QUEM_PODE: Record<Capacidade, readonly Papel[]> = {
  // O Agente atende: enxerga Chamado de qualquer Solicitante e le a conversa
  // interna do time (FR-2).
  veChamadoDeTerceiro: ['agente'],
  veComentarioInterno: ['agente'],
  // Excluir e acao de quem atende (FR-23, Story 1.7). O Solicitante nao decide
  // que o proprio Chamado deixa de existir.
  excluiChamado: ['agente'],
}

export const pode = (papel: Papel, capacidade: Capacidade): boolean => {
  if (!(PAPEIS as readonly string[]).includes(papel)) {
    // So alcancavel com cast — e e assim que aconteceria de verdade: uma linha
    // corrompida em `users`. Falha ALTO de proposito. Um `false` faria a pessoa
    // simplesmente nao ver o que deveria, sem ninguem entender por que.
    throw new Error(`Papel sem politica de autorizacao: ${String(papel)}`)
  }

  return QUEM_PODE[capacidade].includes(papel)
}
