import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { criarServidorMcp } from '../adapters/mcp/server.js'
import { criarLogger } from '../platform/logging/logger.js'
import { criarAplicacao } from './aplicacao.js'
import { dadosDaFalhaDeBoot, lerConfig } from './config.js'
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
  // Pelo LOGGER ESTRUTURADO, e nao por `stderr.write` cru: o log e o unico
  // canal onde o resto do sistema aparece, e uma falha de boot e justamente a
  // que alguem vai procurar la.
  //
  // Instancia nova em vez de reaproveitar a de `montar`: `criarLogger` nao tem
  // estado — e a falha pode ter acontecido ANTES de haver montagem, que e
  // exatamente o caso da config invalida.
  //
  // A DECISAO de o que registrar vive em `dadosDaFalhaDeBoot`, e nao aqui:
  // este arquivo esta fora da cobertura porque nao contem decisao alguma, e
  // manter um ternario aqui contradiria a propria justificativa da exclusao.
  criarLogger().erro('falha_ao_subir', dadosDaFalhaDeBoot(erro))
  process.exit(1)
})
