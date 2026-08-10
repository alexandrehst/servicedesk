import { ImapFlow } from 'imapflow'
import type { CaixaDeEntrada, MensagemNaCaixa } from '../../application/ports/caixa-de-entrada.js'

/**
 * Driven adapter da direcao de ENTRADA (Story 1.9).
 *
 * IMAP com polling foi a escolha registrada: webhook exigiria endpoint
 * publico, e a topologia de deploy e um `Deferred` da spine — nao ha onde
 * receber. IMAP funciona contra qualquer provedor corporativo sem
 * infraestrutura nova.
 *
 * Esta e uma CASCA FINA de proposito: abre conexao, lista o nao lido, devolve
 * texto bruto, marca como lido. Nenhuma decisao sobre Chamado, identidade ou
 * autenticidade mora aqui — tudo isso esta em `abrirChamadoPorEmail`.
 *
 * A conexao e INJETADA, como o transporter da Story 1.6. E o que permite
 * exercitar o teto de mensagens, a liberacao da trava e o `logout` sem
 * servidor IMAP, que este ambiente nao tem. O que continua sem prova real e a
 * conversa com um servidor de verdade — registrado no Dev Agent Record.
 */
export type ImapConfig = {
  readonly host: string
  readonly port: number
  readonly user: string
  readonly pass: string
  /** Caixa a monitorar. `INBOX` no caso comum. */
  readonly caixa: string
}

/**
 * O pedaco do ImapFlow que este adapter usa. Declarar so isto — em vez de
 * depender do tipo inteiro do cliente — e o que torna o duble de teste viavel:
 * a interface real tem dezenas de metodos.
 */
export type ClienteImap = {
  connect(): Promise<void>
  logout(): Promise<void>
  getMailboxLock(caixa: string): Promise<{ release: () => void }>
  fetch(
    consulta: { seen: boolean },
    opcoes: { source: boolean; uid: boolean },
    // `| undefined` explicito por causa de `exactOptionalPropertyTypes`: o
    // servidor pode devolver a propriedade presente e vazia, nao so ausente.
  ): AsyncIterable<{ uid: number; source?: Buffer | undefined }>
  messageFlagsAdd(
    consulta: { uid: string },
    flags: string[],
    opcoes: { uid: boolean },
  ): Promise<boolean>
}

/**
 * Quantas mensagens uma varredura traz, no maximo.
 *
 * Sem teto, uma caixa com meses de acumulo (ou um ataque de volume) viraria um
 * lote unico que prende conexao e memoria. O resto fica para a proxima
 * varredura: nada se perde, porque o que nao foi marcado como lido volta.
 */
export const MAXIMO_POR_VARREDURA = 50

export const conectarPorImap = (config: ImapConfig) => async (): Promise<ClienteImap> => {
  const cliente = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.port === 993,
    auth: { user: config.user, pass: config.pass },
    // O ImapFlow loga em `stdout` por padrao, e o transporte MCP usa stdio:
    // um log ali corromperia o protocolo (mesma razao do logger em stderr).
    logger: false,
  })

  await cliente.connect()
  return cliente as unknown as ClienteImap
}

export const criarCaixaImap = (
  caixaDoServidor: string,
  conectar: () => Promise<ClienteImap>,
): CaixaDeEntrada => {
  /**
   * Toda operacao abre, trava, faz, destrava e sai. O `logout` no `finally` nao
   * e zelo: sem ele, uma varredura que falhasse no meio deixaria a conexao
   * pendurada ate o timeout do provedor — e provedor corporativo limita
   * conexoes simultaneas, entao poucas falhas bastariam para o intake parar.
   */
  const comCaixaAberta = async <T>(acao: (cliente: ClienteImap) => Promise<T>): Promise<T> => {
    const cliente = await conectar()

    try {
      const trava = await cliente.getMailboxLock(caixaDoServidor)

      try {
        return await acao(cliente)
      } finally {
        trava.release()
      }
    } finally {
      await cliente.logout()
    }
  }

  return {
    async buscarNaoProcessadas(): Promise<readonly MensagemNaCaixa[]> {
      return comCaixaAberta(async (cliente) => {
        const mensagens: MensagemNaCaixa[] = []

        for await (const msg of cliente.fetch({ seen: false }, { source: true, uid: true })) {
          if (mensagens.length >= MAXIMO_POR_VARREDURA) break
          if (msg.source === undefined) continue

          mensagens.push({ id: String(msg.uid), bruto: msg.source.toString('utf8') })
        }

        return mensagens
      })
    },

    async marcarProcessada(id: string): Promise<void> {
      await comCaixaAberta(async (cliente) => {
        await cliente.messageFlagsAdd({ uid: id }, ['\\Seen'], { uid: true })
      })
    },
  }
}
