import { expect, it } from 'vitest'
import type { Principal } from '../../application/contracts/principal.js'
import type { TicketRepository } from '../../application/ports/ticket-repository.js'
import type { NovoComentario } from '../../domain/comentario.js'
import { DomainError } from '../../domain/errors.js'
import type { Ticket } from '../../domain/ticket.js'
import { type Comentario, embrulharBruto } from '../../domain/visibilidade.js'
import {
  criarHandlerAbrirChamado,
  criarHandlerAtribuirChamado,
  criarHandlerComentarChamado,
  criarHandlerMudarPrioridade,
  criarHandlerMudarStatus,
  criarHandlerVerChamado,
  criarServidorMcp,
} from './server.js'

const registradas: Principal[] = []

const repositorio: TicketRepository = {
  async criarComAuditoria(novo, autor): Promise<Ticket> {
    registradas.push(autor)
    return {
      ...novo,
      number: 1042,
      criadoEm: new Date('2026-08-10T12:00:00Z'),
      excluidoEm: null,
      version: 1,
    }
  },
  async buscarPorNumero() {
    return null
  },
  async excluirComAuditoria() {
    throw new Error('esta suite nao exclui')
  },
  async criarComentarioComAuditoria() {
    throw new Error('esta suite nao comenta')
  },
  async mudarStatusComAuditoria() {
    throw new Error('esta suite nao muda Status')
  },
  async atribuirComAuditoria() {
    throw new Error('esta suite nao atribui')
  },
  async mudarPrioridadeComAuditoria() {
    throw new Error('esta suite nao muda Prioridade')
  },
  async buscarIntakePorMessageId() {
    throw new Error('esta suite nao faz intake por e-mail')
  },
  async executarAcaoIrreversivelComAuditoria() {
    throw new Error('esta suite nao executa Acao irreversivel')
  },
  async buscarParaExportarBruto() {
    throw new Error('esta suite nao exporta')
  },
  async buscarParecidosBruto() {
    throw new Error('esta suite nao sugere parecidos')
  },
  async buscarResumoBruto() {
    throw new Error('esta suite nao le o resumo')
  },
  async buscarFilaBruta() {
    throw new Error('esta suite nao le a Fila')
  },
  async buscarHistoricoBruto() {
    throw new Error('esta suite nao le historico')
  },
}

const principal = { identity: 'bruno@empresa.com', role: 'agente' } as const

/**
 * Story 1.3: o adapter nao recebe mais um principal de configuracao — recebe
 * como RESOLVE-LO. O duble abaixo faz o papel de `resolverPrincipal` sobre uma
 * sessao valida.
 */
const autenticar = async () => principal

/**
 * Duble do cadastro (Story 2.3): so `bruno` e `ana` sao Agentes. E o que
 * permite exercitar a recusa de destinatario sem subir banco.
 */
const identidades = {
  async buscarUsuarioPorEmail(email: string) {
    const cadastro: Record<string, 'agente' | 'solicitante'> = {
      'bruno@empresa.com': 'agente',
      'ana@empresa.com': 'agente',
      'marina@empresa.com': 'solicitante',
    }
    const papel = cadastro[email]
    return papel === undefined ? null : { email, papel }
  },
}

/** Duble do limitador: por padrao nao limita nada. */
const semLimite = async () => {}
/** Limitador que registra quem foi contado, para as assercoes de ordem. */
const limitadosPor = (registro: string[]) => async (identity: string) => {
  registro.push(identity)
}

/**
 * Duble da confirmacao (Story 2.6). Esta suite prova o TRANSPORTE — que a tool
 * existe, valida a entrada e traduz o erro. Se ela for chamada onde o teste nao
 * espera, e sinal de que o caso foi montado errado.
 */
const confirmacao = {
  async emitir() {
    return 'token-de-confirmacao'
  },
  async consumir() {
    return true
  },
}

const deps = { repositorio, identidades, confirmacao, autenticar, limitarChamadas: semLimite }

const input = { titulo: 'VPN fora do ar', descricao: 'Nao conecta.', categoria: 'rede' } as const

it('registra a tool abrir_chamado com o schema do contrato (AD-6)', () => {
  const schema = criarServidorMcp(deps).toolInputSchemaJson('abrir_chamado')
  expect(schema).toBeDefined()
  expect(JSON.stringify(schema)).toContain('categoria')
  expect(JSON.stringify(schema)).toContain('hardware')
})

