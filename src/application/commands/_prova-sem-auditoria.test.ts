import { expect, it } from 'vitest'
import { mudarPrioridade } from './_prova-sem-auditoria.js'

it('muda a prioridade do chamado', () => {
  const chamado = { numero: 1042, status: 'aberto', prioridade: 'baixa' }
  expect(mudarPrioridade({ chamado, novaPrioridade: 'alta' }).prioridade).toBe('alta')
})

it('preserva o numero do chamado', () => {
  const chamado = { numero: 1042, status: 'aberto', prioridade: 'baixa' }
  expect(mudarPrioridade({ chamado, novaPrioridade: 'alta' }).numero).toBe(1042)
})
