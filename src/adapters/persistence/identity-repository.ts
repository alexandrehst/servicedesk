import { and, eq, isNull, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { auditEntries, loginLinks, mcpTokens, sessions, users } from '../../../drizzle/schema.js'
import { papelSchema } from '../../application/contracts/principal.js'
import type { IdentityRepository } from '../../application/ports/identity-repository.js'

/**
 * Driven adapter: implementa o port de identidade.
 *
 * O adapter nao decide nada sobre validade — ele guarda, busca e consome. A
 * unica excecao e o uso unico do link, que e uma garantia do BANCO e nao teria
 * como viver em outro lugar (ver `consumirLinkDeLogin`).
 *
 * Nenhum metodo aqui recebe ou devolve token cru: so hash.
 */
export const criarIdentityRepository = (db: PostgresJsDatabase): IdentityRepository => ({
  async excluirUsuarioComAuditoria(email, autor) {
    return db.transaction(async (tx) => {
      const [linha] = await tx
        .update(users)
        .set({ deletedAt: sql`now()` })
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .returning({ email: users.email })

      if (linha === undefined) {
        // Nao havia o que excluir. Sem linha de auditoria, pelo mesmo motivo da
        // exclusao de Chamado (1.7): exclusao que nao aconteceu nao vira Log.
        return false
      }

      await tx.insert(auditEntries).values({
        // NULO: esta acao nao e sobre um Chamado (migration 0014). Inventar um
        // numero aqui faria o historico de algum Chamado mostrar uma exclusao
        // de pessoa que nao tem nada a ver com ele.
        ticketNumber: null,
        acao: 'excluir_usuario',
        // AD-9: quem excluiu.
        autor: autor.identity,
        origin: autor.origin,
        // Quem FOI excluido. Vai em `para` porque o Log ja tem o par de/para
        // para "o que mudou" (2.2), e aqui o que mudou e o estado desta
        // pessoa. Sem isto, o registro diria que alguem excluiu alguem, sem
        // dizer quem — inutil para auditoria.
        de: email,
        para: 'excluido',
      })

      return true
    })
  },

  async buscarUsuarioPorEmail(email) {
    const [linha] = await db
      .select()
      .from(users)
      // Story 4.3: o Usuario excluido e indistinguivel de inexistente, e por
      // isso o filtro esta AQUI e nao em quem chama. Sao quatro caminhos que
      // passam por este metodo — pedir link de login, consumir link, validar
      // destinatario de atribuicao (2.3) e reconhecer remetente no intake
      // (1.9) —, e filtrar em cada um seria a mesma regra em quatro lugares.
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1)

    if (linha === undefined) {
      return null
    }

    // `parse`, nao `as`: aqui o papel decide o que a pessoa enxerga (AD-8).
    // Um valor corrompido na coluna viraria um papel invalido silencioso com
    // cast — e um papel invalido cai no ramo "nao e agente" sem avisar
    // ninguem. Com parse a falha e alta e visivel.
    return { email: linha.email, papel: papelSchema.parse(linha.papel) }
  },

  async criarLinkDeLogin({ email, tokenHash, expiraEm }) {
    await db.insert(loginLinks).values({ email, tokenHash, expiraEm })
  },

  /**
   * Uso unico em UMA operacao: o `WHERE usado_em IS NULL` e avaliado sob o
   * lock da propria linha, entao duas trocas simultaneas do mesmo link so
   * podem produzir um vencedor. Ler-e-depois-marcar deixaria as duas leituras
   * acontecerem antes de qualquer escrita, e as duas passariam.
   *
   * Link expirado tambem e consumido ao ser tentado. E deliberado: ele ja nao
   * valia, e queima-lo nao abre nenhuma porta — enquanto separar "expirado" de
   * "usado" aqui exigiria devolver ao servico a informacao que o AC #4 manda
   * esconder.
   */
  async consumirLinkDeLogin(tokenHash) {
    const [linha] = await db
      .update(loginLinks)
      .set({ usadoEm: sql`now()` })
      .where(and(eq(loginLinks.tokenHash, tokenHash), isNull(loginLinks.usadoEm)))
      .returning()

    if (linha === undefined) {
      return null
    }

    return { email: linha.email, expiraEm: linha.expiraEm }
  },

  async criarSessao({ email, tokenHash, expiraEm }) {
    await db.insert(sessions).values({ email, tokenHash, expiraEm })
  },

  /**
   * INNER JOIN com `users`: o papel devolvido e o ATUAL, e usuario removido do
   * cadastro simplesmente nao casa — a sessao morre junto, sem esperar as 8
   * horas.
   */
  /**
   * Mesmo join da sessao: o papel vem do cadastro no momento da resolucao, e
   * um bot removido de `users` para de resolver mesmo com token valido.
   *
   * Revogacao e expiracao NAO sao filtradas aqui — sao devolvidas para o
   * servico decidir, que e onde o relogio vive (Story 1.3).
   */
  async buscarTokenMcpPorHash(tokenHash) {
    const [linha] = await db
      .select({
        identity: mcpTokens.identity,
        papel: users.papel,
        expiraEm: mcpTokens.expiraEm,
        revogadoEm: mcpTokens.revogadoEm,
      })
      .from(mcpTokens)
      // Story 4.3: o `innerJoin` ja existia para ler o papel; a condicao de
      // vivo entra AQUI, no proprio join, e nao num `if` depois — o agente
      // autonomo age sozinho, e uma checagem que alguem possa esquecer de
      // chamar e pior que nenhuma.
      .innerJoin(users, and(eq(users.email, mcpTokens.identity), isNull(users.deletedAt)))
      .where(eq(mcpTokens.tokenHash, tokenHash))
      .limit(1)

    if (linha === undefined) {
      return null
    }

    return {
      identity: linha.identity,
      papel: papelSchema.parse(linha.papel),
      expiraEm: linha.expiraEm,
      revogadoEm: linha.revogadoEm,
    }
  },

  async buscarSessaoPorHash(tokenHash) {
    const [linha] = await db
      .select({ email: sessions.email, papel: users.papel, expiraEm: sessions.expiraEm })
      .from(sessions)
      // Story 4.3: e por causa desta linha que a exclusao vale IMEDIATAMENTE.
      // A Story 1.3 guardou o papel em `users` e nao em `sessions` exatamente
      // para isso — "para que rebaixamento e remocao valham imediatamente em
      // vez de esperar a sessao expirar". Sem a condicao de vivo, um Agente
      // desligado seguiria operando por ate 8 horas.
      .innerJoin(users, and(eq(users.email, sessions.email), isNull(users.deletedAt)))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1)

    if (linha === undefined) {
      return null
    }

    return { email: linha.email, papel: papelSchema.parse(linha.papel), expiraEm: linha.expiraEm }
  },
})