/**
 * O alvo muda a cada story que cria a tool anterior: era `fechar_chamado` ate a
 * 2.6, virou `buscar_chamados` ate a 3.1. A garantia e sempre a mesma — o
 * servidor nao expoe tool que nenhuma story especificou — e o alvo agora e o
 * import da Story 4.2.
 */
it('nao registra tool que a story nao especifica', () => {
  expect(criarServidorMcp(deps).toolInputSchemaJson('importar_csv')).toBeUndefined()
})

it('retorna o Numero do Chamado aberto', async () => {
  const resultado = await criarHandlerAbrirChamado(deps)(input)
  expect(resultado.structuredContent).toEqual({ number: 1042, status: 'aberto' })
  expect(resultado.content[0]?.text).toContain('#1042')
})

it('carimba origin mcp no principal (AD-9)', async () => {
  registradas.length = 0
  await criarHandlerAbrirChamado(deps)(input)
  expect(registradas[0]?.origin).toBe('mcp')
  expect(registradas[0]?.identity).toBe('bruno@empresa.com')
})

it('traduz erro de dominio em erro de tool, sem mascarar o codigo', async () => {
  const resultado = await criarHandlerAbrirChamado(deps)({ ...input, titulo: '   ' })
  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('TituloObrigatorio')
})

it('deixa erro nao-tipado subir, em vez de engolir (pilar Observavel)', async () => {
  const quebrado: TicketRepository = {
    async criarComAuditoria() {
      throw new Error('conexao perdida')
    },
    async buscarPorNumero() {
      return null
    },
    async excluirComAuditoria() {
      throw new Error('esta suite nao exclui')
    },
    async criarComentarioComAuditoria() {
      throw new Error('esta suite nao comenta')
    },
    async mudarStatusComAuditoria() {
      throw new Error('esta suite nao muda Status')
    },
    async atribuirComAuditoria() {
      throw new Error('esta suite nao atribui')
    },
    async mudarPrioridadeComAuditoria() {
      throw new Error('esta suite nao muda Prioridade')
    },
    async buscarIntakePorMessageId() {
      throw new Error('esta suite nao faz intake por e-mail')
    },
    async executarAcaoIrreversivelComAuditoria() {
      throw new Error('esta suite nao executa Acao irreversivel')
    },
    async buscarParaExportarBruto() {
      throw new Error('esta suite nao exporta')
    },
    async buscarParecidosBruto() {
      throw new Error('esta suite nao sugere parecidos')
    },
    async buscarResumoBruto() {
      throw new Error('esta suite nao le o resumo')
    },
    async buscarFilaBruta() {
      throw new Error('esta suite nao le a Fila')
    },
    async buscarHistoricoBruto() {
      throw new Error('esta suite nao le historico')
    },
  }
  await expect(
    criarHandlerAbrirChamado({
      repositorio: quebrado,
      identidades,
      confirmacao,
      autenticar,
      limitarChamadas: semLimite,
    })(input),
  ).rejects.toThrowError('conexao perdida')
})

// --- Story 1.2: tool de leitura ---

const chamado: Ticket = {
  number: 1042,
  titulo: 'Notebook nao liga',
  descricao: 'Sem resposta ao botao.',
  categoria: 'hardware',
  status: 'aberto',
  prioridade: 'media',
  requester: 'marina@empresa.com',
  assignee: null,
  criadoEm: new Date('2026-08-10T12:00:00Z'),
  excluidoEm: null,
  version: 1,
}

const thread: readonly Comentario[] = [
  {
    autor: 'marina@empresa.com',
    corpo: 'Parou hoje.',
    internal: false,
    criadoEm: new Date('2026-08-10T12:05:00Z'),
    excluidoEm: null,
  },
]

