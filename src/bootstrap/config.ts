import { z } from 'zod'

/**
 * A configuracao, validada na BORDA (Story 5.1).
 *
 * O projeto falha alto quando o estado e impossivel — `pode()` com papel
 * desconhecido lanca, `papelSchema.parse` lanca. A config segue a mesma regra,
 * e por um motivo pratico: uma variavel de ambiente ausente descoberta na
 * primeira chamada de tool e um erro que aparece no meio de uma conversa com a
 * IA, sem contexto nenhum. Aqui ela aparece no boot, com o nome do que falta.
 *
 * **Opcional ausente NAO e silencioso.** Um intake desligado e um intake
 * quebrado se parecem — a Story 1.9 registrou isso ao criar `aviso` no
 * `Logger`: "silencio nao e opcao; uma recusa invisivel faz um intake quebrado
 * parecer um intake sem demanda". Por isso `recursosDesligados` existe: quem
 * monta o servidor registra o que ficou de fora.
 */

const naoVazio = z.string().min(1)

/** Um numero vindo de variavel de ambiente (que e sempre string). */
const inteiroPositivo = z.coerce.number().int().positive()

const smtpSchema = z.object({
  host: naoVazio,
  port: inteiroPositivo,
  user: naoVazio,
  pass: naoVazio,
  remetente: naoVazio,
  /**
   * A base dos links que vao no e-mail. Sem ela o link e inutil — por isso ela
   * pertence a este bloco, e nao e uma variavel solta: SMTP sem `BASE_URL` seria
   * um e-mail que chega e nao leva a lugar nenhum.
   */
  baseUrl: naoVazio,
})

const imapSchema = z.object({
  host: naoVazio,
  port: inteiroPositivo,
  user: naoVazio,
  pass: naoVazio,
  caixa: naoVazio,
})

export type ConfigSmtp = z.infer<typeof smtpSchema>
export type ConfigImap = z.infer<typeof imapSchema>

export type Config = {
  readonly databaseUrl: string
  /**
   * O token de MAQUINA do cliente MCP (Story 1.5). Ele identifica o processo,
   * e nao a pessoa — ver `montar.ts` para a consequencia disso no Log.
   */
  readonly mcpToken: string
  readonly smtp: ConfigSmtp | null
  readonly imap: ConfigImap | null
  readonly intakeIntervaloMs: number
  /**
   * O que ficou desligado por falta de configuracao, em texto. Vai para o log
   * no boot — ver o comentario no topo.
   */
  readonly recursosDesligados: readonly string[]
}

/** 60 s: o intake nao e tempo real, e varrer a caixa custa uma conexao IMAP. */
export const INTAKE_INTERVALO_PADRAO_MS = 60_000

export class ConfigInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ConfigInvalida'
  }
}

/**
 * Um bloco OPCIONAL: ou vem inteiro, ou nao vem.
 *
 * Meio bloco e o caso perigoso — `SMTP_HOST` sem `SMTP_PASS` e alguem que
 * TENTOU configurar e-mail. Trata-lo como "desligado" esconderia o erro de
 * digitacao; trata-lo como erro fatal derrubaria o servidor por causa de um
 * recurso opcional. **Lanca**, porque configuracao pela metade e sempre engano:
 * ninguem preenche metade das credenciais de proposito.
 */
const blocoOpcional = <T>(
  nome: string,
  schema: z.ZodType<T>,
  bruto: Record<string, string | undefined>,
): T | null => {
  const informados = Object.entries(bruto).filter(([, v]) => v !== undefined && v !== '')

  if (informados.length === 0) {
    return null
  }

  const resultado = schema.safeParse(Object.fromEntries(informados))

  if (!resultado.success) {
    // A lista sai dos ISSUES do Zod, e nao de "quais chaves estao vazias".
    //
    // Achado do review no PR #85: campo PRESENTE mas invalido (`SMTP_PORT=abc`)
    // nao aparecia como ausente, e a mensagem saia com a lista vazia —
    // "Configuracao de SMTP incompleta: falta ." O operador via um erro sem
    // pista nenhuma, que e exatamente o que este modulo existe para evitar.
    //
    // Ausente e invalido tambem sao ditos com palavras diferentes: "falta" e
    // "esta invalido" mandam a pessoa fazer coisas diferentes.
    const problemas = resultado.error.issues.map((issue) => {
      const campo = issue.path.join('.')
      const valor = bruto[campo]
      return valor === undefined || valor === '' ? `${campo} (falta)` : `${campo} (invalido)`
    })

    throw new ConfigInvalida(
      `Configuracao de ${nome} incompleta ou invalida: ${problemas.join(', ')}. ` +
        `Preencha tudo corretamente ou remova todas para desligar ${nome}.`,
    )
  }

  return resultado.data
}

