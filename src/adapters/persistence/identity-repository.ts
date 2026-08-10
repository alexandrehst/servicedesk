import { and, eq, isNull, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { loginLinks, sessions, users } from '../../../drizzle/schema.js'
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
  async buscarUsuarioPorEmail(email) {
    const [linha] = await db.select().from(users).where(eq(users.email, email)).limit(1)

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
  async buscarSessaoPorHash(tokenHash) {
    const [linha] = await db
      .select({ email: sessions.email, papel: users.papel, expiraEm: sessions.expiraEm })
      .from(sessions)
      .innerJoin(users, eq(users.email, sessions.email))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1)

    if (linha === undefined) {
      return null
    }

    return { email: linha.email, papel: papelSchema.parse(linha.papel), expiraEm: linha.expiraEm }
  },
})