const repoLeitura: TicketRepository = {
  async criarComAuditoria(): Promise<Ticket> {
    throw new Error('a tool de leitura nao deve escrever')
  },
  async buscarPorNumero(numero) {
    return numero === chamado.number
      ? embrulharBruto({ ticket: chamado, comentarios: thread })
      : null
  },
  async excluirComAuditoria() {
    throw new Error('esta suite nao exclui')
  },
  async criarComentarioComAuditoria() {
    throw new Error('esta suite nao comenta')
  },
  async mudarStatusComAuditoria() {
    throw new Error('esta suite nao muda Status')
  },
  async atribuirComAuditoria() {
    throw new Error('esta suite nao atribui')
  },
  async mudarPrioridadeComAuditoria() {
    throw new Error('esta suite nao muda Prioridade')
  },
  async buscarIntakePorMessageId() {
    throw new Error('esta suite nao faz intake por e-mail')
  },
  async executarAcaoIrreversivelComAuditoria() {
    throw new Error('esta suite nao executa Acao irreversivel')
  },
  async buscarParaExportarBruto() {
    throw new Error('esta suite nao exporta')
  },
  async buscarParecidosBruto() {
    throw new Error('esta suite nao sugere parecidos')
  },
  async buscarResumoBruto() {
    throw new Error('esta suite nao le o resumo')
  },
  async buscarFilaBruta() {
    throw new Error('esta suite nao le a Fila')
  },
  async buscarHistoricoBruto() {
    throw new Error('esta suite nao le historico')
  },
}

const depsLeitura = {
  repositorio: repoLeitura,
  identidades,
  confirmacao,
  autenticar,
  limitarChamadas: semLimite,
}

it('registra a tool ver_chamado com o schema do contrato (AD-6)', () => {
  const schema = criarServidorMcp(deps).toolInputSchemaJson('ver_chamado')
  expect(schema).toBeDefined()
  expect(JSON.stringify(schema)).toContain('numero')
})

it('retorna o Chamado com a thread no structuredContent', async () => {
  const resultado = await criarHandlerVerChamado(depsLeitura)({ numero: 1042 })

  expect(resultado.isError).toBeUndefined()
  expect(resultado.structuredContent).toMatchObject({
    number: 1042,
    titulo: 'Notebook nao liga',
    criadoEm: '2026-08-10T12:00:00.000Z',
  })
  expect(resultado.content[0]?.text).toContain('#1042')
})

/**
 * Mesmo shape de erro da Story 1.1: `[code] mensagem` com `isError`. Se cada
 * tool inventasse o proprio formato, a IA teria que aprender um por tool.
 */
it('traduz Chamado inexistente em erro de tool com o mesmo shape da 1.1', async () => {
  const resultado = await criarHandlerVerChamado(depsLeitura)({ numero: 9999 })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('TicketNaoEncontrado')
  expect(resultado.structuredContent).toBeUndefined()
})

/**
 * `origin` NAO e observavel numa leitura — nao ha auditoria para inspecionar
 * (FR-13). O que da para provar aqui e que a IDENTIDADE do principal chega ao
 * dominio, e a prova e o comportamento: a mesma consulta muda de resultado
 * conforme quem pergunta. Se o adapter usasse uma identidade fixa, os dois
 * casos abaixo dariam a mesma coisa.
 */
it('entrega ao dominio a identidade de quem pergunta, nao uma fixa', async () => {
  const comoDona = await criarHandlerVerChamado({
    repositorio: repoLeitura,
    identidades,
    confirmacao,
    autenticar: async () => ({ identity: 'marina@empresa.com', role: 'solicitante' }) as const,
    limitarChamadas: semLimite,
  })({ numero: 1042 })

  const comoTerceiro = await criarHandlerVerChamado({
    repositorio: repoLeitura,
    identidades,
    confirmacao,
    autenticar: async () => ({ identity: 'carlos@empresa.com', role: 'solicitante' }) as const,
    limitarChamadas: semLimite,
  })({ numero: 1042 })

  expect(comoDona.isError).toBeUndefined()
  expect(comoTerceiro.isError).toBe(true)
  expect(comoTerceiro.content[0]?.text).toContain('TicketNaoEncontrado')
})

// --- Story 1.3: o principal passa a vir da autenticacao ---

const credencialRuim = async (): Promise<{ identity: string; role: 'agente' }> => {
  throw new DomainError('CredencialInvalida', 'Credencial invalida.')
}

it('recusa a escrita quando a credencial nao resolve, sem tocar no repositorio', async () => {
  registradas.length = 0

  const resultado = await criarHandlerAbrirChamado({
    repositorio,
    identidades,
    confirmacao,
    autenticar: credencialRuim,
    limitarChamadas: semLimite,
  })(input)

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('CredencialInvalida')
  // Credencial ruim tem que parar ANTES do caso de uso: um Chamado criado com
  // autor indefinido violaria o AD-3 e ainda ficaria no banco.
  expect(registradas).toHaveLength(0)
})

