import { beforeEach, describe, expect, it } from 'vitest'
import { DomainError } from '../../domain/errors.js'
import type { MensagemRecebida } from '../contracts/intake-de-email.js'
import type { Principal } from '../contracts/principal.js'
import type { IdentityRepository, UsuarioCadastrado } from '../ports/identity-repository.js'
import type { Logger } from '../ports/logger.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import { abrirChamadoPorEmail } from './abrir-chamado-por-email.js'

/**
 * Esta e a fronteira mais exposta do projeto: a primeira escrita que chega de
 * fora, por um canal que ninguem controla, com identidade vinda de um
 * cabecalho de texto.
 *
 * Os testes de RECUSA vem antes do caminho feliz de proposito — o padrao das
 * stories 1.4 e 1.8. Um intake que abre Chamado corretamente mas aceita
 * remetente forjado nao esta "quase certo": esta errado.
 */

type Aberto = {
  readonly input: { titulo: string; descricao: string; categoria: string }
  readonly autor: Principal
  readonly messageId: string | undefined
}

const estado = {
  usuarios: [] as UsuarioCadastrado[],
  aberturas: [] as Aberto[],
  intakes: new Map<string, number>(),
  avisos: [] as { evento: string; dados: Record<string, string | number> }[],
  proximoNumero: 1000,
  erroAoAbrir: null as Error | null,
}

const identidades: Pick<IdentityRepository, 'buscarUsuarioPorEmail'> = {
  async buscarUsuarioPorEmail(email) {
    return estado.usuarios.find((u) => u.email === email) ?? null
  },
}

const repositorio: Pick<TicketRepository, 'buscarIntakePorMessageId'> = {
  async buscarIntakePorMessageId(messageId) {
    return estado.intakes.get(messageId) ?? null
  },
}

const logger: Logger = {
  erro(evento, dados) {
    estado.avisos.push({ evento, dados: { ...dados } })
  },
  aviso(evento, dados) {
    estado.avisos.push({ evento, dados: { ...dados } })
  },
}

const abrir = async (
  input: { titulo: string; descricao: string; categoria: string },
  autor: Principal,
  intake?: { readonly messageId: string },
) => {
  if (estado.erroAoAbrir !== null) throw estado.erroAoAbrir

  const numero = estado.proximoNumero++
  estado.aberturas.push({ input, autor, messageId: intake?.messageId })
  if (intake !== undefined) estado.intakes.set(intake.messageId, numero)

  return { number: numero, status: 'aberto' }
}

// biome-ignore lint/suspicious/noExplicitAny: o duble cobre a forma que o caso de uso consome
const processar = abrirChamadoPorEmail({ identidades, repositorio, abrir: abrir as any, logger })

const mensagem = (parcial: Partial<MensagemRecebida> = {}): MensagemRecebida => ({
  messageId: '<abc@empresa.com>',
  de: 'marina@empresa.com',
  assunto: 'Notebook nao liga',
  corpo: 'Apertei o botao e nada acontece.',
  autenticacao: 'aprovada',
  ...parcial,
})

beforeEach(() => {
  estado.usuarios = [
    { email: 'marina@empresa.com', papel: 'solicitante' },
    { email: 'bruno@empresa.com', papel: 'agente' },
  ]
  estado.aberturas = []
  estado.intakes = new Map()
  estado.avisos = []
  estado.proximoNumero = 1000
  estado.erroAoAbrir = null
})

describe('autenticidade do remetente (AC #3)', () => {
  it.each(['reprovada', 'ausente'] as const)('recusa mensagem com veredito %s', async (v) => {
    const resultado = await processar(mensagem({ autenticacao: v }))

    expect(resultado).toEqual({ tipo: 'recusado', motivo: 'autenticidade' })
    expect(estado.aberturas).toHaveLength(0)
  })

  /**
   * O TESTE MAIS IMPORTANTE DA STORY.
   *
   * O `From` e escrito por quem envia. Se a checagem de cadastro viesse antes
   * da de autenticidade, bastaria escrever o e-mail de qualquer funcionario
   * para abrir Chamado em nome dele — a verificacao existiria e nao valeria
   * nada. Este teste trava a ORDEM, nao so a existencia da regra.
   */
  it('recusa mesmo quando o From casa com um usuario cadastrado', async () => {
    const resultado = await processar(
      mensagem({ de: 'bruno@empresa.com', autenticacao: 'reprovada' }),
    )

    expect(resultado).toEqual({ tipo: 'recusado', motivo: 'autenticidade' })
    expect(estado.aberturas).toHaveLength(0)
  })

  /**
   * Este trava a ORDEM, e nao so a existencia da regra.
   *
   * Com a autenticidade checada primeiro, uma mensagem forjada de endereco
   * inexistente e recusada por `autenticidade` — o veredito que descreve o que
   * de fato aconteceu. Se a checagem de cadastro viesse antes, o motivo seria
   * `remetente_desconhecido`, e o log diria "faltou cadastrar alguem" para o
   * que era uma tentativa de forjar remetente. E a diferenca entre enxergar um
   * ataque e arquivar um chamado de cadastro.
   */
  it('mensagem forjada de endereco desconhecido e recusada por autenticidade', async () => {
    const resultado = await processar(
      mensagem({ de: 'ninguem@fora.com', autenticacao: 'reprovada' }),
    )

    expect(resultado).toEqual({ tipo: 'recusado', motivo: 'autenticidade' })
  })
})

