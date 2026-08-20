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

/**
 * Leitura de CSV (Story 4.2, FR-25).
 *
 * Parser PROPRIO, e nao dependencia nova: o subconjunto necessario e pequeno, e
 * ele e exatamente o que o `paraCsv` acima PRODUZ — o teste que fecha o ciclo
 * (exportar e reimportar dando o mesmo dado) e o que sustenta os dois.
 *
 * O que ele aceita:
 *
 * - separador **virgula**;
 * - campo entre aspas duplas quando contem `,`, `"` ou quebra de linha;
 * - aspas internas **dobradas** (`""`);
 * - fim de linha `\n` ou `\r\n`.
 *
 * O que ele NAO aceita, e que vira lacuna quando o arquivo real do fornecedor
 * chegar: separador configuravel (`;` e comum em CSV pt-BR exportado do Excel),
 * encoding diferente de UTF-8, e BOM no inicio do arquivo.
 *
 * Ele tambem NAO desfaz a neutralizacao de formula do `paraCsv`: um campo que
 * volta como `'=1+1` fica assim. Desfazer exigiria adivinhar se o apostrofo era
 * do dado ou da protecao — e errar isso reintroduz a formula.
 */
export const deCsv = (texto: string): Record<string, string>[] => {
  const linhas = separarLinhas(texto)
  const [cabecalho, ...corpo] = linhas

  if (cabecalho === undefined) {
    return []
  }

  return corpo.map((campos) =>
    Object.fromEntries(cabecalho.map((coluna, i) => [coluna, campos[i] ?? ''])),
  )
}

/**
 * Percorre caractere a caractere porque `split(',')` e `split('\n')` quebram
 * exatamente nos casos que as aspas existem para proteger: virgula e quebra de
 * linha DENTRO do campo.
 */
const separarLinhas = (texto: string): string[][] => {
  const linhas: string[][] = []
  let campos: string[] = []
  let atual = ''
  let dentroDeAspas = false

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i]

    if (dentroDeAspas) {
      if (c === '"') {
        // Aspas dobradas: uma aspa literal, e seguimos dentro do campo.
        if (texto[i + 1] === '"') {
          atual += '"'
          i += 1
        } else {
          dentroDeAspas = false
        }
      } else {
        atual += c
      }
      continue
    }

    if (c === '"' && atual === '') {
      dentroDeAspas = true
    } else if (c === ',') {
      campos.push(atual)
      atual = ''
    } else if (c === '\n' || c === '\r') {
      // `\r\n` conta como UM fim de linha.
      if (c === '\r' && texto[i + 1] === '\n') {
        i += 1
      }
      campos.push(atual)
      linhas.push(campos)
      campos = []
      atual = ''
    } else {
      atual += c
    }
  }

  // A ultima linha so entra se houver conteudo: arquivo terminado em quebra de
  // linha nao produz uma linha vazia a mais.
  if (atual !== '' || campos.length > 0) {
    campos.push(atual)
    linhas.push(campos)
  }

  return linhas
}