it('recusa a leitura quando a credencial nao resolve', async () => {
  const resultado = await criarHandlerVerChamado({
    repositorio: repoLeitura,
    identidades,
    confirmacao,
    autenticar: credencialRuim,
    limitarChamadas: semLimite,
  })({ numero: 1042 })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('CredencialInvalida')
  expect(resultado.structuredContent).toBeUndefined()
})

it('resolve a credencial a CADA chamada, nao uma vez na montagem', async () => {
  let chamadas = 0
  const expiraNaSegunda = async () => {
    chamadas += 1
    if (chamadas > 1) {
      throw new DomainError('CredencialInvalida', 'Credencial invalida.')
    }
    return principal
  }

  const handler = criarHandlerVerChamado({
    repositorio: repoLeitura,
    identidades,
    confirmacao,
    autenticar: expiraNaSegunda,
    limitarChamadas: semLimite,
  })

  const primeira = await handler({ numero: 1042 })
  const segunda = await handler({ numero: 1042 })

  // Resolver uma vez so deixaria a sessao valer para sempre depois de aberta:
  // expiracao de 8 horas nao teria efeito nenhum sobre uma conexao MCP longa.
  expect(primeira.isError).toBeUndefined()
  expect(segunda.isError).toBe(true)
})

it('deixa erro nao-tipado da leitura subir (pilar Observavel)', async () => {
  const quebrado: TicketRepository = {
    async criarComAuditoria(): Promise<Ticket> {
      throw new Error('nao usado')
    },
    async buscarPorNumero() {
      throw new Error('conexao perdida')
    },
    async excluirComAuditoria() {
      throw new Error('esta suite nao exclui')
    },
    async criarComentarioComAuditoria() {
      throw new Error('esta suite nao comenta')
    },
    async mudarStatusComAuditoria() {
      throw new Error('esta suite nao muda Status')
    },
    async atribuirComAuditoria() {
      throw new Error('esta suite nao atribui')
    },
    async mudarPrioridadeComAuditoria() {
      throw new Error('esta suite nao muda Prioridade')
    },
    async buscarIntakePorMessageId() {
      throw new Error('esta suite nao faz intake por e-mail')
    },
    async executarAcaoIrreversivelComAuditoria() {
      throw new Error('esta suite nao executa Acao irreversivel')
    },
    async buscarParaExportarBruto() {
      throw new Error('esta suite nao exporta')
    },
    async buscarParecidosBruto() {
      throw new Error('esta suite nao sugere parecidos')
    },
    async buscarResumoBruto() {
      throw new Error('esta suite nao le o resumo')
    },
    async buscarFilaBruta() {
      throw new Error('esta suite nao le a Fila')
    },
    async buscarHistoricoBruto() {
      throw new Error('esta suite nao le historico')
    },
  }
  await expect(
    criarHandlerVerChamado({
      repositorio: quebrado,
      identidades,
      confirmacao,
      autenticar,
      limitarChamadas: semLimite,
    })({
      numero: 1042,
    }),
  ).rejects.toThrowError('conexao perdida')
})

// --- Story 1.5: rate limit por identidade ---

const estourado = async (): Promise<void> => {
  throw new DomainError(
    'LimiteExcedido',
    'Limite de 60 chamadas por minuto atingido. Tente novamente a partir de 2026-08-10T12:01:00.000Z.',
  )
}

it('recusa a escrita quando o limite estourou, sem tocar no repositorio', async () => {
  registradas.length = 0

  const resultado = await criarHandlerAbrirChamado({
    repositorio,
    identidades,
    confirmacao,
    autenticar,
    limitarChamadas: estourado,
  })(input)

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('LimiteExcedido')
  // Contar depois de escrever deixaria a IA em loop gravar tudo antes de ser
  // barrada — o limite serviria para nada.
  expect(registradas).toHaveLength(0)
})

it('recusa a leitura quando o limite estourou', async () => {
  const resultado = await criarHandlerVerChamado({
    repositorio: repoLeitura,
    identidades,
    confirmacao,
    autenticar,
    limitarChamadas: estourado,
  })({ numero: 1042 })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('LimiteExcedido')
  expect(resultado.structuredContent).toBeUndefined()
})

