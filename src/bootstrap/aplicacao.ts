import { conectarPorImap, criarCaixaImap } from '../adapters/email/imap.js'
import { criarVarredura } from '../adapters/email/varredura.js'
import { abrirChamado, depsDeAbrirChamado } from '../application/commands/abrir-chamado.js'
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
   * Devolve o codigo de saida: `0` limpo, `1` se QUALQUER uma das duas etapas
   * falhou. E **o pool e sempre fechado**, mesmo que parar o agendador falhe —
   * na primeira versao uma falha em `parar()` pulava o `fechar()` e ainda assim
   * devolvia `1`, com o contrato dizendo "o pool falhou ao fechar". O codigo de
   * saida estava certo por acaso e a mensagem estava errada; pior, o pool
   * ficava aberto. (Achado do review no PR #85.)
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
              // O MESMO helper que a tool MCP usa: dois pontos de entrada
              // montando o command de jeitos diferentes foi o achado do review
              // no PR #85.
              abrir: abrirChamado(depsDeAbrirChamado(deps.repositorio, deps.notificacao)),
              logger,
            }),
            logger,
          }),
          intervaloMs: config.intakeIntervaloMs,
          logger,
        })

  return {
    agendador,
    /**
     * **Esta funcao NUNCA rejeita** — e isso e contrato, nao coincidencia.
     *
     * Quem a chama sao os handlers de SIGINT/SIGTERM, registrados DEPOIS do
     * `principal().catch(...)`; uma rejeicao aqui nao seria interceptada por
     * ninguem e derrubaria o processo por `unhandledRejection` cru, sem passar
     * pelo logger estruturado.
     *
     * Na primeira versao o `agendador?.parar()` ficava FORA do `try` (achado do
     * review no PR #85) — o mesmo defeito que este PR ja tinha corrigido para o
     * `fechar()`, reaberto por outra via. Agora o `try` cobre os dois, e o
     * entrypoint nao precisa de `catch` defensivo: garantia estrutural vale
     * mais que deteccao, e um `catch` que nunca dispara e codigo nao
     * exercitado (licao da Story 4.3).
     */
    encerrar: async (sinal: string) => {
      const registrar = (etapa: string, erro: unknown) => {
        logger.erro('falha_ao_encerrar', {
          sinal,
          // QUAL etapa falhou. Sem isto, "falha ao encerrar" mandaria quem
          // investiga olhar o pool quando o problema era o timer, e vice-versa.
          etapa,
          causa: erro instanceof Error ? erro.message : String(erro),
        })
      }

      // As duas etapas sao independentes, e por isso tem `try` proprio:
      // parar o agendador ANTES de fechar o pool evita uma varredura em voo
      // falando com um banco fechado — mas se parar FALHAR, o pool ainda
      // precisa ser fechado. Um pool aberto sobrevive ao processo.
      let houveFalha = false

      try {
        agendador?.parar()
      } catch (erro: unknown) {
        registrar('parar_agendador', erro)
        houveFalha = true
      }

      try {
        await fechar()
      } catch (erro: unknown) {
        registrar('fechar_pool', erro)
        houveFalha = true
      }

      return houveFalha ? 1 : 0
    },
  }
}
