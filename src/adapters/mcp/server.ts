import { McpServer } from '@modelcontextprotocol/server'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { atribuirChamado } from '../../application/commands/atribuir-chamado.js'
import { comentarChamado } from '../../application/commands/comentar-chamado.js'
import { mudarPrioridade } from '../../application/commands/mudar-prioridade.js'
import { mudarStatus } from '../../application/commands/mudar-status.js'
import {
  abrirChamadoInputSchema,
  abrirChamadoOutputSchema,
} from '../../application/contracts/abrir-chamado.js'
import {
  atribuirChamadoInputSchema,
  atribuirChamadoOutputSchema,
} from '../../application/contracts/atribuir-chamado.js'
import type { ComentarChamadoInput } from '../../application/contracts/comentar-chamado.js'
import {
  comentarChamadoInputSchema,
  comentarChamadoOutputSchema,
} from '../../application/contracts/comentar-chamado.js'
import {
  mudarPrioridadeInputSchema,
  mudarPrioridadeOutputSchema,
} from '../../application/contracts/mudar-prioridade.js'
import {
  mudarStatusInputSchema,
  mudarStatusOutputSchema,
} from '../../application/contracts/mudar-status.js'
import type { Principal } from '../../application/contracts/principal.js'
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
 * O esqueleto de TODA tool: autenticar, limitar, executar, traduzir erro.
 *
 * Extraido na Story 2.3, quando o gate do Sonar apontou duplicacao em codigo
 * novo. Os cinco handlers repetiam as mesmas quinze linhas, e o Epic 2 traz
 * mais dois — cada copia sendo uma chance de esquecer o `limitarChamadas`, que
 * e justamente o esquecimento mais provavel do epico.
 *
 * A ordem das tres primeiras linhas nao e estilo:
 *
 * - **autenticar primeiro**, porque uma escrita gravada antes de saber quem a
 *   fez fica com autoria indefinida (AD-3);
 * - **limitar antes de executar**, porque contar depois deixaria a escrita
 *   acontecer e o limite nao serviria para nada numa IA em loop (FR-21);
 * - **`origin: 'mcp'`** carimbado aqui, para o Log distinguir "humano via IA"
 *   de chamada nativa (AD-9).
 *
 * O `catch` traduz erro de DOMINIO em erro de tool e **relanca o resto**:
 * engolir falha de banco atras de uma mensagem de negocio seria violacao
 * direta do pilar Observavel.
 */
const criarHandler =
  <Entrada, Saida>(
    { autenticar, limitarChamadas }: Pick<McpDeps, 'autenticar' | 'limitarChamadas'>,
    executar: (input: Entrada, autor: Principal) => Promise<Saida>,
    texto: (saida: Saida) => string,
  ) =>
  async (input: Entrada) => {
    try {
      const autor: Principal = { ...(await autenticar()), origin: 'mcp' }
      await limitarChamadas(autor.identity)

      const saida = await executar(input, autor)

      return {
        content: [{ type: 'text' as const, text: texto(saida) }],
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

/**
 * Handler da tool, extraido do registro para ser testavel sem transporte.
 * Sem isso, cobrir o caminho de erro exigiria subir um cliente MCP inteiro —
 * e o SDK nao expoe o callback registrado.
 */
export const criarHandlerAbrirChamado = (deps: McpDeps) =>
  criarHandler(
    deps,
    abrirChamado({ repositorio: deps.repositorio }),
    (saida) => `Chamado #${saida.number} aberto (${saida.status}).`,
  )

/** Handler da tool de leitura, extraido para ser testavel sem transporte. */
export const criarHandlerVerChamado = (deps: McpDeps) =>
  criarHandler(
    deps,
    verChamado({ repositorio: deps.repositorio }),
    (saida) =>
      `Chamado #${saida.number} — ${saida.titulo} (${saida.status}), ${saida.comentarios.length} comentario(s).`,
  )

/** Handler de Comentario (Story 2.1). */
export const criarHandlerComentarChamado = (deps: McpDeps) => {
  const executar = comentarChamado({ repositorio: deps.repositorio })

  return criarHandler(
    deps,
    // O default de `interno` vive no schema (AD-6), mas o tipo de ENTRADA e
    // `z.input`: o campo e opcional ali, e sem o `?? false` chegaria
    // `undefined` ao dominio.
    (input: ComentarChamadoInput, autor) =>
      executar(
        { numero: input.numero, texto: input.texto, interno: input.interno ?? false },
        autor,
      ),
    (saida) =>
      `Comentario ${saida.interno ? 'interno' : 'publico'} adicionado ao Chamado #${saida.numero}.`,
  )
}

/** Handler de mudanca de Status (Story 2.2). */
export const criarHandlerMudarStatus = (deps: McpDeps) =>
  criarHandler(
    deps,
    mudarStatus({ repositorio: deps.repositorio }),
    // A versao NOVA vai no texto: quem for mudar de novo precisa dela, e sem
    // isso a IA teria que reler o Chamado a cada mutacao.
    (saida) => `Chamado #${saida.numero}: ${saida.de} -> ${saida.para} (versao ${saida.versao}).`,
  )

/** Handler de Prioridade (Story 2.4). */
export const criarHandlerMudarPrioridade = (deps: McpDeps) =>
  criarHandler(
    deps,
    mudarPrioridade({ repositorio: deps.repositorio }),
    (saida) =>
      `Chamado #${saida.numero}: prioridade ${saida.de} -> ${saida.para} (versao ${saida.versao}).`,
  )

/** Handler de atribuicao (Story 2.3). */
export const criarHandlerAtribuirChamado = (deps: McpDeps) =>
  criarHandler(
    deps,
    atribuirChamado({ repositorio: deps.repositorio, identidades: deps.identidades }),
    (saida) => `Chamado #${saida.numero} atribuido a ${saida.para} (versao ${saida.versao}).`,
  )

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
    'mudar_prioridade',
    {
      title: 'Mudar Prioridade',
      description:
        'Ajusta a urgencia do Chamado (baixa, media, alta, critica). Exige a versao lida em ver_chamado.',
      inputSchema: mudarPrioridadeInputSchema,
      outputSchema: mudarPrioridadeOutputSchema,
    },
    criarHandlerMudarPrioridade(deps),
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