it('o erro de limite diz quando tentar de novo, e nao se confunde com credencial', async () => {
  const resultado = await criarHandlerVerChamado({
    repositorio: repoLeitura,
    identidades,
    confirmacao,
    autenticar,
    limitarChamadas: estourado,
  })({ numero: 1042 })

  const texto = resultado.content[0]?.text ?? ''
  expect(texto).not.toContain('CredencialInvalida')
  expect(texto).toContain('12:01:00')
})

it('conta pela IDENTIDADE autenticada, nao pelo nome da tool (FR-21, AD-9)', async () => {
  const contados: string[] = []

  await criarHandlerVerChamado({
    repositorio: repoLeitura,
    identidades,
    confirmacao,
    autenticar,
    limitarChamadas: limitadosPor(contados),
  })({ numero: 1042 })

  expect(contados).toEqual(['bruno@empresa.com'])
  expect(contados[0]).not.toContain('ver_chamado')
})

it('credencial invalida nao consome quota', async () => {
  const contados: string[] = []

  await criarHandlerVerChamado({
    repositorio: repoLeitura,
    identidades,
    confirmacao,
    autenticar: credencialRuim,
    limitarChamadas: limitadosPor(contados),
  })({ numero: 1042 })

  // Consequencia de limitar por identidade: sem identidade, nao ha o que
  // contar. Registrado no Dev Agent Record — contra 256 bits de entropia, forca
  // bruta de token e irrelevante.
  expect(contados).toHaveLength(0)
})

// --- Story 2.1: tool de Comentario ---

const comentados: { numero: number; novo: NovoComentario; autor: Principal }[] = []

const repoComentario: TicketRepository = {
  ...repositorio,
  async buscarPorNumero() {
    return embrulharBruto({
      ticket: {
        number: 1042,
        titulo: 'VPN fora do ar',
        descricao: 'Nao conecta.',
        categoria: 'rede',
        status: 'aberto',
        prioridade: 'media',
        requester: 'marina@empresa.com',
        assignee: null,
        criadoEm: new Date('2026-08-11T12:00:00.000Z'),
        excluidoEm: null,
        version: 1,
      },
      comentarios: [],
    })
  },
  async criarComentarioComAuditoria(numero, novo, autor) {
    comentados.push({ numero, novo, autor })
    return { criadoEm: new Date('2026-08-11T13:00:00.000Z') }
  },
}

const depsComentario = {
  repositorio: repoComentario,
  identidades,
  confirmacao,
  autenticar,
  limitarChamadas: semLimite,
}

it('registra a tool comentar_chamado com o schema do contrato (AD-6)', () => {
  const schema = criarServidorMcp(depsComentario).toolInputSchemaJson('comentar_chamado')

  expect(schema).toBeDefined()
  expect(JSON.stringify(schema)).toContain('interno')
})

it('comenta e devolve o resultado estruturado', async () => {
  comentados.length = 0

  const resultado = await criarHandlerComentarChamado(depsComentario)({
    numero: 1042,
    texto: 'Reiniciei o concentrador',
  })

  expect(resultado.isError).toBeUndefined()
  expect(resultado.structuredContent).toMatchObject({ numero: 1042, interno: false })
})

/**
 * O default de `interno` e a decisao de seguranca do contrato: quem nao pediu
 * Comentario Interno nao pode criar um por acidente. Sem o `?? false` no
 * handler, o valor chegaria `undefined` ao dominio.
 */
it('sem o campo interno, o Comentario nasce PUBLICO', async () => {
  comentados.length = 0

  await criarHandlerComentarChamado(depsComentario)({ numero: 1042, texto: 'x' })

  expect(comentados[0]?.novo.internal).toBe(false)
})

it('carimba origin mcp no autor da escrita (AD-9)', async () => {
  comentados.length = 0

  await criarHandlerComentarChamado(depsComentario)({ numero: 1042, texto: 'x' })

  expect(comentados[0]?.autor.origin).toBe('mcp')
  expect(comentados[0]?.novo.autor).toBe('bruno@empresa.com')
})

it('traduz erro de dominio em erro de tool', async () => {
  const resultado = await criarHandlerComentarChamado(depsComentario)({
    numero: 1042,
    texto: '   ',
  })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('CorpoObrigatorio')
})