describe('remetente fora do cadastro (AC #2)', () => {
  it('recusa quem nao esta em users', async () => {
    const resultado = await processar(mensagem({ de: 'estranho@fora.com' }))

    expect(resultado).toEqual({ tipo: 'recusado', motivo: 'remetente_desconhecido' })
    expect(estado.aberturas).toHaveLength(0)
  })

  /**
   * Nada volta para o remetente — nem "voce nao esta cadastrado". Responder a
   * um endereco forjado transforma o suporte em amplificador de spam, e
   * confirma a quem sonda que o endereco existe. Mesmo raciocinio da resposta
   * cega do `solicitarLink` (Story 1.3).
   *
   * O duble de abertura e o unico caminho de saida que o caso de uso tem; se
   * ele nao foi chamado, nada saiu.
   */
  it('nao responde ao remetente recusado', async () => {
    await processar(mensagem({ de: 'estranho@fora.com' }))

    expect(estado.aberturas).toHaveLength(0)
  })
})

describe('mensagem que nao da para processar (AC #4)', () => {
  it('recusa sem Message-ID: sem ele nao ha como deduplicar', async () => {
    const resultado = await processar(mensagem({ messageId: null }))

    expect(resultado).toEqual({ tipo: 'recusado', motivo: 'sem_message_id' })
  })

  it('recusa quando assunto e corpo estao vazios', async () => {
    const resultado = await processar(mensagem({ assunto: '   ', corpo: '' }))

    expect(resultado).toEqual({ tipo: 'recusado', motivo: 'mensagem_vazia' })
  })
})

describe('toda recusa vira registro estruturado', () => {
  it.each([
    ['autenticidade', mensagem({ autenticacao: 'reprovada' })],
    ['remetente_desconhecido', mensagem({ de: 'estranho@fora.com' })],
    ['sem_message_id', mensagem({ messageId: null })],
    ['mensagem_vazia', mensagem({ assunto: '', corpo: '' })],
  ] as const)('registra o motivo %s', async (motivo, entrada) => {
    await processar(entrada)

    expect(estado.avisos).toHaveLength(1)
    expect(estado.avisos[0]?.dados.motivo).toBe(motivo)
  })

  /**
   * Silencio nos dois lados faria um intake quebrado parecer um intake sem
   * demanda — mas o log tambem nao pode virar copia da caixa de entrada.
   */
  it('nao registra o corpo nem o assunto da mensagem', async () => {
    await processar(mensagem({ de: 'estranho@fora.com', corpo: 'segredo industrial' }))

    const registrado = JSON.stringify(estado.avisos)
    expect(registrado).not.toContain('segredo industrial')
    expect(registrado).not.toContain('Notebook nao liga')
  })
})

