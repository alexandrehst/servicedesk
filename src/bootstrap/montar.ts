import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { criarNotificadorPorEmail, transporterSmtp, urlDoChamado } from '../adapters/email/smtp.js'
import type { McpDeps } from '../adapters/mcp/server.js'
import { criarConfirmacaoRepository } from '../adapters/persistence/confirmacao-repository.js'
import { criarIdentityRepository } from '../adapters/persistence/identity-repository.js'
import { criarRateLimitRepository } from '../adapters/persistence/rate-limit-repository.js'
import { criarTicketAccessRepository } from '../adapters/persistence/ticket-access-repository.js'
import { criarTicketRepository } from '../adapters/persistence/ticket-repository.js'
import { criarLinkDeAcesso } from '../platform/acesso/link-de-acesso.js'
import { resolverPrincipalDeTokenMcp } from '../platform/auth/autenticacao.js'
import {
  consumirConfirmacao,
  emitirConfirmacao,
} from '../platform/confirmacao/confirmacao-de-acao.js'
import { criarLimitador } from '../platform/limites/rate-limit.js'
import { criarLogger } from '../platform/logging/logger.js'
import type { Config } from './config.js'

/**
 * A raiz de composicao (Story 5.1).
 *
 * O unico lugar do projeto onde as pecas se encontram. Ate aqui, `criarServidorMcp`
 * so era chamado pelos testes — cada um montando `McpDeps` a mao. Isso nao era
 * descuido: e o que permitiu 973 testes sem nenhum estado global. O que faltava
 * era a montagem de PRODUCAO, e e so isso que este arquivo e.
 *
 * **Zero regra de negocio aqui (AD-1).** Se algo parecer faltar, a fiacao esta
 * errada — nao falta codigo de dominio.
 */
export type Montagem = {
  readonly deps: McpDeps
  /** Para o encerramento limpo: sem isto, cada reinicio deixa conexoes penduradas. */
  readonly fechar: () => Promise<void>
  readonly logger: ReturnType<typeof criarLogger>
  readonly db: ReturnType<typeof drizzle>
}

export const montar = (config: Config): Montagem => {
  const logger = criarLogger()

  // `max: 10` e conservador: um processo stdio serve UM cliente MCP, e as
  // chamadas dele sao sequenciais. O import (4.2) e quem usa concorrencia, com
  // lotes de 8 — o pool precisa comportar o lote mais folga.
  const sqlClient = postgres(config.databaseUrl, { max: 10 })
  const db = drizzle(sqlClient)

  const repositorio = criarTicketRepository(db)
  const identidades = criarIdentityRepository(db)
  const acessos = criarTicketAccessRepository(db)
  const agora = () => new Date()

  return {
    logger,
    db,
    deps: {
      repositorio,
      identidades,
      logger,

      /**
       * Resolvido a CADA chamada, e isso e a decisao central desta story.
       *
       * O tipo de `autenticar` nao recebe parametro e e chamado por tool, com o
       * comentario que explica: "uma conexao MCP dura horas, e resolver uma
       * unica vez faria a sessao de 8 horas valer para sempre depois de
       * aberta". Num transporte stdio nao ha cabecalho — a credencial vem do
       * ambiente —, mas guardar o principal em memoria seria exatamente a
       * sessao eterna que aquele comentario proibe.
       *
       * Indo ao banco toda vez, **revogar o token derruba o acesso na chamada
       * seguinte**, sem reiniciar nada. A Story 4.3 fez o `innerJoin` com
       * `users` justamente para que remocao valesse imediatamente.
       *
       * CONSEQUENCIA REGISTRADA: um processo = uma identidade. Duas pessoas no
       * mesmo servidor stdio agem como o mesmo bot no Log (AD-9). Identidade
       * por pessoa exige transporte com sessao, que e outra story.
       */
      autenticar: () =>
        resolverPrincipalDeTokenMcp({ repositorio: identidades, agora })(config.mcpToken),

      limitarChamadas: criarLimitador({
        repositorio: criarRateLimitRepository(db),
        agora,
      }),

      confirmacao: (() => {
        const deps = { repositorio: criarConfirmacaoRepository(db), agora }
        return {
          emitir: emitirConfirmacao(deps),
          consumir: consumirConfirmacao(deps),
        }
      })(),

      // Sem SMTP, o campo simplesmente nao existe — e os commands ja tratam a
      // ausencia. O que NAO pode acontecer e isso passar despercebido: quem
      // chama `montar` registra `config.recursosDesligados`.
      ...(config.smtp === null
        ? {}
        : {
            notificacao: {
              notificador: criarNotificadorPorEmail({
                transporter: transporterSmtp(config.smtp),
                remetente: config.smtp.remetente,
                baseUrl: config.smtp.baseUrl,
              }),
              criarLink: criarLinkDeAcesso({ repositorio: acessos, agora }),
              montarUrl: (numero: number, token: string) =>
                urlDoChamado((config.smtp as { baseUrl: string }).baseUrl, numero, token),
              logger,
              agora,
            },
          }),
    },
    fechar: () => sqlClient.end(),
  }
}
