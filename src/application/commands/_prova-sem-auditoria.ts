// TEMPORARIO — Story 0.6, AC #3.
// Command handler que MUTA ESTADO sem gravar registro de auditoria.
// Viola AD-3 (auditoria transacional com autor e origem) e o pilar Auditavel.
//
// Passa de proposito em: tsc (tipado), Biome (formatado), Vitest (coberto),
// dependency-cruiser (nao cruza camada), Trivy e Gitleaks. NENHUMA ferramenta
// detecta o problema — so o review por IA pode.

export type Chamado = {
  readonly numero: number
  status: string
  prioridade: string
}

export type MudarPrioridadeInput = {
  readonly chamado: Chamado
  readonly novaPrioridade: string
}

export const mudarPrioridade = ({ chamado, novaPrioridade }: MudarPrioridadeInput): Chamado => {
  // Muta o estado do Chamado e retorna. Nao ha principal, nao ha origem,
  // nao ha registro de auditoria, nao ha transacao.
  return { ...chamado, prioridade: novaPrioridade }
}
