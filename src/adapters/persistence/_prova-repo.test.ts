import { expect, it } from 'vitest'
import { buscaNoBanco } from './_prova-repo.js'

it('cobre o arquivo de prova para nao disparar o gate de cobertura', () => {
  expect(buscaNoBanco(3)).toBe('registro-3')
})