/**
 * O esquecimento provavel do Epic 2: seis handlers novos, seis chances de
 * omitir `limitarChamadas` copiando e colando. Sem este teste, a tool nasceria
 * fora do FR-21 e ninguem notaria.
 */
it('recusa a escrita quando o limite estourou, sem tocar no repositorio', async () => {
  comentados.length = 0

  const resultado = await criarHandlerComentarChamado({
    repositorio: repoComentario,
    identidades,
    confirmacao,
    autenticar,
    limitarChamadas: estourado,
  })({ numero: 1042, texto: 'x' })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('LimiteExcedido')
  expect(comentados).toHaveLength(0)
})

it('conta o Comentario pela identidade autenticada (FR-21)', async () => {
  const contados: string[] = []

  await criarHandlerComentarChamado({
    repositorio: repoComentario,
    identidades,
    confirmacao,
    autenticar,
    limitarChamadas: limitadosPor(contados),
  })({ numero: 1042, texto: 'x' })

  expect(contados).toEqual(['bruno@empresa.com'])
})

/**
 * Erro que NAO e de dominio sobe sem mascarar. Engolir aqui — devolvendo
 * `isError` com uma mensagem generica — esconderia falha de banco atras de algo
 * que parece recusa de negocio, e e violacao direta do pilar Observavel.
 */
it('erro nao-tipado do repositorio sobe em vez de virar erro de tool', async () => {
  const quebrado: TicketRepository = {
    ...repoComentario,
    async criarComentarioComAuditoria() {
      throw new Error('conexao com o banco caiu')
    },
  }

  await expect(
    criarHandlerComentarChamado({
      repositorio: quebrado,
      identidades,
      confirmacao,
      autenticar,
      limitarChamadas: semLimite,
    })({
      numero: 1042,
      texto: 'x',
    }),
  ).rejects.toThrow('conexao com o banco caiu')
})

// --- Story 2.2: tool de mudanca de Status ---

const mudancasDeStatus: { numero: number; de: string; para: string; esperada: number }[] = []

const repoStatus: TicketRepository = {
  ...repositorio,
  async buscarPorNumero() {
    return embrulharBruto({
      ticket: {
        number: 1042,
        titulo: 'VPN fora do ar',
        descricao: 'Nao conecta.',
        categoria: 'rede',
        status: 'aberto',
        prioridade: 'media',
        requester: 'marina@empresa.com',
        assignee: null,
        criadoEm: new Date('2026-08-11T12:00:00.000Z'),
        excluidoEm: null,
        version: 1,
      },
      comentarios: [],
    })
  },
  async mudarStatusComAuditoria({ numero, de, para, esperada }) {
    mudancasDeStatus.push({ numero, de, para, esperada })
    return { version: esperada + 1 }
  },
}

const depsStatus = {
  repositorio: repoStatus,
  identidades,
  confirmacao,
  autenticar,
  limitarChamadas: semLimite,
}

it('registra a tool mudar_status com o schema do contrato (AD-6)', () => {
  const schema = criarServidorMcp(depsStatus).toolInputSchemaJson('mudar_status')

  expect(schema).toBeDefined()
  // A versao e obrigatoria: sem ela nao ha concorrencia otimista (AD-10).
  expect(JSON.stringify(schema)).toContain('versao')
  expect(JSON.stringify(schema)).toContain('em_andamento')
})

it('muda o Status e devolve a versao nova', async () => {
  mudancasDeStatus.length = 0

  const resultado = await criarHandlerMudarStatus(depsStatus)({
    numero: 1042,
    novoStatus: 'em_andamento',
    versao: 1,
  })

  expect(resultado.isError).toBeUndefined()
  expect(resultado.structuredContent).toEqual({
    numero: 1042,
    de: 'aberto',
    para: 'em_andamento',
    versao: 2,
  })
})

/**
 * A versao nova vai no TEXTO tambem: quem for mudar de novo precisa dela, e
 * sem isso a IA teria que reler o Chamado a cada mutacao.
 */
it('o texto da resposta traz a versao nova', async () => {
  const resultado = await criarHandlerMudarStatus(depsStatus)({
    numero: 1042,
    novoStatus: 'em_andamento',
    versao: 1,
  })

  expect(resultado.content[0]?.text).toContain('versao 2')
})