/**
 * Os campos que a falha de BOOT leva ao log.
 *
 * Mora aqui, e nao no entrypoint, por um motivo que vale registrar: a exclusao
 * de `servidor-mcp.ts` da cobertura foi justificada com o criterio "o arquivo
 * nao pode conter decisao alguma". O `catch` de boot tinha duas — **e o review
 * do PR #85 apontou que eu tinha violado a propria regra que acabara de
 * escrever.**
 *
 * A correcao certa nao era apagar o ternario para caber na justificativa: seria
 * fazer o codigo servir ao texto. Era mover a decisao para onde ela e testavel,
 * que e o que a exclusao pressupunha desde o inicio.
 *
 * A distincao que ela faz: `configuracao` e erro de OPERADOR — o `stack`
 * rastrearia codigo que esta certo e mandaria quem monitora investigar o lugar
 * errado. `defeito` leva o stack, porque ai o problema e nosso.
 */
export const dadosDaFalhaDeBoot = (erro: unknown): Record<string, string | number> => ({
  causa: erro instanceof Error ? erro.message : String(erro),
  ...(erro instanceof ConfigInvalida
    ? { tipo: 'configuracao' }
    : { tipo: 'defeito', stack: erro instanceof Error ? (erro.stack ?? '') : '' }),
})

export const lerConfig = (ambiente: Record<string, string | undefined>): Config => {
  const obrigatorias = z
    .object({ DATABASE_URL: naoVazio, SERVICEDESK_MCP_TOKEN: naoVazio })
    .safeParse(ambiente)

  if (!obrigatorias.success) {
    const faltando = obrigatorias.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new ConfigInvalida(
      `Faltam variaveis de ambiente obrigatorias: ${faltando}. O servidor nao sobe sem elas.`,
    )
  }

  const smtp = blocoOpcional('SMTP', smtpSchema, {
    host: ambiente.SMTP_HOST,
    port: ambiente.SMTP_PORT,
    user: ambiente.SMTP_USER,
    pass: ambiente.SMTP_PASS,
    remetente: ambiente.EMAIL_REMETENTE,
    baseUrl: ambiente.BASE_URL,
  })

  const imap = blocoOpcional('IMAP', imapSchema, {
    host: ambiente.IMAP_HOST,
    port: ambiente.IMAP_PORT,
    user: ambiente.IMAP_USER,
    pass: ambiente.IMAP_PASS,
    caixa: ambiente.IMAP_CAIXA,
  })

  const intervalo = ambiente.INTAKE_INTERVALO_MS
  const intakeIntervaloMs = (() => {
    if (intervalo === undefined || intervalo === '') {
      return INTAKE_INTERVALO_PADRAO_MS
    }

    const lido = inteiroPositivo.safeParse(intervalo)

    if (!lido.success) {
      // Embrulhado em `ConfigInvalida` como todo o resto deste arquivo — e nao
      // por simetria: o `catch` de boot decide `tipo: 'configuracao'` vs
      // `tipo: 'defeito'` por `instanceof ConfigInvalida`. Um `ZodError` cru
      // cairia no `else` e seria registrado como DEFEITO NOSSO, com stack —
      // mandando quem monitora investigar codigo que esta certo, por causa de
      // um valor que o operador digitou errado. (Achado do review no PR #85.)
      throw new ConfigInvalida(
        `INTAKE_INTERVALO_MS invalido: "${intervalo}". Informe milissegundos, um inteiro maior que zero.`,
      )
    }

    return lido.data
  })()

  return {
    databaseUrl: obrigatorias.data.DATABASE_URL,
    mcpToken: obrigatorias.data.SERVICEDESK_MCP_TOKEN,
    smtp,
    imap,
    intakeIntervaloMs,
    recursosDesligados: [
      ...(smtp === null ? ['e-mail (FR-18): abertura e resolucao nao serao notificadas'] : []),
      ...(imap === null ? ['intake por e-mail (FR-1): a caixa nao sera lida'] : []),
    ],
  }
}
