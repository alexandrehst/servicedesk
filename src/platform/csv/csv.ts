/**
 * Geracao de CSV (Story 4.1, FR-24).
 *
 * Vive em `platform` porque CSV e FORMATO, nao regra de negocio — mas o que
 * este modulo faz e, sobretudo, seguranca:
 *
 * 1. **Escape (RFC 4180).** Campo com virgula, aspas ou quebra de linha desloca
 *    as colunas se sair cru, e o arquivo inteiro passa a mentir.
 * 2. **Formula (CSV injection).** Campo que comeca com `=`, `+`, `-`, `@`, tab
 *    ou CR e interpretado como FORMULA pelo Excel e pelo Sheets. O Titulo de um
 *    Chamado vem do Solicitante: e entrada de usuario indo para um executor.
 */

/** Recomendacao do OWASP: prefixar com apostrofo neutraliza a formula. */
const INICIOS_PERIGOSOS = ['=', '+', '-', '@', '\t', '\r']

const PRECISA_ASPAS = /[",\n\r]/

const texto = (valor: unknown): string => {
  if (valor === null || valor === undefined) {
    // Campo vazio, e nao a string "null": um CSV com "null" no lugar de vazio
    // reimporta como texto literal.
    return ''
  }

  return valor instanceof Date ? valor.toISOString() : String(valor)
}

/**
 * Um campo, pronto para o arquivo.
 *
 * A ordem importa: neutralizar ANTES de escapar, porque o apostrofo entra no
 * conteudo e um campo perigoso que tambem tenha virgula precisa dos dois
 * tratamentos.
 *
 * O apostrofo **altera o dado** — e essa e a troca deliberada: fidelidade do
 * campo contra execucao de codigo na maquina de quem abre o arquivo.
 */
const campo = (valor: unknown): string => {
  const bruto = texto(valor)
  const seguro = INICIOS_PERIGOSOS.some((inicio) => bruto.startsWith(inicio)) ? `'${bruto}` : bruto

  return PRECISA_ASPAS.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro
}

export type OpcoesDeCsv = {
  /**
   * Story 4.1 — quem pagina precisa juntar os pedacos, e um cabecalho repetido
   * no meio do arquivo o corrompe. Da segunda pagina em diante, `false`.
   */
  readonly cabecalho?: boolean
}

/**
 * Monta o CSV a partir das COLUNAS declaradas — e so delas: campo extra no
 * objeto e ignorado, entao acrescentar uma coluna e uma decisao explicita.
 *
 * Sem BOM: o BOM UTF-8 ajuda o Excel a abrir acento num ARQUIVO salvo, e aqui o
 * CSV volta como texto na resposta da tool, onde ele apareceria como lixo no
 * comeco. Se um dia houver download, o BOM entra la.
 */
export const paraCsv = <const C extends readonly string[]>(
  colunas: C,
  linhas: readonly Record<string, unknown>[],
  opcoes: OpcoesDeCsv = {},
): string => {
  const corpo = linhas.map((linha) => colunas.map((coluna) => campo(linha[coluna])).join(','))

  return (opcoes.cabecalho === false ? corpo : [colunas.join(','), ...corpo]).join('\n')
}