describe('abertura (AC #1, #5)', () => {
  it('abre o Chamado com assunto, corpo e categoria de quem nao foi triado', async () => {
    const resultado = await processar(mensagem())

    expect(resultado).toEqual({ tipo: 'aberto', numero: 1000 })
    expect(estado.aberturas[0]?.input).toEqual({
      titulo: 'Notebook nao liga',
      descricao: 'Apertei o botao e nada acontece.',
      categoria: 'nao_classificado',
    })
  })

  /**
   * AD-9: o autor gravado e a identidade do CADASTRO, nunca o texto do
   * cabecalho — e a origem diz por onde entrou.
   */
  it('o autor vem do cadastro, com origin email', async () => {
    await processar(mensagem())

    expect(estado.aberturas[0]?.autor).toEqual({
      identity: 'marina@empresa.com',
      role: 'solicitante',
      origin: 'email',
    })
  })

  it('o papel vem do cadastro: Agente que manda e-mail abre como Agente', async () => {
    await processar(mensagem({ de: 'bruno@empresa.com' }))

    expect(estado.aberturas[0]?.autor.role).toBe('agente')
  })

  /**
   * Se o intake normalizasse diferente de `platform/auth`, a mesma pessoa
   * viraria duas identidades — uma para quem entra pelo portal e outra para
   * quem manda e-mail.
   */
  it('normaliza o remetente antes de procurar no cadastro', async () => {
    const resultado = await processar(mensagem({ de: '  MARINA@Empresa.COM ' }))

    expect(resultado.tipo).toBe('aberto')
    expect(estado.aberturas[0]?.autor.identity).toBe('marina@empresa.com')
  })

  it('passa o Message-ID para a abertura — o vinculo e gravado junto', async () => {
    await processar(mensagem())

    expect(estado.aberturas[0]?.messageId).toBe('<abc@empresa.com>')
  })
})

describe('assunto e corpo nos limites', () => {
  it('assunto vazio vira (sem assunto), sem perder o Chamado', async () => {
    await processar(mensagem({ assunto: '   ' }))

    expect(estado.aberturas[0]?.input.titulo).toBe('(sem assunto)')
  })

  it('corpo vazio: a descricao recebe o assunto', async () => {
    await processar(mensagem({ corpo: '  ' }))

    expect(estado.aberturas[0]?.input.descricao).toBe('Notebook nao liga')
  })
})

describe('reentrega da mesma mensagem (AC #4)', () => {
  it('a segunda entrega aponta o Chamado que ja existe', async () => {
    const primeira = await processar(mensagem())
    const segunda = await processar(mensagem())

    expect(primeira).toEqual({ tipo: 'aberto', numero: 1000 })
    expect(segunda).toEqual({ tipo: 'duplicado', numero: 1000 })
    expect(estado.aberturas).toHaveLength(1)
  })

  /**
   * A corrida: duas entregas passam pela leitura previa antes de qualquer
   * insert, e o UNIQUE do banco reprova a segunda. O caso de uso traduz isso
   * em "duplicado" — nao e falha, e a garantia funcionando.
   */
  it('violacao de unicidade no banco tambem vira duplicado', async () => {
    estado.erroAoAbrir = new DomainError('MensagemJaProcessada', 'ja processada')

    // A primeira leitura nao ve nada — a outra entrega ainda nao comitou. A
    // segunda, ja depois do UNIQUE reprovar, ve o Chamado que ela criou.
    let leituras = 0
    const repositorioCego: Pick<TicketRepository, 'buscarIntakePorMessageId'> = {
      async buscarIntakePorMessageId() {
        leituras += 1
        return leituras === 1 ? null : 1042
      },
    }

    const processarComCorrida = abrirChamadoPorEmail({
      identidades,
      repositorio: repositorioCego,
      // biome-ignore lint/suspicious/noExplicitAny: duble
      abrir: abrir as any,
      logger,
    })

    expect(await processarComCorrida(mensagem())).toEqual({ tipo: 'duplicado', numero: 1042 })
  })

  /**
   * Se o banco disse "duplicada" mas a releitura nao acha o Chamado, algo esta
   * errado de um jeito que nao da para resolver aqui — a mensagem NAO pode ser
   * dada por processada. O erro sobe, a varredura nao marca como lida, e a
   * proxima tentativa encontra o estado ja consistente.
   */
  it('duplicidade sem Chamado correspondente nao vira sucesso falso', async () => {
    estado.erroAoAbrir = new DomainError('MensagemJaProcessada', 'ja processada')

    const repositorioVazio: Pick<TicketRepository, 'buscarIntakePorMessageId'> = {
      async buscarIntakePorMessageId() {
        return null
      },
    }

    const processarSemVinculo = abrirChamadoPorEmail({
      identidades,
      repositorio: repositorioVazio,
      // biome-ignore lint/suspicious/noExplicitAny: duble
      abrir: abrir as any,
      logger,
    })

    await expect(processarSemVinculo(mensagem())).rejects.toThrow('ja processada')
  })

  it('erro que nao e duplicidade sobe — nao vira recusa silenciosa', async () => {
    estado.erroAoAbrir = new DomainError('CategoriaInvalida', 'categoria ruim')

    await expect(processar(mensagem())).rejects.toThrow('categoria ruim')
  })
})
