import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { abrirChamado } from '../../application/commands/abrir-chamado.js'
import { acaoIrreversivel, type Confirmacao } from '../../application/commands/acao-irreversivel.js'
import { atribuirChamado } from '../../application/commands/atribuir-chamado.js'
import { comentarChamado } from '../../application/commands/comentar-chamado.js'
import { excluirChamado } from '../../application/commands/excluir-chamado.js'
import { excluirComentario } from '../../application/commands/excluir-comentario.js'
import { excluirUsuario } from '../../application/commands/excluir-usuario.js'
import { importarCsv } from '../../application/commands/importar-csv.js'
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
  excluirChamadoInputSchema,
  excluirChamadoOutputSchema,
  excluirComentarioInputSchema,
  excluirComentarioOutputSchema,
  excluirUsuarioInputSchema,
  excluirUsuarioOutputSchema,
} from '../../application/contracts/excluir.js'
import type { ExportarCsvInput } from '../../application/contracts/exportar-csv.js'
import {
  exportarCsvInputSchema,
  exportarCsvOutputSchema,
  LIMITE_PADRAO_EXPORT,
} from '../../application/contracts/exportar-csv.js'
import {
  importarCsvInputSchema,
  importarCsvOutputSchema,
} from '../../application/contracts/importar-csv.js'
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
  relatorioDeOperacaoInputSchema,
  relatorioDeOperacaoOutputSchema,
} from '../../application/contracts/relatorio-de-operacao.js'
import {
  resumoFilaInputSchema,
  resumoFilaOutputSchema,
} from '../../application/contracts/resumo-fila.js'
import {
  verChamadoInputSchema,
  verChamadoOutputSchema,
} from '../../application/contracts/ver-chamado.js'
import type { IdentityRepository } from '../../application/ports/identity-repository.js'
import type { Logger } from '../../application/ports/logger.js'
import type { TicketRepository } from '../../application/ports/ticket-repository.js'
import { buscarChamados } from '../../application/queries/buscar-chamados.js'
import { chamadosParecidos } from '../../application/queries/chamados-parecidos.js'
import { exportarCsv } from '../../application/queries/exportar-csv.js'
import { relatorioDeOperacao } from '../../application/queries/relatorio-de-operacao.js'
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
  readonly identidades: Pick<
    IdentityRepository,
    // Story 4.3: `excluirUsuarioComAuditoria` entrou aqui. O `Pick` continua
    // dizendo o que o adapter NAO faz — nao cria sessao, nao emite token.
    'buscarUsuarioPorEmail' | 'excluirUsuarioComAuditoria'
  >
  /**
   * Story 4.2: o import registra cada linha que o banco recusou.
   *
   * O relatorio da tool e sincrono — existe uma vez, na resposta daquela
   * chamada. Se o cliente truncar a saida estruturada, ou o processo cair antes
   * de responder, o log e o unico rastro de por que uma linha nao entrou.
   */
  readonly logger: Logger
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
 * O esqueleto de todo RESOURCE (Story 3.6, FR-16).
 *
 * Mesma ordem do `criarHandler`, e pelas mesmas razoes: autenticar primeiro
 * (sem identidade nao ha `escopoDeLeitura`), limitar antes de executar (senao o
 * limite nao serve para nada numa IA em loop, FR-21).
 *
 * A UNICA diferenca e o erro, e ela existe porque o PROTOCOLO difere: tool
 * devolve `isError: true` com texto no envelope; leitura de Resource nao tem
 * esse envelope e o SDK espera que ela LANCE. Entao aqui nao ha `catch` — o
 * `DomainError` sobe e vira erro de protocolo.
 *
 * O que NAO difere: quem le um Resource ve exatamente o que veria pela tool. O
 * Resource e casca; a leitura e a mesma query, com o mesmo `visivelPara`.
 */
const criarLeitor =
  <Entrada, Saida>(
    { autenticar, limitarChamadas }: Pick<McpDeps, 'autenticar' | 'limitarChamadas'>,
    executar: (input: Entrada, quem: Principal) => Promise<Saida>,
  ) =>
  async (uri: URL, input: Entrada) => {
    const quem: Principal = { ...(await autenticar()), origin: 'mcp' }
    await limitarChamadas(quem.identity)

    const saida = await executar(input, quem)

    return {
      contents: [
        {
          uri: uri.href,
          // JSON porque o consumidor e uma IA: texto formatado exigiria dela um
          // parser que o contrato Zod ja resolve.
          mimeType: 'application/json',
          text: JSON.stringify(saida),
        },
      ],
    }
  }

