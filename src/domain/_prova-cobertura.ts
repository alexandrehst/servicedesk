// ARQUIVO TEMPORARIO — Story 0.2, AC #3.
// Funcao exportada e deliberadamente NAO testada, para provar que o
// threshold de 80% reprova o build. Revertido no commit seguinte.

export const classificaPrioridade = (horasAbertas: number): string => {
  if (horasAbertas > 72) {
    return 'critica'
  }
  if (horasAbertas > 24) {
    return 'alta'
  }
  if (horasAbertas > 8) {
    return 'media'
  }
  return 'baixa'
}

export const ehUrgente = (prioridade: string): boolean =>
  prioridade === 'critica' || prioridade === 'alta'
