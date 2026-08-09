// TEMPORARIO — Story 0.4, AC #3.
// VIOLA no-application-to-adapters: application importando de adapters.
import { buscaNoBanco } from '../adapters/persistence/_prova-repo.js'

export const violaCamadaApp = (id: number): string => buscaNoBanco(id)
