import { describe, expect, it } from 'vitest'
import { type ClienteImap, criarCaixaImap, MAXIMO_POR_VARREDURA } from './imap.js'

/**
 * A conexao e injetada, como o transporter da Story 1.6. O que estes testes
 * exercitam e a casca: o teto de mensagens, a liberacao da trava, o `logout`
 * mesmo em falha, e a traducao de UID para identificador.
 *
 * O que eles NAO provam e a conversa com um servidor IMAP real — nao ha um
 * neste ambiente. Registrado no Dev Agent Record como nao provado.
 */

type Registro = {
  conexoes: number
  logouts: number
  travas: number
  liberacoes: number
  flags: { uid: string; flags: string[] }[]
}

const criarCliente = (
  mensagens: { uid: number; source?: Buffer | undefined }[],
  aoBuscar?: () => never,
): { cliente: ClienteImap; registro: Registro } => {
  const registro: Registro = { conexoes: 0, logouts: 0, travas: 0, liberacoes: 0, flags: [] }

  const cliente: ClienteImap = {
    async connect() {
      registro.conexoes += 1
    },
    async logout() {
      registro.logouts += 1
    },
    async getMailboxLock() {
      registro.travas += 1
      return {
        release: () => {
          registro.liberacoes += 1
        },
      }
    },
    fetch() {
      if (aoBuscar !== undefined) aoBuscar()
      return (async function* () {
        for (const m of mensagens) yield m
      })()
    },
    async messageFlagsAdd(consulta, flags) {
      registro.flags.push({ uid: consulta.uid, flags })
      return true
    },
  }

  return { cliente, registro }
}

const comCliente = (cliente: ClienteImap) => criarCaixaImap('INBOX', async () => cliente)

describe('buscar mensagens nao lidas', () => {
  it('traduz UID em identificador e devolve o texto bruto', async () => {
    const { cliente } = criarCliente([{ uid: 42, source: Buffer.from('From: a@b.com') }])

    expect(await comCliente(cliente).buscarNaoProcessadas()).toEqual([
      { id: '42', bruto: 'From: a@b.com' },
    ])
  })

  it('ignora mensagem sem conteudo em vez de quebrar a varredura', async () => {
    const { cliente } = criarCliente([
      { uid: 1, source: undefined },
      { uid: 2, source: Buffer.from('From: a@b.com') },
    ])

    expect(await comCliente(cliente).buscarNaoProcessadas()).toHaveLength(1)
  })

  /**
   * Sem teto, uma caixa com meses de acumulo viraria um lote unico que prende
   * conexao e memoria. O resto volta na proxima varredura — nada se perde,
   * porque so o que foi processado e marcado como lido.
   */
  it('para no teto por varredura', async () => {
    const muitas = Array.from({ length: MAXIMO_POR_VARREDURA + 10 }, (_, i) => ({
      uid: i + 1,
      source: Buffer.from(`Mensagem ${i}`),
    }))
    const { cliente } = criarCliente(muitas)

    expect(await comCliente(cliente).buscarNaoProcessadas()).toHaveLength(MAXIMO_POR_VARREDURA)
  })

  it('caixa vazia devolve lista vazia', async () => {
    const { cliente } = criarCliente([])
    expect(await comCliente(cliente).buscarNaoProcessadas()).toEqual([])
  })
})

describe('marcar como processada', () => {
  it('marca a mensagem como lida pelo UID', async () => {
    const { cliente, registro } = criarCliente([])

    await comCliente(cliente).marcarProcessada('42')

    expect(registro.flags).toEqual([{ uid: '42', flags: ['\\Seen'] }])
  })
})

describe('higiene da conexao', () => {
  it('libera a trava e faz logout no caminho feliz', async () => {
    const { cliente, registro } = criarCliente([{ uid: 1, source: Buffer.from('x') }])

    await comCliente(cliente).buscarNaoProcessadas()

    expect(registro).toMatchObject({ travas: 1, liberacoes: 1, logouts: 1 })
  })

  /**
   * O teste que justifica o `finally`. Provedor corporativo limita conexoes
   * simultaneas: sem `logout` na falha, poucas varreduras com erro bastariam
   * para o intake parar de conseguir conectar — e o sintoma apareceria como
   * "nao chega e-mail", longe da causa.
   */
  it('faz logout mesmo quando a busca falha', async () => {
    const { cliente, registro } = criarCliente([], () => {
      throw new Error('servidor recusou')
    })

    await expect(comCliente(cliente).buscarNaoProcessadas()).rejects.toThrow('servidor recusou')

    expect(registro).toMatchObject({ liberacoes: 1, logouts: 1 })
  })
})
