import { describe, expect, it } from 'vitest'
import { abrirTicket, PRIORIDADE_PADRAO, PRIORIDADES } from './ticket.js'

/**
 * Prioridade e conjunto fechado (FR-6) e todo Chamado nasce com uma: nula seria
 * um terceiro estado que a fila do Epic 3 teria que tratar em toda ordenacao, e
 * que nao significa nada para quem atende.
 */

const valido = {
  titulo: 'Notebook nao liga',
  descricao: 'Apertei o botao e nada acontece.',
  categoria: 'hardware',
  requester: 'marina@empresa.com',
}

describe('PRIORIDADES', () => {
  it('cobre de baixa a critica, na ordem de urgencia', () => {
    expect([...PRIORIDADES]).toEqual(['baixa', 'media', 'alta', 'critica'])
  })

  it('nao tem valor repetido', () => {
    expect(new Set(PRIORIDADES).size).toBe(PRIORIDADES.length)
  })

  it('o padrao esta na lista', () => {
    expect(PRIORIDADES).toContain(PRIORIDADE_PADRAO)
  })

  /** Minusculas sem acento, como STATUS, CATEGORIAS, ORIGENS e PAPEIS. */
  it.each(PRIORIDADES)('%s segue a convencao de nomes do projeto', (p) => {
    expect(p).toBe(p.toLowerCase())
    expect(p).toMatch(/^[a-z_]+$/)
  })
})

describe('a Prioridade na abertura (AC #2)', () => {
  it('sem informar, o Chamado nasce com a padrao', () => {
    expect(abrirTicket(valido).prioridade).toBe('media')
  })

  it('informada, e respeitada', () => {
    expect(abrirTicket({ ...valido, prioridade: 'critica' }).prioridade).toBe('critica')
  })

  /**
   * O campo e OPCIONAL na abertura de proposito: o intake por e-mail (1.9) nao
   * informa prioridade, e a tool `abrir_chamado` nao passou a exigir um campo
   * novo por causa desta story.
   */
  it('nenhum Chamado nasce sem Prioridade', () => {
    expect(abrirTicket(valido)).toHaveProperty('prioridade')
  })
})
