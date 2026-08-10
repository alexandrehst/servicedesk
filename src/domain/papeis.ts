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
export type Capacidade = 'veChamadoDeTerceiro' | 'veComentarioInterno'

/**
 * `switch` exaustivo de proposito. Se um terceiro papel entrar em `PAPEIS` sem
 * linha aqui, o `never` no default vira erro de COMPILACAO.
 *
 * Um `Record<Papel, ...>` daria o mesmo alerta, mas um `if/else` com fallback
 * — que e o formato natural quando se tem dois papeis — deixaria o papel novo
 * cair silenciosamente no ramo menos privilegiado. Silencioso e o problema:
 * ninguem descobriria o papel sem politica ate alguem reclamar que nao ve o
 * que deveria, ou pior, ate ver o que nao deveria.
 */
export const pode = (papel: Papel, capacidade: Capacidade): boolean => {
  switch (papel) {
    case 'agente':
      // O Agente atende: precisa enxergar Chamado de qualquer Solicitante e a
      // conversa interna do time (FR-2).
      return capacidade === 'veChamadoDeTerceiro' || capacidade === 'veComentarioInterno'
    case 'solicitante':
      // O Solicitante ve apenas o que e dele, e so a parte publica da thread.
      return false
    default: {
      const naoTratado: never = papel
      throw new Error(`Papel sem politica de autorizacao: ${String(naoTratado)}`)
    }
  }
}
