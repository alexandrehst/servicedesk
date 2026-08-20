import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { conectarPorImap, criarCaixaImap } from '../adapters/email/imap.js'
import { criarVarredura } from '../adapters/email/varredura.js'
import { criarServidorMcp } from '../adapters/mcp/server.js'
import { abrirChamado } from '../application/commands/abrir-chamado.js'
import { abrirChamadoPorEmail } from '../application/commands/abrir-chamado-por-email.js'
import { iniciarAgendador } from './agendador.js'
import { ConfigInvalida, lerConfig } from './config.js'
import { montar } from './montar.js'

/**
 * O entrypoint (Story 5.1).
 *
 * Ate aqui o projeto tinha 973 testes verdes e nenhum jeito de rodar. Este
 * arquivo e o que faltava — e ele nao faz nada alem de: ler config, montar,
 * ligar o que estiver configurado, conectar o transporte e encerrar limpo.
 *
 * **stdout e do PROTOCOLO.** Nada aqui escreve nele; o logger vai para
 * `stderr` desde a Story 1.6, decidido exatamente por causa disto.
 */
const principal = async (): Promise<void> => {
  const config = lerConfig(process.env)
  const { deps, logger, fechar } = montar(config)

  // O que ficou desligado vai ao log ANTES de o servidor subir. Desligado e
  // quebrado se parecem de fora — a Story 1.9 registrou isso ao criar `aviso`.
  for (const recurso of config.recursosDesligados) {
    logger.aviso('recurso_desligado', { recurso })
  }

  const agendador =
    config.imap === null
      ? null
      : iniciarAgendador({
          varrer: criarVarredura({
            caixa: criarCaixaImap(config.imap.caixa, conectarPorImap(config.imap)),
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

  const encerrar = async () => {
    agendador?.parar()
    await fechar()
    process.exit(0)
  }

  process.on('SIGINT', () => void encerrar())
  process.on('SIGTERM', () => void encerrar())

  await criarServidorMcp(deps).connect(new StdioServerTransport())
}

principal().catch((erro: unknown) => {
  // Config invalida e erro de OPERADOR, nao defeito: a mensagem basta, e o
  // stack rastrearia codigo que esta certo. Qualquer outra coisa leva o stack,
  // porque ai o defeito e nosso.
  if (erro instanceof ConfigInvalida) {
    process.stderr.write(`${erro.message}\n`)
  } else {
    process.stderr.write(`${erro instanceof Error ? (erro.stack ?? erro.message) : String(erro)}\n`)
  }

  process.exit(1)
})