it('traduz transicao invalida em erro de tool', async () => {
  const resultado = await criarHandlerMudarStatus(depsStatus)({
    numero: 1042,
    novoStatus: 'resolvido',
    versao: 1,
  })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('TransicaoInvalida')
})

/**
 * A porta dos fundos da Story 2.6: a tool generica nao encerra Chamado. Sem
 * este teste, o guardrail do AD-7 nasceria furado no adapter.
 */
it('nao cancela Chamado pela tool generica', async () => {
  mudancasDeStatus.length = 0

  const resultado = await criarHandlerMudarStatus(depsStatus)({
    numero: 1042,
    novoStatus: 'cancelado',
    versao: 1,
  })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('confirmacao')
  expect(mudancasDeStatus).toHaveLength(0)
})

it('recusa a mudanca quando o limite estourou, sem tocar no repositorio', async () => {
  mudancasDeStatus.length = 0

  const resultado = await criarHandlerMudarStatus({
    repositorio: repoStatus,
    identidades,
    confirmacao,
    autenticar,
    limitarChamadas: estourado,
  })({ numero: 1042, novoStatus: 'em_andamento', versao: 1 })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('LimiteExcedido')
  expect(mudancasDeStatus).toHaveLength(0)
})

it('carimba origin mcp na mudanca de Status (AD-9)', async () => {
  const autores: string[] = []

  await criarHandlerMudarStatus({
    repositorio: {
      ...repoStatus,
      async mudarStatusComAuditoria({ autor, esperada }) {
        autores.push(autor.origin)
        return { version: esperada + 1 }
      },
    },
    identidades,
    confirmacao,
    autenticar,
    limitarChamadas: semLimite,
  })({ numero: 1042, novoStatus: 'em_andamento', versao: 1 })

  expect(autores).toEqual(['mcp'])
})

it('erro nao-tipado sobe em vez de virar erro de tool', async () => {
  const quebrado: TicketRepository = {
    ...repoStatus,
    async mudarStatusComAuditoria() {
      throw new Error('conexao com o banco caiu')
    },
  }

  await expect(
    criarHandlerMudarStatus({
      repositorio: quebrado,
      identidades,
      confirmacao,
      autenticar,
      limitarChamadas: semLimite,
    })({
      numero: 1042,
      novoStatus: 'em_andamento',
      versao: 1,
    }),
  ).rejects.toThrow('conexao com o banco caiu')
})

// --- Story 2.3: tool de atribuicao ---

const atribuicoesFeitas: { de: string | null; para: string; esperada: number }[] = []

const repoAtribuicao: TicketRepository = {
  ...repositorio,
  async buscarPorNumero() {
    return embrulharBruto({
      ticket: {
        number: 1042,
        titulo: 'VPN fora do ar',
        descricao: 'Nao conecta.',
        categoria: 'rede',
        status: 'aberto',
        prioridade: 'media',
        requester: 'marina@empresa.com',
        assignee: null,
        criadoEm: new Date('2026-08-11T12:00:00.000Z'),
        excluidoEm: null,
        version: 1,
      },
      comentarios: [],
    })
  },
  async atribuirComAuditoria({ de, para, esperada }) {
    atribuicoesFeitas.push({ de, para, esperada })
    return { version: esperada + 1 }
  },
}

const depsAtribuicao = {
  repositorio: repoAtribuicao,
  identidades,
  confirmacao,
  autenticar,
  limitarChamadas: semLimite,
}

it('registra a tool atribuir_chamado com o schema do contrato (AD-6)', () => {
  const schema = criarServidorMcp(depsAtribuicao).toolInputSchemaJson('atribuir_chamado')

  expect(schema).toBeDefined()
  expect(JSON.stringify(schema)).toContain('versao')
  expect(JSON.stringify(schema)).toContain('agente')
})

it('atribui e devolve o resultado estruturado', async () => {
  atribuicoesFeitas.length = 0

  const resultado = await criarHandlerAtribuirChamado(depsAtribuicao)({
    numero: 1042,
    versao: 1,
    agente: 'ana@empresa.com',
  })

  expect(resultado.isError).toBeUndefined()
  expect(resultado.structuredContent).toEqual({
    numero: 1042,
    de: null,
    para: 'ana@empresa.com',
    versao: 2,
  })
})