/**
 * Leitor do Resource `chamado` (Story 3.6) — casca sobre `ver_chamado`.
 *
 * O `numero` chega como TEXTO da URI, e precisa passar pelo mesmo contrato Zod
 * da tool (AD-6). O SDK valida os argumentos de uma TOOL contra o schema antes
 * de chamar o handler, mas `ResourceTemplate` nao aceita schema para as
 * variaveis da URI — entao a validacao tem de ser feita aqui.
 *
 * Sem isso (achado do `claude-review` no PR #74), `chamado://abc` viraria `NaN`
 * e `chamado://-5` ou `chamado://1.5` seguiriam para o repositorio: valores que
 * a tool recusa de cara chegariam ao `WHERE`, e o erro que sobe seria o do
 * driver, nao o de validacao. Era exatamente a divergencia entre pontos de
 * entrada que o AD-6 existe para impedir — e que esta story dizia estar
 * impedindo.
 */
export const criarLeitorDeChamado = (deps: McpDeps) => {
  const ler = criarLeitor(deps, verChamado({ repositorio: deps.repositorio }))

  return async (uri: URL, numeroDaUri: string) =>
    ler(uri, verChamadoInputSchema.parse({ numero: Number(numeroDaUri) }))
}

/** Leitor do Resource `fila` (Story 3.6) — casca sobre `buscar_chamados`. */
export const criarLeitorDaFila = (deps: McpDeps) => {
  const executar = buscarChamados({ repositorio: deps.repositorio })

  return criarLeitor(deps, (_input: Record<string, never>, quem) =>
    // Sem parametros: Resource e contexto BARATO, e quem quer recortar tem a
    // tool. Os defaults sao os mesmos do contrato (AD-6).
    executar({ limite: LIMITE_PADRAO, deslocamento: 0, ordem: 'asc' }, quem),
  )
}

/**
 * O texto do Prompt de triagem (Story 3.6, FR-16).
 *
 * Exportado para que o teste possa cruza-lo com a lista REAL de tools do
 * servidor: um template que cita tool inexistente ensina a IA a tentar o que o
 * servidor nao faz, e envelhece sozinho quando uma tool e renomeada.
 */
export const TEXTO_DA_TRIAGEM = (numero: number): string =>
  [
    `Triagem do Chamado #${numero}.`,
    '',
    'Passo a passo, usando as tools deste servidor:',
    '',
    `1. Leia o Chamado com ver_chamado(numero: ${numero}). Anote a versao: toda`,
    '   mudanca a exige, e ela muda a cada escrita.',
    '2. Se a Categoria estiver errada, diga isso em comentar_chamado — nao ha',
    '   tool para corrigir Categoria.',
    '3. Ajuste a urgencia com mudar_prioridade (baixa, media, alta, critica),',
    '   passando a versao que voce leu.',
    '4. Defina o Dono com atribuir_chamado. Omita `agente` para pegar para si.',
    '5. Se for comecar o atendimento, mude para em_andamento com mudar_status.',
    '',
    'Regras que valem sempre:',
    '- A versao vem de ver_chamado e e obrigatoria em toda mutacao. Se vier',
    '  Conflict, releia e refaca com a versao nova.',
    '- Comentario interno (interno: true) e conversa do time; o Solicitante nao',
    '  o ve.',
    '- Fechar, cancelar e reabrir NAO fazem parte da triagem: sao acoes',
    '  irreversiveis e exigem confirmacao humana explicita.',
  ].join('\n')

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

/**
 * Handler do export (Story 4.1).
 *
 * O texto diz quantas linhas sairam e se ha mais — sem isso, quem paginou nao
 * sabe que parou no meio.
 */
export const criarHandlerExportarCsv = (deps: McpDeps) => {
  const executar = exportarCsv({ repositorio: deps.repositorio })

  return criarHandler(
    deps,
    // `z.input`: os defaults ficam opcionais no tipo de entrada e chegariam
    // `undefined` ao caso de uso (mesma armadilha da 2.1 e da 3.1).
    (input: ExportarCsvInput, quem) =>
      executar(
        {
          ...input,
          limite: input.limite ?? LIMITE_PADRAO_EXPORT,
          deslocamento: input.deslocamento ?? 0,
          cabecalho: input.cabecalho ?? true,
        },
        quem,
      ),
    (saida) =>
      `${saida.linhas} linha(s) exportada(s)${saida.temMais ? ' — ha mais, continue com deslocamento e cabecalho=false' : ''}.`,
  )
}

/**
 * Handler do import (Story 4.2).
 *
 * O texto resume o relatorio: quem migra precisa ver de relance se o arquivo
 * entrou, e quantas linhas ficaram de fora — o detalhe esta no
 * `structuredContent`.
 */
