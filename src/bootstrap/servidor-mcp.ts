import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { criarServidorMcp } from '../adapters/mcp/server.js'
import { criarAplicacao } from './aplicacao.js'
import { ConfigInvalida, lerConfig } from './config.js'
import { montar } from './montar.js'

/**
 * O entrypoint (Story 5.1).
 *
 * Ate esta story o projeto tinha 973 testes verdes e nenhum jeito de rodar.
 *
 * Este arquivo e SO o fio com o sistema operacional — sinais, codigo de saida e
 * transporte. Toda decisao testavel (se o intake sobe, o que avisar, a ordem do
 * encerramento) vive em `aplicacao.ts`, e e por isso que aqui nao ha `if`
 * nenhum.
 *
 * **`stdout` e do PROTOCOLO.** Nada aqui escreve nele; o logger vai para
 * `stderr` desde a Story 1.6, decidido exatamente por causa disto.
 */
const principal = async (): Promise<void> => {
  const config = lerConfig(process.env)
  const montagem = montar(config)
  const { encerrar } = criarAplicacao(config, montagem)

  const sair = (sinal: string) => {
    void encerrar(sinal).then((codigo) => process.exit(codigo))
  }

  process.on('SIGINT', () => sair('SIGINT'))
  process.on('SIGTERM', () => sair('SIGTERM'))

  await criarServidorMcp(montagem.deps).connect(new StdioServerTransport())
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
