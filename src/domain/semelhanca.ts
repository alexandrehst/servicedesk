import { DomainError } from './errors.js'

/**
 * Semelhanca entre Chamados (Story 3.5, FR-12).
 *
 * ZERO imports de application, adapters ou platform — nucleo puro.
 *
 * A busca da 3.4 procura SUBSTRING: o usuario informa uma palavra e o `ILIKE`
 * a encontra. Aqui a entrada e o TEXTO DE ABERTURA INTEIRO — uma frase —, e
 * nenhum Chamado contem a frase inteira como substring. Por isso a comparacao e
 * por trigramas (`similarity` do `pg_trgm`), que e a "busca textual simples"
 * que a FR-12 pede.
 */

/**
 * Abaixo deste valor, "semelhanca" e coincidencia de trigramas comuns —
 * artigos, terminacoes, pedacos de palavra frequentes. A sugestao vira ruido, e
 * ruido na abertura custa caro: empurra quem abre a "achar" que ja existe
 * Chamado, ou faz a IA propor fechar como duplicado algo que nao e.
 *
 * **Lista vazia e resposta melhor que palpite.**
 *
 * 0.3 e tambem o padrao do `pg_trgm` (`pg_trgm.similarity_threshold`), e a
 * coincidencia e deliberada: o operador `%` — o unico que usa o indice GIN —
 * filtra pelo threshold da SESSAO. Mantendo os dois iguais, o resultado nao
 * depende do estado da conexao que o pool entregar.
 */
export const LIMIAR_DE_SEMELHANCA = 0.3

/** Um trigrama tem tres caracteres: abaixo disso nao ha o que comparar. */
const MINIMO_DE_CARACTERES = 3

/**
 * Normaliza e valida o texto de entrada da sugestao.
 *
 * Reusa `TermoObrigatorio` (3.4) de proposito: e a mesma recusa — texto que nao
 * da para procurar. Um codigo novo separaria o que quem chama trata igual.
 */
export const textoParaSugestao = (texto: string): string => {
  const limpo = texto.trim()

  if (limpo.length < MINIMO_DE_CARACTERES) {
    throw new DomainError(
      'TermoObrigatorio',
      `A sugestao precisa de pelo menos ${MINIMO_DE_CARACTERES} caracteres para comparar.`,
    )
  }

  return limpo
}
