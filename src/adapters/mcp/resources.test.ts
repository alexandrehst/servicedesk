import { describe, expect, it } from 'vitest'
import { LIMITE_PADRAO } from '../../application/contracts/buscar-chamados.js'
import type { Principal } from '../../application/contracts/principal.js'
import type { TicketRepository } from '../../application/ports/ticket-repository.js'
import { ehDomainError } from '../../domain/errors.js'
import type { Status, Ticket } from '../../domain/ticket.js'
import { embrulharBruto, type ItemDaFilaBruto } from '../../domain/visibilidade.js'
import {
  criarHandlerBuscarChamados,
  criarHandlerVerChamado,
  criarLeitorDaFila,
  criarLeitorDeChamado,
  criarServidorMcp,
  type McpDeps,
  TEXTO_DA_TRIAGEM,
} from './server.js'

/**
 * Resources e Prompt (Story 3.6, FR-16).
 *
 * O risco desta story e escrever uma SEGUNDA leitura — consulta propria, filtro
 * proprio, erro proprio — e com ela uma segunda chance de vazar. Por isso o
 * teste central compara Resource com tool: os dois precisam devolver o mesmo.
 */

const ticket = (requester: string): Ticket => ({
  number: 1042,
  titulo: 'VPN nao conecta',
  descricao: 'Sem acesso remoto.',
  categoria: 'rede',
  status: 'aberto' as Status,
  prioridade: 'alta',
  requester,
  assignee: null,
  criadoEm: new Date('2026-08-19T09:00:00.000Z'),
  excluidoEm: null,
  version: 3,
})

const item = (requester: string): ItemDaFilaBruto => ({
  number: 1042,
  titulo: 'VPN nao conecta',
  status: 'aberto' as Status,
  prioridade: 'alta',
  requester,
  assignee: null,
  criadoEm: new Date('2026-08-19T09:00:00.000Z'),
  excluidoEm: null,
})

let autenticacoes: number
let limitadas: string[]
let filaPedida: { limite: number; deslocamento: number; ordem: string } | null

const deps = (quem: Principal, dono = 'marina@empresa.com'): McpDeps => {
  autenticacoes = 0
  limitadas = []
  filaPedida = null

  const repositorio = {
    async buscarPorNumero() {
      return embrulharBruto({ ticket: ticket(dono), comentarios: [] })
    },
    async buscarFilaBruta(_escopo: unknown, _filtros: unknown, pagina: unknown) {
      filaPedida = pagina as typeof filaPedida
      return embrulharBruto({ itens: [item(dono)], temMais: false })
    },
  } as unknown as TicketRepository

  return {
    repositorio,
    autenticar: async () => {
      autenticacoes += 1
      return { identity: quem.identity, role: quem.role }
    },
    limitarChamadas: async (identity: string) => {
      limitadas.push(identity)
    },
    identidades: {
      async buscarUsuarioPorEmail() {
        return null
      },
    },
    confirmacao: {
      async emitir() {
        return 'token'
      },
      async consumir() {
        return true
      },
    },
  }
}

const bruno: Principal = { identity: 'bruno@empresa.com', role: 'agente', origin: 'mcp' }
const marina: Principal = { identity: 'marina@empresa.com', role: 'solicitante', origin: 'mcp' }
const carlos: Principal = { identity: 'carlos@empresa.com', role: 'solicitante', origin: 'mcp' }

const uri = new URL('chamado://1042')

describe('o Resource devolve o MESMO que a tool (AC #1, #2)', () => {
  /**
   * O teste que impede a segunda porta. Se um dia alguem "otimizar" o Resource
   * com uma consulta propria, os dois passam a divergir e isto reprova.
   */
  it('chamado://1042 == ver_chamado(1042)', async () => {
    const d = deps(bruno)

    const pelaTool = await criarHandlerVerChamado(d)({ numero: 1042 })
    const peloResource = await criarLeitorDeChamado(d)(uri, '1042')

    expect(JSON.parse(peloResource.contents[0]?.text ?? '')).toEqual(pelaTool.structuredContent)
  })

  it('fila://atual == buscar_chamados() com os defaults', async () => {
    const d = deps(bruno)

    const pelaTool = await criarHandlerBuscarChamados(d)({
      limite: LIMITE_PADRAO,
      deslocamento: 0,
      ordem: 'asc',
    })
    const peloResource = await criarLeitorDaFila(d)(new URL('fila://atual'), {})

    expect(JSON.parse(peloResource.contents[0]?.text ?? '')).toEqual(pelaTool.structuredContent)
  })

  /**
   * A comparacao acima nao pega tudo: o duble devolve a mesma lista
   * independentemente dos parametros, entao um Resource que pedisse `limite: 1,
   * ordem: desc` daria o mesmo resultado. Foi assim que a mutacao dos defaults
   * sobreviveu na primeira rodada — quem a pega e esta assercao sobre o que o
   * Resource PEDIU.
   */
  it('a Fila e pedida com os defaults do contrato', async () => {
    await criarLeitorDaFila(deps(bruno))(new URL('fila://atual'), {})

    expect(filaPedida).toEqual({ limite: LIMITE_PADRAO, deslocamento: 0, ordem: 'asc' })
  })

  it('o conteudo sai como JSON, que e o que a IA ja sabe ler', async () => {
    const peloResource = await criarLeitorDeChamado(deps(bruno))(uri, '1042')

    expect(peloResource.contents[0]?.mimeType).toBe('application/json')
    expect(peloResource.contents[0]?.uri).toBe(uri.href)
  })
})

