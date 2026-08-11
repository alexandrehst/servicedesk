import type { Logger } from '../../application/ports/logger.js'

/**
 * Log estruturado em uma linha de JSON (Story 1.6).
 *
 * Uma linha por evento, com campos nomeados: e o formato que um coletor
 * consegue indexar sem parser proprio, e que continua legivel no terminal.
 *
 * Escreve em `stderr` de proposito. O transporte MCP padrao e stdio, e o
 * `stdout` carrega o protocolo — um log ali corromperia a conversa com o
 * cliente.
 */
export const criarLogger = (
  escrever: (linha: string) => void = (linha) => process.stderr.write(`${linha}\n`),
): Logger => ({
  erro(evento, dados) {
    escrever(JSON.stringify({ nivel: 'erro', evento, ...dados }))
  },
  aviso(evento, dados) {
    escrever(JSON.stringify({ nivel: 'aviso', evento, ...dados }))
  },
})
