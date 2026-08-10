import { McpServer } from '@modelcontextprotocol/server'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import type { AbrirChamadoInput } from '../../application/contracts/abrir-chamado.js'
import {
  abrirChamadoInputSchema,
  abrirChamadoOutputSchema,
} from '../../application/contracts/abrir-chamado.js'
import type { Principal } from '../../application/contracts/principal.js'
import type { TicketRepository } from '../../application/ports/ticket-repository.js'
import { ehDomainError } from '../../domain/errors.js'

/**
 * Driving adapter MCP.
 *
 * AD-1 — depende de `application` e `domain`, nunca o contrario.
 * AD-6 — o inputSchema E o schema do contrato. Nao ha redefinicao: se o
 *        contrato mudar, a tool muda junto, e o adapter HTTP tambem.
 * AD-9 — carimba `origin: 'mcp'` no principal, para o Log de auditoria
 *        distinguir "humano via IA" de chamada direta da API.
 *
 * Nome da tool em portugues (FR-14): e a interface com o Agente. O codigo
 * interno segue o glossario EN.
 */
export type McpDeps = {
  readonly repositorio: TicketRepository
  /**
   * Autenticacao real e a Story 1.3. Ate la o principal vem de configuracao,
   * mas JA no formato final — a 1.3 troca so a origem do valor, sem tocar em
   * dominio, aplicacao nem persistencia.
   */
  readonly principal: Omit<Principal, 'origin'>
}

/**
 * Handler da tool, extraido do registro para ser testavel sem transporte.
 * Sem isso, cobrir o caminho de erro exigiria subir um cliente MCP inteiro —
 * e o SDK nao expoe o callback registrado.
 */
export const criarHandlerAbrirChamado = ({ repositorio, principal }: McpDeps) => {
  const executar = abrirChamado({ repositorio })

  return async (input: AbrirChamadoInput) => {
    const autor: Principal = { ...principal, origin: 'mcp' }

    try {
      const saida = await executar(input, autor)
      return {
        content: [
          { type: 'text' as const, text: `Chamado #${saida.number} aberto (${saida.status}).` },
        ],
        structuredContent: saida,
      }
    } catch (erro) {
      // O shape do erro nasce no dominio; aqui so traduzimos para erro de
      // tool. Erro nao-tipado sobe sem mascarar — engolir seria violar o
      // pilar Observavel.
      if (ehDomainError(erro)) {
        return {
          content: [{ type: 'text' as const, text: `[${erro.code}] ${erro.message}` }],
          isError: true,
        }
      }
      throw erro
    }
  }
}

export const criarServidorMcp = (deps: McpDeps): McpServer => {
  const servidor = new McpServer({ name: 'servicedesk', version: '0.1.0' })

  servidor.registerTool(
    'abrir_chamado',
    {
      title: 'Abrir Chamado',
      description: 'Registra um novo Chamado no service desk. Retorna o Numero sequencial gerado.',
      inputSchema: abrirChamadoInputSchema,
      outputSchema: abrirChamadoOutputSchema,
    },
    criarHandlerAbrirChamado(deps),
  )

  return servidor
}
