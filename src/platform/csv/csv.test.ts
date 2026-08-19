import { describe, expect, it } from 'vitest'
import { paraCsv } from './csv.js'

/**
 * CSV e formato hostil, e este arquivo e teste de SEGURANCA — nao de
 * formatacao. Duas familias de problema: escape (o arquivo mente sobre as
 * colunas) e formula (o arquivo EXECUTA na maquina de quem abre).
 */

const colunas = ['a', 'b'] as const

describe('escape (RFC 4180)', () => {
  it('sem caractere especial, nao poe aspas', () => {
    expect(paraCsv(colunas, [{ a: 'x', b: 'y' }])).toBe('a,b\nx,y')
  })

  it('campo com virgula vai entre aspas', () => {
    expect(paraCsv(colunas, [{ a: 'x,y', b: 'z' }])).toBe('a,b\n"x,y",z')
  })

  /** Sem duplicar a aspa, o campo termina no meio e as colunas deslocam. */
  it('aspas viram aspas duplas', () => {
    expect(paraCsv(colunas, [{ a: 'diz "oi"', b: 'z' }])).toBe('a,b\n"diz ""oi""",z')
  })

  it('quebra de linha nao quebra a linha do CSV', () => {
    const csv = paraCsv(colunas, [{ a: 'linha1\nlinha2', b: 'z' }])

    expect(csv).toBe('a,b\n"linha1\nlinha2",z')
    // O arquivo tem 3 linhas fisicas, mas 1 de dados — e e por isso que o campo
    // precisa das aspas.
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('nulo e indefinido viram campo vazio, nao "null"', () => {
    expect(paraCsv(colunas, [{ a: null, b: undefined }])).toBe('a,b\n,')
  })

  it('numero e data saem como texto', () => {
    expect(paraCsv(colunas, [{ a: 1042, b: new Date('2026-08-19T09:00:00Z') }])).toBe(
      'a,b\n1042,2026-08-19T09:00:00.000Z',
    )
  })
})

describe('formula (CSV injection)', () => {
  /**
   * O Titulo vem do SOLICITANTE. Um campo que comeca com `=` e interpretado
   * como formula pelo Excel e pelo Sheets — entrada de usuario indo para um
   * executor, a mesma classe do XSS com planilha no lugar do navegador.
   */
  it.each(["=cmd|' /C calc'!A0", '=1+1', '+1', '-1+1', '@SUM(A1)'])(
    'neutraliza %j com apostrofo',
    (perigoso) => {
      const csv = paraCsv(colunas, [{ a: perigoso, b: 'z' }])

      expect(csv.split('\n')[1]?.startsWith("'")).toBe(true)
      expect(csv).toContain(`'${perigoso}`)
    },
  )

  it('tab e retorno de carro no inicio tambem sao neutralizados', () => {
    for (const perigoso of ['\tx', '\rx']) {
      const csv = paraCsv(colunas, [{ a: perigoso, b: 'z' }])
      expect(csv.split('\n')[1]?.replace(/^"/, '').startsWith("'")).toBe(true)
    }
  })

  /** Hifen no meio e texto comum: so o INICIO do campo e perigoso. */
  it('nao mexe em campo que apenas contem os caracteres', () => {
    expect(paraCsv(colunas, [{ a: 'nota 1+1', b: 'a=b' }])).toBe('a,b\nnota 1+1,a=b')
  })

  /** Neutralizado E escapado: as duas coisas se aplicam ao mesmo campo. */
  it('campo perigoso COM virgula recebe os dois tratamentos', () => {
    expect(paraCsv(colunas, [{ a: '=1,2', b: 'z' }])).toBe('a,b\n"\'=1,2",z')
  })
})

describe('a forma do arquivo', () => {
  it('o cabecalho pode ser omitido, para juntar paginas', () => {
    expect(paraCsv(colunas, [{ a: 'x', b: 'y' }], { cabecalho: false })).toBe('x,y')
  })

  it('sem linhas, sai so o cabecalho', () => {
    expect(paraCsv(colunas, [])).toBe('a,b')
  })

  it('sem linhas e sem cabecalho, sai vazio', () => {
    expect(paraCsv(colunas, [], { cabecalho: false })).toBe('')
  })

  it('as colunas saem na ordem declarada, e so elas', () => {
    const csv = paraCsv(colunas, [{ b: 'segundo', a: 'primeiro', c: 'ignorado' }])

    expect(csv).toBe('a,b\nprimeiro,segundo')
  })
})