describe('a autorizacao e a mesma (AC #3)', () => {
  /**
   * O Chamado e da marina; carlos e outro Solicitante. Pela tool ele recebe
   * `TicketNaoEncontrado`; pelo Resource tem de receber o MESMO — o Resource
   * nao e uma porta com regras proprias.
   */
  it('Chamado alheio da o mesmo erro que a tool daria', async () => {
    const d = deps(carlos)

    const pelaTool = await criarHandlerVerChamado(d)({ numero: 1042 })
    expect(pelaTool.isError).toBe(true)

    let capturado: unknown
    try {
      await criarLeitorDeChamado(d)(uri, '1042')
    } catch (erro) {
      capturado = erro
    }

    // A diferenca e o ENVELOPE, nao a regra: tool devolve `isError`, Resource
    // lanca — porque o protocolo de leitura nao tem envelope de erro.
    expect(ehDomainError(capturado) && capturado.code).toBe('TicketNaoEncontrado')
  })

  it('o dono do Chamado le pelo Resource normalmente', async () => {
    const peloResource = await criarLeitorDeChamado(deps(marina))(uri, '1042')

    expect(JSON.parse(peloResource.contents[0]?.text ?? '').number).toBe(1042)
  })
})

/**
 * O `numero` chega como TEXTO da URI, e o SDK NAO o valida: `ResourceTemplate`
 * nao aceita schema para variaveis. Sem o parse explicito, valores que a tool
 * recusa de cara chegariam ao repositorio — achado do `claude-review` no PR #74,
 * e exatamente a divergencia entre pontos de entrada que o AD-6 impede.
 */
describe('o numero da URI passa pelo contrato da tool (AD-6)', () => {
  it.each(['abc', '-5', '1.5', '0', ''])(
    'recusa chamado://%s antes de tocar o repositorio',
    async (numero) => {
      const d = deps(bruno)
      let tocou = false
      const espiao: McpDeps = {
        ...d,
        repositorio: {
          ...d.repositorio,
          async buscarPorNumero() {
            tocou = true
            return null
          },
        },
      }

      await expect(criarLeitorDeChamado(espiao)(uri, numero)).rejects.toThrow()
      expect(tocou).toBe(false)
    },
  )

  it('aceita o Numero valido', async () => {
    const peloResource = await criarLeitorDeChamado(deps(bruno))(uri, '1042')

    expect(JSON.parse(peloResource.contents[0]?.text ?? '').number).toBe(1042)
  })
})

describe('Resource autentica e limita, como as tools (AC #4)', () => {
  it('o Resource de Chamado passa pelos dois', async () => {
    const d = deps(bruno)

    await criarLeitorDeChamado(d)(uri, '1042')

    expect(autenticacoes).toBe(1)
    expect(limitadas).toEqual(['bruno@empresa.com'])
  })

  it('o Resource de Fila passa pelos dois', async () => {
    const d = deps(bruno)

    await criarLeitorDaFila(d)(new URL('fila://atual'), {})

    expect(autenticacoes).toBe(1)
    expect(limitadas).toEqual(['bruno@empresa.com'])
  })
})

describe('o Prompt de triagem (AC #5)', () => {
  /**
   * Um Prompt que cita tool inexistente ensina a IA a tentar o que o servidor
   * nao faz — e envelhece sozinho quando alguem renomeia uma tool. Cruzar com a
   * lista REAL do servidor e o que impede isso.
   */
  it('so cita tools que o servidor registra', async () => {
    const servidor = criarServidorMcp(deps(bruno))
    const texto = TEXTO_DA_TRIAGEM(1042)

    const citadas = [...texto.matchAll(/\b([a-z]+_[a-z_]+)\(/g)].map((m) => m[1])
    expect(citadas.length).toBeGreaterThan(0)

    for (const tool of citadas) {
      expect(servidor.toolInputSchemaJson(tool as string)).toBeDefined()
    }
  })

  it('menciona as tools da triagem pelo nome exato', async () => {
    const texto = TEXTO_DA_TRIAGEM(1042)

    for (const tool of ['ver_chamado', 'mudar_prioridade', 'atribuir_chamado', 'mudar_status']) {
      expect(texto).toContain(tool)
    }
  })

  /** A `versao` e o erro que a IA mais comete sozinha (AD-10). */
  it('lembra que a versao vem de ver_chamado e e obrigatoria', async () => {
    const texto = TEXTO_DA_TRIAGEM(1042).toLowerCase()

    expect(texto).toContain('versao')
    expect(texto).toContain('conflict')
  })

  /**
   * Triagem NAO encaminha para acao irreversivel: elas exigem confirmacao em
   * duas fases (AD-7), e um Prompt nao confirma nada.
   */
  it('avisa que fechar, cancelar e reabrir nao sao triagem', async () => {
    const texto = TEXTO_DA_TRIAGEM(1042).toLowerCase()

    expect(texto).toContain('irreversiveis')
    expect(texto).toContain('confirmacao')
  })

  it('o numero do Chamado aparece no texto', async () => {
    expect(TEXTO_DA_TRIAGEM(4711)).toContain('4711')
  })
})
