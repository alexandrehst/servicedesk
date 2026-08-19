import { McpServer } from '@modelcontextprotocol/server'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { acaoIrreversivel, type Confirmacao } from '../../application/commands/acao-irreversivel.js'
import { atribuirChamado } from '../../application/commands/atribuir-chamado.js'
import { comentarChamado } from '../../application/commands/comentar-chamado.js'
import { mudarPrioridade } from '../../application/commands/mudar-prioridade.js'
import { mudarStatus } from '../../application/commands/mudar-status.js'
import {
  abrirChamadoInputSchema,
  abrirChamadoOutputSchema,
} from '../../application/contracts/abrir-chamado.js'
import {
  acaoIrreversivelInputSchema,
  acaoIrreversivelOutputSchema,
} from '../../application/contracts/acao-irreversivel.js'
import {
  atribuirChamadoInputSchema,
  atribuirChamadoOutputSchema,
} from '../../application/contracts/atribuir-chamado.js'
import type { BuscarChamadosFiltros } from '../../application/contracts/buscar-chamados.js'
import {
  buscarChamadosInputSchema,
  buscarChamadosOutputSchema,
  LIMITE_PADRAO,
} from '../../application/contracts/buscar-chamados.js'
import {
  chamadosParecidosInputSchema,
  chamadosParecidosOutputSchema,
} from '../../application/contracts/chamados-parecidos.js'
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
  resumoFilaInputSchema,
  resumoFilaOutputSchema,
} from '../../application/contracts/resumo-fila.js'
import {
  verChamadoInputSchema,
  verChamadoOutputSchema,
} from '../../application/contracts/ver-chamado.js'
import type { IdentityRepository } from '../../application/ports/identity-repository.js'
import type { TicketRepository } from '../../application/ports/ticket-repository.js'
import { buscarChamados } from '../../application/queries/buscar-chamados.js'
import { chamadosParecidos } from '../../application/queries/chamados-parecidos.js'
import { resumoFila } from '../../application/queries/resumo-fila.js'
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
  /**
   * Story 2.6: emitir e consumir a confirmacao das Acoes irreversiveis (AD-7).
   *
   * Entra como dependencia, e nao como algo que o adapter monta, pelo mesmo
   * motivo do `autenticar`: quem decide validade e escopo esta em `platform`, e
   * o adapter so o repassa ao command.
   */
  readonly confirmacao: Confirmacao
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

/**
 * Handler da Fila (Story 3.1).
 *
 * O texto diz quantos vieram e se ha mais: sem isso a IA nao tem como saber que
 * a lista foi paginada, e concluiria que viu tudo.
 */
export const criarHandlerBuscarChamados = (deps: McpDeps) => {
  const executar = buscarChamados({ repositorio: deps.repositorio })

  return criarHandler(
    deps,
    // O tipo de ENTRADA e `z.input`: os defaults do schema (limite, ordem)
    // ficam opcionais ali, entao chegariam `undefined` ao caso de uso. Mesma
    // armadilha do `interno` na Story 2.1.
    (input: BuscarChamadosFiltros, quem) =>
      executar(
        {
          ...input,
          limite: input.limite ?? LIMITE_PADRAO,
          deslocamento: input.deslocamento ?? 0,
          ordem: input.ordem ?? 'asc',
        },
        quem,
      ),
    (saida) =>
      `${saida.itens.length} Chamado(s)${saida.temMais ? ' — ha mais, use deslocamento' : ''}.`,
  )
}

/**
 * Handler do resumo (Story 3.3).
 *
 * O texto traz os numeros que respondem a pergunta do Gestor sem obrigar a IA a
 * abrir o objeto: quantos estao em aberto e quantos estao sem Dono.
 */
export const criarHandlerResumoFila = (deps: McpDeps) =>
  criarHandler(deps, resumoFila({ repositorio: deps.repositorio }), (saida) => {
    const total = Object.values(saida.porStatus).reduce((soma, n) => soma + n, 0)
    return `${total} Chamado(s) em aberto, ${saida.semDono} sem Dono.`
  })

/**
 * Handler da sugestao de parecidos (Story 3.5).
 *
 * O texto da resposta diz quantos vieram — inclusive ZERO, que e resposta e nao
 * falha: nada parecido e melhor que um palpite que empurra quem abre a "achar"
 * que ja existe Chamado.
 */
