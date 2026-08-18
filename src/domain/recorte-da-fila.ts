import { DomainError } from './errors.js'
import type { QuemPergunta } from './visibilidade.js'

/**
 * Os recortes da Fila (Story 3.2, FR-9).
 *
 * ZERO imports de application, adapters ou platform — nucleo puro.
 *
 * A Story 3.1 deixou `dono` como `string | undefined`, e ausente significa "nao
 * filtre". Nao havia como expressar "sem Dono" sem dar dois significados ao
 * mesmo campo — `dono: null`, `dono: ''` ou uma string magica seriam
 * exatamente o "filtro escondido" que a FR-9 proibe.
 *
 * O recorte e um campo PROPRIO, com nome no protocolo: e isso que o torna de
 * primeira classe. A IA o descobre lendo o schema da tool, em vez de precisar
 * saber que "sem Dono" se escreve como um valor especial de outro campo.
 */
export const RECORTES = ['meus', 'sem_dono'] as const
export type Recorte = (typeof RECORTES)[number]

/**
 * QUAL filtro de Dono aplicar — dado, no molde de `EscopoDeLeitura` (3.1). O
 * adapter traduz para `WHERE` e nao decide nada.
 *
 * `meus` e `dono: 'fulano'` convergem para o MESMO caso (`identidade`): o que
 * difere entre eles e de ONDE VEM a identidade, e essa decisao e do dominio.
 */
export type FiltroDeDono =
  | { readonly tipo: 'qualquer' }
  | { readonly tipo: 'ninguem' }
  | { readonly tipo: 'identidade'; readonly identity: string }

export type EntradaDeRecorte = {
  readonly recorte?: Recorte
  readonly dono?: string
}

/**
 * Decide o filtro de Dono a partir do recorte, do filtro explicito e de QUEM
 * pergunta.
 *
 * `meus` = **sou o Dono**, com a identidade vindo do principal autenticado.
 * Nunca de um parametro: se fosse acucar para "preencha `dono` com a sua
 * identidade", quem chama teria que saber e escrever a identidade — e escreveria
 * errado em algum momento. A definicao e UNICA para todo papel, porque um
 * recorte que significasse coisas diferentes conforme o papel ("que eu atendo"
 * para o Agente, "que eu abri" para o Solicitante) seria impossivel de auditar:
 * duas pessoas leriam o mesmo nome e receberiam regras distintas.
 *
 * Consequencia aceita: para o Solicitante, `meus` devolve vazio — ele nunca
 * recebe atribuicao (`recebeAtribuicao`, Story 2.3). O que ele abriu ja e o
 * escopo padrao dele, sem recorte nenhum.
 */
export const filtroDeDono = (quem: QuemPergunta, entrada: EntradaDeRecorte): FiltroDeDono => {
  if (entrada.recorte !== undefined && entrada.dono !== undefined) {
    // Os dois respondem a MESMA pergunta ("de quem e este Chamado?"). Escolher
    // um vencedor em silencio decidiria pelo chamador, que nao saberia qual
    // filtro foi aplicado. Recusar inclusive quando "concordam": comparar
    // identidades aqui faria a regra depender de quem pergunta.
    throw new DomainError(
      'RecorteConflitante',
      'Use recorte OU dono, nao os dois: os dois filtram por Dono, e aceitar ambos exigiria escolher um em silencio.',
    )
  }

  if (entrada.recorte === 'sem_dono') {
    return { tipo: 'ninguem' }
  }

  if (entrada.recorte === 'meus') {
    return { tipo: 'identidade', identity: quem.identity }
  }

  return entrada.dono === undefined
    ? { tipo: 'qualquer' }
    : { tipo: 'identidade', identity: entrada.dono }
}
