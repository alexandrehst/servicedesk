import { describe, expect, it } from 'vitest'
import { DomainError } from './errors.js'
import { abrirTicket, ehCategoria } from './ticket.js'

const valido = {
  titulo: 'Notebook nao liga',
  descricao: 'Apertei o botao e nada acontece.',
  categoria: 'hardware',
  requester: 'marina@empresa.com',
}

describe('abrirTicket', () => {
  it('cria o Chamado com Status aberto e sem Dono', () => {
    const ticket = abrirTicket(valido)
    expect(ticket.status).toBe('aberto')
    expect(ticket.assignee).toBeNull()
  })

  it('nao expoe Numero: quem atribui e a persistencia (AD-4)', () => {
    expect(abrirTicket(valido)).not.toHaveProperty('number')
  })

  it('remove espacos em volta do titulo e da descricao', () => {
    const ticket = abrirTicket({ ...valido, titulo: '  Impressora  ', descricao: '  Sem toner  ' })
    expect(ticket.titulo).toBe('Impressora')
    expect(ticket.descricao).toBe('Sem toner')
  })

  it('registra o Solicitante', () => {
    expect(abrirTicket(valido).requester).toBe('marina@empresa.com')
  })

  it.each(['', '   '])('rejeita titulo vazio (%j) com erro tipado', (titulo) => {
    expect(() => abrirTicket({ ...valido, titulo })).toThrowError(DomainError)
    try {
      abrirTicket({ ...valido, titulo })
    } catch (erro) {
      expect((erro as DomainError).code).toBe('TituloObrigatorio')
    }
  })

  it('rejeita descricao vazia com erro tipado', () => {
    try {
      abrirTicket({ ...valido, descricao: '  ' })
      expect.unreachable('deveria ter lancado')
    } catch (erro) {
      expect((erro as DomainError).code).toBe('DescricaoObrigatoria')
    }
  })

  it('rejeita categoria fora da lista fixa', () => {
    try {
      abrirTicket({ ...valido, categoria: 'jardinagem' })
      expect.unreachable('deveria ter lancado')
    } catch (erro) {
      expect((erro as DomainError).code).toBe('CategoriaInvalida')
      expect((erro as DomainError).message).toContain('hardware')
    }
  })
})

describe('ehCategoria', () => {
  it.each(['hardware', 'software', 'rede', 'acesso'])('aceita %s', (c) => {
    expect(ehCategoria(c)).toBe(true)
  })

  it('recusa valor fora da lista', () => {
    expect(ehCategoria('financeiro')).toBe(false)
  })

  /**
   * Story 1.9 — quem manda e-mail nao escolhe categoria, e nao ha formulario
   * para pedir. Inventar 'software' gravaria dado errado; `nao_classificado`
   * diz a verdade: ninguem avaliou ainda.
   */
  it('aceita nao_classificado, a categoria de quem chegou sem triagem', () => {
    expect(ehCategoria('nao_classificado')).toBe(true)
  })
})

describe('abrirTicket sem triagem', () => {
  it('abre com nao_classificado sem reclamar (Story 1.9)', () => {
    expect(abrirTicket({ ...valido, categoria: 'nao_classificado' }).categoria).toBe(
      'nao_classificado',
    )
  })
})