export const criarHandlerChamadosParecidos = (deps: McpDeps) =>
  criarHandler(deps, chamadosParecidos({ repositorio: deps.repositorio }), (saida) =>
    saida.parecidos.length === 0
      ? 'Nenhum Chamado parecido — pode abrir.'
      : `${saida.parecidos.length} Chamado(s) parecido(s): ${saida.parecidos
          .map((p) => `#${p.numero}`)
          .join(', ')}.`,
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

/**
 * Handlers das tres Acoes irreversiveis (Story 2.6).
 *
 * Um command para as tres, tres tools finas: o que difere e o NOME que a IA
 * chama, e e ele que torna a intencao explicita no protocolo. Uma tool generica
 * `acao_irreversivel(acao)` faria a IA escolher a acao por parametro, e o nome
 * da tool — que e o que aparece para quem aprova — deixaria de dizer o que vai
 * acontecer.
 */
const criarHandlerAcaoIrreversivel = (
  deps: McpDeps,
  acao: 'fechar_chamado' | 'cancelar_chamado' | 'reabrir_chamado',
) =>
  criarHandler(
    deps,
    acaoIrreversivel({ repositorio: deps.repositorio, confirmacao: deps.confirmacao })(acao),
    (saida) => `Chamado #${saida.numero}: ${saida.de} -> ${saida.para} (versao ${saida.versao}).`,
  )

export const criarHandlerFecharChamado = (deps: McpDeps) =>
  criarHandlerAcaoIrreversivel(deps, 'fechar_chamado')

export const criarHandlerCancelarChamado = (deps: McpDeps) =>
  criarHandlerAcaoIrreversivel(deps, 'cancelar_chamado')

export const criarHandlerReabrirChamado = (deps: McpDeps) =>
  criarHandlerAcaoIrreversivel(deps, 'reabrir_chamado')

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

  // As tres Acoes irreversiveis (Story 2.6, AD-7). A descricao diz que exigem
  // confirmacao porque e ela que a IA le antes de escolher a tool — e o
  // human-in-the-loop de verdade acontece no cliente.
  servidor.registerTool(
    'fechar_chamado',
    {
      title: 'Fechar Chamado',
      description:
        'ACAO IRREVERSIVEL. Encerra um Chamado resolvido. Exige confirmacao humana explicita: a primeira chamada devolve o token de confirmacao, a segunda o repassa.',
      inputSchema: acaoIrreversivelInputSchema,
      outputSchema: acaoIrreversivelOutputSchema,
    },
    criarHandlerFecharChamado(deps),
  )

  servidor.registerTool(
    'cancelar_chamado',
    {
      title: 'Cancelar Chamado',
      description:
        'ACAO IRREVERSIVEL. Cancela um Chamado que nao deveria existir. Exige confirmacao humana explicita, como fechar_chamado.',
      inputSchema: acaoIrreversivelInputSchema,
      outputSchema: acaoIrreversivelOutputSchema,
    },
    criarHandlerCancelarChamado(deps),
  )

  servidor.registerTool(
    'reabrir_chamado',
    {
      title: 'Reabrir Chamado',
      description:
        'ACAO IRREVERSIVEL. Devolve ao atendimento um Chamado encerrado, registrando o motivo (obrigatorio). Exige confirmacao humana explicita.',
      inputSchema: acaoIrreversivelInputSchema,
      outputSchema: acaoIrreversivelOutputSchema,
    },
    criarHandlerReabrirChamado(deps),
  )

  servidor.registerTool(
    'buscar_chamados',
    {
      title: 'Buscar Chamados',
      description:
        'Lista e busca na Fila. Filtros combinaveis (status, dono, categoria), recortes rapidos (recorte="meus" traz os Chamados em que VOCE e o Dono, recorte="sem_dono" os que nao tem Dono) e busca textual (texto) por Titulo, Descricao, Comentarios e numero do sistema anterior — inclusive em Chamados ja encerrados. Ordenada por data de abertura; devolve resumo — use ver_chamado para o conteudo.',
      inputSchema: buscarChamadosInputSchema,
      outputSchema: buscarChamadosOutputSchema,
    },
    criarHandlerBuscarChamados(deps),
  )

  servidor.registerTool(
    'resumo_fila',
    {
      title: 'Resumo da Fila',
      description:
        'Contadores da Fila em aberto: por Status, por Categoria e por Dono, mais quantos estao sem Dono. Encerrados e excluidos nao entram — o resumo mede carga.',
      inputSchema: resumoFilaInputSchema,
      outputSchema: resumoFilaOutputSchema,
    },
    criarHandlerResumoFila(deps),
  )

  servidor.registerTool(
    'chamados_parecidos',
    {
      title: 'Chamados parecidos',
      description:
        'Sugere Chamados semelhantes a um texto de abertura, para evitar duplicado. E CONSELHO, nao pre-requisito: a abertura nao depende desta consulta, e lista vazia significa "nada parecido". Inclui Chamados ja encerrados — "ja resolvemos isso" e a resposta mais util.',
      inputSchema: chamadosParecidosInputSchema,
      outputSchema: chamadosParecidosOutputSchema,
    },
    criarHandlerChamadosParecidos(deps),
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