export const criarHandlerImportarCsv = (deps: McpDeps) =>
  criarHandler(
    deps,
    importarCsv({ repositorio: deps.repositorio, logger: deps.logger }),
    (saida) =>
      `${saida.aceitas.length} importado(s), ${saida.repetidas.length} ja existia(m), ${saida.rejeitadas.length} rejeitada(s)` +
      (saida.falhas.length > 0
        ? ` — ATENCAO: ${saida.falhas.length} linha(s) valida(s) que o banco nao gravou; rode o mesmo arquivo de novo para retoma-las.`
        : '') +
      (saida.semDataOriginal > 0
        ? ` — ${saida.semDataOriginal} sem data de abertura no arquivo, gravado(s) com a data de hoje.`
        : '.'),
  )

/**
 * Os handlers das tres exclusoes (Story 4.3, FR-23, AD-7).
 *
 * A Story 1.7 nao registrou tool de exclusao de proposito — "FR-13/FR-14 nao a
 * preveem, e inventa-la aqui seria expor uma acao destrutiva pela superficie
 * que a Story 1.5 acabou de proteger. A Story 4.3 decide se e como ela
 * aparece". Esta e a decisao: **aparecem, e as tres exigem confirmacao.**
 *
 * A descricao de cada uma diz o que a acao FAZ e o que ela NAO desfaz. E o
 * texto que a IA le para decidir se chama — e, quando chama, e o que a pessoa
 * do outro lado vai ver antes de confirmar.
 */
export const criarHandlerExcluirChamado = (deps: McpDeps) =>
  criarHandler(
    deps,
    excluirChamado({ repositorio: deps.repositorio, confirmacao: deps.confirmacao }),
    (saida) => `Chamado #${saida.number} excluido. O registro permanece no Log.`,
  )

export const criarHandlerExcluirComentario = (deps: McpDeps) =>
  criarHandler(
    deps,
    excluirComentario({ repositorio: deps.repositorio, confirmacao: deps.confirmacao }),
    (saida) => `Comentario ${saida.id} excluido. Ele sumiu da thread para todo mundo.`,
  )

export const criarHandlerExcluirUsuario = (deps: McpDeps) =>
  criarHandler(
    deps,
    excluirUsuario({
      identidades: deps.identidades,
      repositorio: deps.repositorio,
      confirmacao: deps.confirmacao,
    }),
    (saida) =>
      `Usuario ${saida.email} excluido: a sessao e o token MCP dele pararam de valer agora.` +
      (saida.chamadosSemDono > 0
        ? ` ATENCAO: ${saida.chamadosSemDono} Chamado(s) nao encerrado(s) continuam com ele como Dono — nada foi redistribuido. Use atribuir_chamado.`
        : ''),
  )

/**
 * Handler do relatorio de operacao (Story 4.4).
 *
 * O texto resume as tres metricas porque quem le decide o corte do contrato com
 * elas — e diz **quantos** Chamados sustentam a media, porque uma media de tres
 * nao sustenta decisao nenhuma.
 */
