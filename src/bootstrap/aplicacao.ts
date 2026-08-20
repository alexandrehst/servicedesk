import { conectarPorImap, criarCaixaImap } from '../adapters/email/imap.js'
import { criarVarredura } from '../adapters/email/varredura.js'
import { abrirChamado } from '../application/commands/abrir-chamado.js'
import { abrirChamadoPorEmail } from '../application/commands/abrir-chamado-por-email.js'
import type { CaixaDeEntrada } from '../application/ports/caixa-de-entrada.js'
import { type Agendador, iniciarAgendador } from './agendador.js'
import type { Config } from './config.js'
import type { Montagem } from './montar.js'

/**
 * A aplicacao montada, SEM o fio com o sistema operacional (Story 5.1).
 *
 * Existe separada de `servidor-mcp.ts` por um motivo concreto: aquele arquivo
 * ficava com 0% de cobertura, e a resposta preguicosa seria exclui-lo do Sonar.
 * O problema real era outro — **tinha logica de verdade misturada com o fio**:
 * decidir se o intake sobe, avisar o que ficou desligado, encerrar na ordem
 * certa. Isso e testavel, e agora esta aqui.
 *
 * O que fica la e o que NAO da para testar sem duble inutil: `process.on`,
 * `process.exit` e `connect(new StdioServerTransport())`. A licao da 4.2 vale:
 * um duble prova o contrato que voce imaginou, nao o que existe — um teste que
 * confirma que `connect` foi chamado nao prova que o servidor fala MCP.
 */
export type Aplicacao = {
  /** `null` quando o intake nao esta configurado. */
  readonly agendador: Agendador | null
  /**
   * Encerra na ordem: para o agendador, depois fecha o pool. O inverso deixaria
   * uma varredura em voo tentando falar com um banco ja fechado.
   *
   * Devolve o codigo de saida: `0` no encerramento limpo, `1` quando o pool
   * falhou ao fechar — sair com `0` mentiria sobre isso.
   */
  readonly encerrar: (sinal: string) => Promise<number>
}

/** Injetavel para o teste nao abrir conexao IMAP de verdade. */
export type AplicacaoDeps = {
  readonly criarCaixa?: (config: NonNullable<Config['imap']>) => CaixaDeEntrada
}

export const criarAplicacao = (
  config: Config,
  montagem: Montagem,
  { criarCaixa }: AplicacaoDeps = {},
): Aplicacao => {
  const { deps, logger, fechar } = montagem

  // O que ficou desligado vai ao log ANTES de qualquer coisa subir. Desligado e
  // quebrado se parecem de fora — a Story 1.9 registrou isso ao criar `aviso`.
  for (const recurso of config.recursosDesligados) {
    logger.aviso('recurso_desligado', { recurso })
  }

  const agendador =
    config.imap === null
      ? null
      : iniciarAgendador({
          varrer: criarVarredura({
            caixa:
              criarCaixa === undefined
                ? criarCaixaImap(config.imap.caixa, conectarPorImap(config.imap))
                : criarCaixa(config.imap),
            processar: abrirChamadoPorEmail({
              identidades: deps.identidades,
              repositorio: deps.repositorio,
              abrir: abrirChamado(
                deps.notificacao === undefined
                  ? { repositorio: deps.repositorio }
                  : { repositorio: deps.repositorio, notificacao: deps.notificacao },
              ),
              logger,
            }),
            logger,
          }),
          intervaloMs: config.intakeIntervaloMs,
          logger,
        })

  return {
    agendador,
    encerrar: async (sinal: string) => {
      agendador?.parar()

      // A falha ao fechar o pool vai para o LOG ESTRUTURADO, como todo o resto.
      // Sem isto ela viraria `unhandledRejection` cru — sem os campos
      // `nivel`/`evento` que o logger grava de proposito para "um coletor
      // conseguir indexar sem parser proprio" (1.6). Quem monitora pelo log
      // nao veria; so quem estivesse lendo o stderr bruto na hora.
      try {
        await fechar()
        return 0
      } catch (erro: unknown) {
        logger.erro('falha_ao_encerrar', {
          sinal,
          causa: erro instanceof Error ? erro.message : String(erro),
        })
        return 1
      }
    },
  }
}
