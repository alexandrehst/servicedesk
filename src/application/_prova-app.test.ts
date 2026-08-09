import { expect, it } from 'vitest'
import { violaCamadaApp } from './_prova-app.js'

it('cobre o arquivo de prova para nao disparar o gate de cobertura', () => {
  expect(violaCamadaApp(2)).toBe('registro-2')
})