export const criarHandlerRelatorioDeOperacao = (deps: McpDeps) =>
  criarHandler(
    deps,
    relatorioDeOperacao({ repositorio: deps.repositorio, agora: () => new Date() }),
    (saida) =>
      `Periodo: ${saida.periodo.de.slice(0, 10)} a ${saida.periodo.ate.slice(0, 10)}. ` +
      (saida.resolucao.resolvidos === 0
        ? 'Nenhum Chamado resolvido no periodo.'
        : `Resolucao: mediana ${saida.resolucao.medianaHoras?.toFixed(1)}h, media ${saida.resolucao.mediaHoras?.toFixed(1)}h ` +
          `(${saida.resolucao.resolvidos} Chamado(s); ${saida.resolucao.semResolucao} aberto(s) sem resolucao).`) +
      (saida.origem.percentualMcp === null
        ? ' Nenhuma acao registrada.'
        : ` ${saida.origem.percentualMcp}% das acoes vieram pelo MCP.`) +
      ` ${saida.adocao.autoresDistintos} pessoa(s) agiram no sistema.`,
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
    'exportar_csv',
    {
      title: 'Exportar CSV',
      description:
        'Exporta os Chamados em CSV, com os mesmos filtros de buscar_chamados. Devolve o arquivo como texto; se `temMais` for verdadeiro, continue com `deslocamento` e `cabecalho: false` para juntar as paginas.',
      inputSchema: exportarCsvInputSchema,
      outputSchema: exportarCsvOutputSchema,
    },
    criarHandlerExportarCsv(deps),
  )

  servidor.registerTool(
    'importar_csv',
    {
      title: 'Importar CSV de migracao',
      description:
        'Importa Chamados do sistema anterior. Cada linha vira um Chamado com Numero NOVO deste sistema; o numero antigo fica como referencia. Linha invalida nao aborta o lote: volta no relatorio com o motivo. Reimportar o mesmo arquivo nao duplica.',
      inputSchema: importarCsvInputSchema,
      outputSchema: importarCsvOutputSchema,
    },
    criarHandlerImportarCsv(deps),
  )

  servidor.registerTool(
    'excluir_chamado',
    {
      title: 'Excluir Chamado',
      description:
        'Exclui um Chamado. A exclusao e LOGICA: o Chamado sai da Fila, da busca e do export para todo mundo, e o registro permanece no Log — mas NAO HA COMO DESFAZER por este sistema. Exige confirmacao humana explicita: a primeira chamada devolve um token para mostrar a quem decide.',
      inputSchema: excluirChamadoInputSchema,
      outputSchema: excluirChamadoOutputSchema,
    },
    criarHandlerExcluirChamado(deps),
  )

  servidor.registerTool(
    'excluir_comentario',
    {
      title: 'Excluir Comentario',
      description:
        'Exclui um Comentario de um Chamado. O `id` vem de ver_chamado. A exclusao e LOGICA e NAO HA COMO DESFAZER: o Comentario some da thread para todo mundo, inclusive para quem o escreveu. Exige confirmacao humana explicita.',
      inputSchema: excluirComentarioInputSchema,
      outputSchema: excluirComentarioOutputSchema,
    },
    criarHandlerExcluirComentario(deps),
  )

  servidor.registerTool(
    'excluir_usuario',
    {
      title: 'Excluir Usuario',
      description:
        'Desliga o acesso de uma pessoa. A partir daqui a sessao dela para de valer NA HORA, o token MCP dela para de resolver, o e-mail dela deixa de abrir Chamado e ninguem consegue atribuir trabalho a ela. Os Chamados dela PERMANECEM e nao sao redistribuidos. E a acao mais destrutiva deste sistema e NAO HA COMO DESFAZER. Exige confirmacao humana explicita.',
      inputSchema: excluirUsuarioInputSchema,
      outputSchema: excluirUsuarioOutputSchema,
    },
    criarHandlerExcluirUsuario(deps),
  )

  servidor.registerTool(
    'relatorio_de_operacao',
    {
      title: 'Relatorio de operacao',
      description:
        'Mede a operacao DESTE sistema no periodo: tempo de resolucao (mediana e media), percentual de acoes via MCP e quantas pessoas agiram. Tudo sai do Log de auditoria. NAO mede o software anterior nem sabe se ha Chamados sendo tratados fora daqui — essas duas perguntas estao na checklist de paridade e dependem de observacao humana.',
      inputSchema: relatorioDeOperacaoInputSchema,
      outputSchema: relatorioDeOperacaoOutputSchema,
    },
    criarHandlerRelatorioDeOperacao(deps),
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

  // Story 3.6 — Resources e Prompt (FR-16).
  //
  // Os Resources sao CASCA: `chamado` chama a mesma `verChamado` da tool, e
  // `fila` a mesma `buscarChamados`. Uma consulta propria aqui seria uma segunda
  // porta de leitura, com uma segunda chance de divergir do AD-8 — que e
  // exatamente o que o epico inteiro existe para impedir.
  servidor.registerResource(
    'chamado',
    new ResourceTemplate('chamado://{numero}', { list: undefined }),
    {
      title: 'Chamado',
      description:
        'O mesmo conteudo de ver_chamado, como contexto de leitura. Respeita a autorizacao: quem nao pode ver o Chamado recebe o mesmo erro da tool.',
      mimeType: 'application/json',
    },
    async (uri, variaveis) => criarLeitorDeChamado(deps)(uri, String(variaveis.numero)),
  )

  servidor.registerResource(
    'fila',
    'fila://atual',
    {
      title: 'Fila',
      description:
        'A Fila como buscar_chamados a devolveria, com os limites padrao. Sem parametros: para recortar, use a tool.',
      mimeType: 'application/json',
    },
    async (uri) => criarLeitorDaFila(deps)(uri, {}),
  )

  servidor.registerPrompt(
    'triagem_de_chamado',
    {
      title: 'Triagem de Chamado',
      description:
        'Passo a passo para triar um Chamado usando as tools deste servidor, com as regras de versao e de acao irreversivel.',
      argsSchema: { numero: z.string() },
    },
    ({ numero }) => ({
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: TEXTO_DA_TRIAGEM(Number(numero)) },
        },
      ],
    }),
  )

  return servidor
}
