import { describe, expect, it } from 'vitest'
import { linhaImportada } from './importacao.js'

/**
 * A validacao de uma linha do CSV (Story 4.2, FR-25).
 *
 * Repare que ela NAO lanca: a AC pede relatorio sem abortar o lote, e usar
 * excecao para controle de fluxo transformaria o caso normal (arquivo com
 * sujeira) em caminho de erro. O motivo e TEXTO — quem le e uma pessoa
 * conferindo a migracao.
 */

const completa = {
  numero_legado: 'INC-4711',
  titulo: 'VPN nao conecta',
  descricao: 'Sem acesso remoto.',
  categoria: 'rede',
  status: 'fechado',
  prioridade: 'alta',
  solicitante: 'marina@empresa.com',
  dono: 'bruno@empresa.com',
  criado_em: '2024-03-15T10:30:00Z',
}

const ok = (linha: Record<string, string>) => {
  const r = linhaImportada(linha)
  if (!r.ok) throw new Error(`esperava sucesso, veio: ${r.motivo}`)
  return r.novo
}

const recusa = (linha: Record<string, string>): string => {
  const r = linhaImportada(linha)
  if (r.ok) throw new Error('esperava recusa, mas a linha passou')
  return r.motivo
}

describe('a linha completa', () => {
  it('vira um Chamado com tudo preservado', () => {
    expect(ok(completa)).toEqual({
      numeroLegado: 'INC-4711',
      titulo: 'VPN nao conecta',
      descricao: 'Sem acesso remoto.',
      categoria: 'rede',
      // O Status vem do ARQUIVO: um Chamado que ja estava fechado entra
      // fechado, e nao transita pela maquina de estados (ele nao aconteceu
      // aqui).
      status: 'fechado',
      prioridade: 'alta',
      requester: 'marina@empresa.com',
      assignee: 'bruno@empresa.com',
      criadoEm: new Date('2024-03-15T10:30:00Z'),
    })
  })
})

describe('o que e obrigatorio', () => {
  it('sem numero_legado, recusa — e a chave da idempotencia', () => {
    expect(recusa({ ...completa, numero_legado: '' })).toMatch(/numero_legado/i)
  })

  it.each(['titulo', 'descricao'])('sem %s, recusa (mesma regra da abertura)', (campo) => {
    expect(recusa({ ...completa, [campo]: '   ' })).toMatch(new RegExp(campo, 'i'))
  })
})

describe('os defaults, e o que NAO se inventa', () => {
  /** `nao_classificado` (1.9) e "ninguem avaliou" — e verdade para um import. */
  it('categoria vazia vira nao_classificado', () => {
    expect(ok({ ...completa, categoria: '' }).categoria).toBe('nao_classificado')
  })

  /**
   * Presente e INVALIDA e diferente de ausente: cair em `nao_classificado`
   * aqui apagaria a informacao de que o sistema antigo tinha uma categoria que
   * este nao conhece — e o relatorio existe para isso aparecer.
   */
  it('categoria invalida RECUSA a linha, em vez de virar nao_classificado', () => {
    expect(recusa({ ...completa, categoria: 'impressoras' })).toMatch(/categoria/i)
  })

  it('status ausente vira aberto', () => {
    expect(ok({ ...completa, status: '' }).status).toBe('aberto')
  })

  it('status invalido recusa', () => {
    expect(recusa({ ...completa, status: 'pendente' })).toMatch(/status/i)
  })

  it('prioridade ausente vira a padrao', () => {
    expect(ok({ ...completa, prioridade: '' }).prioridade).toBe('media')
  })

  it('prioridade invalida recusa', () => {
    expect(recusa({ ...completa, prioridade: 'urgentissima' })).toMatch(/prioridade/i)
  })

  it('dono ausente vira sem Dono', () => {
    expect(ok({ ...completa, dono: '' }).assignee).toBeNull()
  })
})

describe('a data de abertura', () => {
  it('e preservada do arquivo', () => {
    expect(ok(completa).criadoEm).toEqual(new Date('2024-03-15T10:30:00Z'))
  })

  it('data invalida recusa, em vez de virar hoje em silencio', () => {
    expect(recusa({ ...completa, criado_em: '15/03/2024' })).toMatch(/data|criado/i)
  })

  /** Ausente e diferente de invalida: quem migra sabe que nao tinha a data. */
  it('data ausente vira indefinida, para quem grava decidir', () => {
    expect(ok({ ...completa, criado_em: '' }).criadoEm).toBeUndefined()
  })
})

describe('o Solicitante do arquivo', () => {
  it('e obrigatorio', () => {
    expect(recusa({ ...completa, solicitante: '' })).toMatch(/solicitante/i)
  })

  /**
   * Nao se valida contra `users`: o historico tem Chamado de gente que saiu da
   * empresa, e recusar essas linhas perderia justamente o que a migracao existe
   * para trazer. A consequencia esta registrada — esse Chamado nao tem dono
   * humano capaz de ve-lo ate a pessoa existir no cadastro.
   */
  it('aceita e-mail que nao esta no cadastro', () => {
    expect(ok({ ...completa, solicitante: 'quem.saiu@empresa.com' }).requester).toBe(
      'quem.saiu@empresa.com',
    )
  })
})
