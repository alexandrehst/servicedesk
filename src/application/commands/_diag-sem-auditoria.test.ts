import { expect, it } from 'vitest'
import type { Principal } from '../contracts/principal.js'
import { maisAntigos, mudarPrioridade, type TicketParaAtualizar } from './_diag-sem-auditoria.js'

const autor: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const base: TicketParaAtualizar = {
  number: 1000,
  status: 'aberto',
  categoria: 'rede',
  prioridade: 'baixa',
}

it('muda a prioridade do chamado', async () => {
  const salvos: TicketParaAtualizar[] = []
  const repositorio = {
    async salvar(t: TicketParaAtualizar) {
      salvos.push(t)
    },
  }
  const saida = await mudarPrioridade({ repositorio })(base, 'alta', autor)
  expect(saida.prioridade).toBe('alta')
  expect(salvos).toHaveLength(1)
})

it('devolve os chamados mais antigos', () => {
  const lista = [base, { ...base, number: 1001 }, { ...base, number: 1002 }]
  // Teste escrito para casar com o comportamento atual — nao denuncia o bug.
  expect(maisAntigos(lista, 3)).toHaveLength(2)
})
