import { McpServer } from '@modelcontextprotocol/server'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { atribuirChamado } from '../../application/commands/atribuir-chamado.js'
import { comentarChamado } from '../../application/commands/comentar-chamado.js'
import { mudarStatus } from '../../application/commands/mudar-status.js'
import type { AbrirChamadoInput } from '../../application/contracts/abrir-chamado.js'
import {
  abrirChamadoInputSchema,
  abrirChamadoOutputSchema,
} from '../../application/contracts/abrir-chamado.js'
import type { AtribuirChamadoInput } from '../../application/contracts/atribuir-chamado.js'
import {
  atribuirChamadoInputSchema,
  atribuirChamadoOutputSchema,
} from '../../application/contracts/atribuir-chamado.js'
import type { ComentarChamadoInput } from '../../application/contracts/comentar-chamado.js'
import {
  comentarChamadoInputSchema,
  comentarChamadoOutputSchema,
} from '../../application/contracts/comentar-chamado.js'
import type { MudarStatusInput } from '../../application/contracts/mudar-status.js'
import {
  mudarStatusInputSchema,
  mudarStatusOutputSchema,
} from '../../application/contracts/mudar-status.js'
import type { Principal } from '../../application/contracts/principal.js'
import type { VerChamadoInput } from '../../application/contracts/ver-chamado.js'
import {
  verChamadoInputSchema,
  verChamadoOutputSchema,
} from '../../application/contracts/ver-chamado.js'
import type { IdentityRepository } from '../../application/ports/identity-repository.js'
import type { TicketRepository } from '../../application/ports/ticket-repository.js'
import { verChamado } from '../../application/queries/ver-chamado.js'
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
   * Story 1.3: onde antes havia um principal de configuracao, agora ha COMO
   * obte-lo — tipicamente `resolverPrincipal(deps)(tokenDaSessao)`.
   *
   * A funcao e chamada a cada tool, nao uma vez na montagem do servidor: uma
   * conexao MCP dura horas, e resolver uma unica vez faria a sessao de 8 horas
   * valer para sempre depois de aberta. Se ela lanca, a tool nao executa.
   *
   * O que mudou foi so a ORIGEM do valor. Dominio, casos de uso e o
   * repositorio de Chamados seguem exatamente como estavam.
   */
  readonly autenticar: () => Promise<Omit<Principal, 'origin'>>
  /**
   * Story 1.5: rate limit por IDENTIDADE (FR-21). Lanca `LimiteExcedido`
   * quando a janela estoura.
   *
   * Aplicado DEPOIS de autenticar, porque o limite e por identidade e ela so
   * existe depois. A consequencia — credencial invalida nao consome quota, e
   * portanto forca bruta de token nao e limitada — esta registrada no Dev
   * Agent Record: contra 256 bits de entropia ela e irrelevante.
   *
   * Limitar por conexao em vez de por identidade seria contornavel abrindo
   * outra conexao.
   */
  readonly limitarChamadas: (identity: string) => Promise<void>
  /**
   * Story 2.3: o cadastro, para validar o DESTINATARIO de uma atribuicao. So
   * `buscarUsuarioPorEmail` — o adapter MCP nao cria sessao nem emite token.
   */
  readonly identidades: Pick<IdentityRepository, 'buscarUsuarioPorEmail'>
}

/**
 * Handler da tool, extraido do registro para ser testavel sem transporte.
 * Sem isso, cobrir o caminho de erro exigiria subir um cliente MCP inteiro —
 * e o SDK nao expoe o callback registrado.
 */
