import { DomainError } from './errors.js'
import { pode } from './papeis.js'
import type { QuemPergunta } from './visibilidade.js'

/**
 * O alcance de uma busca textual (Story 3.4, FR-11).
 *
 * ZERO imports de application, adapters ou platform — nucleo puro.
 *
 * Existe por causa de um vazamento que as camadas anteriores NAO pegam. O
 * gargalo do AD-8 (`filaVisivelPara`) reaplica `podeVerTicket`, que sabe de
 * POSSE e EXCLUSAO — e nao sabe nada sobre o CONTEUDO que fez a linha voltar.
 *
 * Entao: um Comentario Interno dizendo "escalar para o juridico" faz o Chamado
 * da propria Solicitante casar numa busca por "juridico". O gargalo deixa
 * passar (o Chamado E dela), o conteudo nao aparece — mas a EXISTENCIA do
 * resultado ja contou que a conversa interna fala daquilo. E o mesmo raciocinio
 * da resposta cega da 1.3 e do `AtribuicaoInvalida` da 2.3, agora num `LIKE`:
 * o que casa a busca tambem e informacao.
 *
 * A decisao e daqui; a traducao para `WHERE` e do adapter, como em
 * `escopoDeLeitura` (3.1) e `filtroDeDono` (3.2).
 */
export type AlcanceDaBusca = {
  readonly termo: string
  /**
   * Se o match pode considerar Comentario Interno. NAO e sobre exibir — o
   * resumo da Fila nunca mostra Comentario — e sim sobre o que pode FAZER um
   * Chamado aparecer.
   */
  readonly comentarios: 'todos' | 'apenasPublicos'
}

export const alcanceDaBusca = (quem: QuemPergunta, texto: string): AlcanceDaBusca => {
  const termo = texto.trim()

  if (termo.length === 0) {
    // Termo vazio devolveria a base inteira com cara de resultado de busca.
    throw new DomainError('TermoObrigatorio', 'A busca precisa de um termo.')
  }

  return {
    termo,
    comentarios: pode(quem.role, 'veComentarioInterno') ? 'todos' : 'apenasPublicos',
  }
}
