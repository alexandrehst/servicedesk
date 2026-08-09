// TEMPORARIO — Story 0.4, AC #3.
// VIOLA no-domain-to-outer: o dominio importando de adapters.
import { buscaNoBanco } from '../adapters/persistence/_prova-repo.js'

export const violaAd1 = (id: number): string => buscaNoBanco(id)