export const criarHandlerAbrirChamado = ({ repositorio, autenticar, limitarChamadas }: McpDeps) => {
  const executar = abrirChamado({ repositorio })

  return async (input: AbrirChamadoInput) => {
    try {
      // Autenticar PRIMEIRO: um Chamado gravado antes de saber quem o abriu
      // ficaria no banco com autoria indefinida, contra o AD-3.
      const autor: Principal = { ...(await autenticar()), origin: 'mcp' }

      // E limitar antes de executar: contar depois deixaria a escrita
      // acontecer, e o limite serviria para nada numa IA em loop.
      await limitarChamadas(autor.identity)

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

/** Handler da tool de leitura, extraido para ser testavel sem transporte. */
export const criarHandlerVerChamado = ({ repositorio, autenticar, limitarChamadas }: McpDeps) => {
  const executar = verChamado({ repositorio })

  return async (input: VerChamadoInput) => {
    try {
      const quem: Principal = { ...(await autenticar()), origin: 'mcp' }

      // A leitura tambem conta: uma IA em loop consultando sem parar custa
      // banco igual, e o FR-21 fala de chamadas, nao de escritas.
      await limitarChamadas(quem.identity)

      const saida = await executar(input, quem)
      return {
        content: [
          {
            type: 'text' as const,
            text: `Chamado #${saida.number} — ${saida.titulo} (${saida.status}), ${saida.comentarios.length} comentario(s).`,
          },
        ],
        structuredContent: saida,
      }
    } catch (erro) {
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

/**
 * Handler de Comentario (Story 2.1). Mesma forma dos anteriores: autenticar,
 * limitar, executar — nesta ordem, e por motivo, nao por costume.
 */
export const criarHandlerComentarChamado = ({
  repositorio,
  autenticar,
  limitarChamadas,
}: McpDeps) => {
  const executar = comentarChamado({ repositorio })

  return async (input: ComentarChamadoInput) => {
    try {
      // Autenticar PRIMEIRO: um Comentario gravado antes de saber quem o
      // escreveu ficaria com autoria indefinida, contra o AD-3.
      const autor: Principal = { ...(await autenticar()), origin: 'mcp' }

      // E limitar antes de executar: contar depois deixaria a escrita
      // acontecer, e o limite serviria para nada numa IA em loop (FR-21).
      await limitarChamadas(autor.identity)

      // O default de `interno` vive no schema (AD-6). Aqui ele ja chegou
      // resolvido — mas o tipo de entrada e `z.input`, entao o campo e
      // opcional e precisa do `?? false` para nao virar `undefined` no
      // dominio.
      const saida = await executar(
        { numero: input.numero, texto: input.texto, interno: input.interno ?? false },
        autor,
      )

      return {
        content: [
          {
            type: 'text' as const,
            text: `Comentario ${saida.interno ? 'interno' : 'publico'} adicionado ao Chamado #${saida.numero}.`,
          },
        ],
        structuredContent: saida,
      }
    } catch (erro) {
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

/** Handler de mudanca de Status (Story 2.2). */
export const criarHandlerMudarStatus = ({ repositorio, autenticar, limitarChamadas }: McpDeps) => {
  const executar = mudarStatus({ repositorio })

  return async (input: MudarStatusInput) => {
    try {
      const autor: Principal = { ...(await autenticar()), origin: 'mcp' }
      await limitarChamadas(autor.identity)

      const saida = await executar(input, autor)

      return {
        content: [
          {
            type: 'text' as const,
            // A versao nova vai no texto porque quem for mudar de novo precisa
            // dela — sem isso a IA teria que reler o Chamado a cada mutacao.
            text: `Chamado #${saida.numero}: ${saida.de} -> ${saida.para} (versao ${saida.versao}).`,
          },
        ],
        structuredContent: saida,
      }
    } catch (erro) {
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

/** Handler de atribuicao (Story 2.3). */
export const criarHandlerAtribuirChamado = ({
  repositorio,
  identidades,
  autenticar,
  limitarChamadas,
}: McpDeps) => {
  const executar = atribuirChamado({ repositorio, identidades })

  return async (input: AtribuirChamadoInput) => {
    try {
      const autor: Principal = { ...(await autenticar()), origin: 'mcp' }
      await limitarChamadas(autor.identity)

      const saida = await executar(input, autor)

      return {
        content: [
          {
            type: 'text' as const,
            text: `Chamado #${saida.numero} atribuido a ${saida.para} (versao ${saida.versao}).`,
          },
        ],
        structuredContent: saida,
      }
    } catch (erro) {
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

  servidor.registerTool(
    'comentar_chamado',
    {
      title: 'Comentar Chamado',
      description:
        'Anexa um Comentario ao Chamado. Use interno=true para conversa do time, que o Solicitante nao ve.',
      inputSchema: comentarChamadoInputSchema,
      outputSchema: comentarChamadoOutputSchema,
    },
    criarHandlerComentarChamado(deps),
  )

  servidor.registerTool(
    'mudar_status',
    {
      title: 'Mudar Status',
      description:
        'Muda o Status do Chamado. Exige a versao lida em ver_chamado. Fechar, cancelar e reabrir tem acoes dedicadas.',
      inputSchema: mudarStatusInputSchema,
      outputSchema: mudarStatusOutputSchema,
    },
    criarHandlerMudarStatus(deps),
  )

  servidor.registerTool(
    'atribuir_chamado',
    {
      title: 'Atribuir Chamado',
      description:
        'Define o Dono do Chamado. Omita `agente` para atribuir a si mesmo. Exige a versao lida em ver_chamado.',
      inputSchema: atribuirChamadoInputSchema,
      outputSchema: atribuirChamadoOutputSchema,
    },
    criarHandlerAtribuirChamado(deps),
  )

  servidor.registerTool(
    'ver_chamado',
    {
      title: 'Ver Chamado',
      description:
        'Consulta um Chamado pelo Numero, com a thread de Comentarios em ordem cronologica.',
      inputSchema: verChamadoInputSchema,
      outputSchema: verChamadoOutputSchema,
    },
    criarHandlerVerChamado(deps),
  )

  return servidor
}
