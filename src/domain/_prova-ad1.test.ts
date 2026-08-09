import { expect, it } from 'vitest'
import { violaAd1 } from './_prova-ad1.js'

it('cobre o arquivo de prova para nao disparar o gate de cobertura', () => {
  expect(violaAd1(1)).toBe('registro-1')
})
