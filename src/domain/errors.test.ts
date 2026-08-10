import { expect, it } from 'vitest'
import { DomainError, ehDomainError } from './errors.js'

it('carrega code e message', () => {
  const erro = new DomainError('TituloObrigatorio', 'vazio')
  expect(erro.code).toBe('TituloObrigatorio')
  expect(erro.message).toBe('vazio')
  expect(erro.name).toBe('DomainError')
})

it('ehDomainError distingue erro de dominio de erro comum', () => {
  expect(ehDomainError(new DomainError('CategoriaInvalida', 'x'))).toBe(true)
  expect(ehDomainError(new Error('falha de rede'))).toBe(false)
  expect(ehDomainError('texto solto')).toBe(false)
})