/** Omitir `agente` e self-assign — o campo ausente ja diz "para mim". */
it('sem o campo agente, atribui a quem chamou', async () => {
  atribuicoesFeitas.length = 0

  await criarHandlerAtribuirChamado(depsAtribuicao)({ numero: 1042, versao: 1 })

  expect(atribuicoesFeitas[0]?.para).toBe('bruno@empresa.com')
})

it('traduz destinatario invalido em erro de tool', async () => {
  const resultado = await criarHandlerAtribuirChamado(depsAtribuicao)({
    numero: 1042,
    versao: 1,
    agente: 'marina@empresa.com',
  })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('AtribuicaoInvalida')
})

it('recusa a atribuicao quando o limite estourou, sem tocar no repositorio', async () => {
  atribuicoesFeitas.length = 0

  const resultado = await criarHandlerAtribuirChamado({
    repositorio: repoAtribuicao,
    identidades,
    confirmacao,
    autenticar,
    limitarChamadas: estourado,
  })({ numero: 1042, versao: 1, agente: 'ana@empresa.com' })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('LimiteExcedido')
  expect(atribuicoesFeitas).toHaveLength(0)
})

it('erro nao-tipado sobe em vez de virar erro de tool', async () => {
  const quebrado: TicketRepository = {
    ...repoAtribuicao,
    async atribuirComAuditoria() {
      throw new Error('conexao com o banco caiu')
    },
  }

  await expect(
    criarHandlerAtribuirChamado({
      repositorio: quebrado,
      identidades,
      confirmacao,
      autenticar,
      limitarChamadas: semLimite,
    })({ numero: 1042, versao: 1, agente: 'ana@empresa.com' }),
  ).rejects.toThrow('conexao com o banco caiu')
})

// --- Story 2.4: tool de Prioridade ---

const prioridadesMudadas: { de: string; para: string; esperada: number }[] = []

const repoPrioridade: TicketRepository = {
  ...repositorio,
  async buscarPorNumero() {
    return embrulharBruto({
      ticket: {
        number: 1042,
        titulo: 'VPN fora do ar',
        descricao: 'Nao conecta.',
        categoria: 'rede',
        prioridade: 'media',
        status: 'aberto',
        requester: 'marina@empresa.com',
        assignee: null,
        criadoEm: new Date('2026-08-11T12:00:00.000Z'),
        excluidoEm: null,
        version: 1,
      },
      comentarios: [],
    })
  },
  async mudarPrioridadeComAuditoria({ de, para, esperada }) {
    prioridadesMudadas.push({ de, para, esperada })
    return { version: esperada + 1 }
  },
}

const depsPrioridade = {
  repositorio: repoPrioridade,
  identidades,
  confirmacao,
  autenticar,
  limitarChamadas: semLimite,
}

it('registra a tool mudar_prioridade com o schema do contrato (AD-6)', () => {
  const schema = criarServidorMcp(depsPrioridade).toolInputSchemaJson('mudar_prioridade')

  expect(schema).toBeDefined()
  expect(JSON.stringify(schema)).toContain('critica')
  expect(JSON.stringify(schema)).toContain('versao')
})

it('muda a prioridade e devolve o resultado estruturado', async () => {
  prioridadesMudadas.length = 0

  const resultado = await criarHandlerMudarPrioridade(depsPrioridade)({
    numero: 1042,
    prioridade: 'critica',
    versao: 1,
  })

  expect(resultado.isError).toBeUndefined()
  expect(resultado.structuredContent).toEqual({
    numero: 1042,
    de: 'media',
    para: 'critica',
    versao: 2,
  })
})

it('traduz prioridade inalterada em erro de tool', async () => {
  const resultado = await criarHandlerMudarPrioridade(depsPrioridade)({
    numero: 1042,
    prioridade: 'media',
    versao: 1,
  })

  expect(resultado.isError).toBe(true)
  expect(resultado.content[0]?.text).toContain('PrioridadeInalterada')
})

it('recusa a mudanca de prioridade quando o limite estourou', async () => {
  prioridadesMudadas.length = 0

  const resultado = await criarHandlerMudarPrioridade({
    repositorio: repoPrioridade,
    identidades,
    confirmacao,
    autenticar,
    limitarChamadas: estourado,
  })({ numero: 1042, prioridade: 'alta', versao: 1 })

  expect(resultado.isError).toBe(true)
  expect(prioridadesMudadas).toHaveLength(0)
})
