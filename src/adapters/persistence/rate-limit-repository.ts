import { sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { rateLimit } from '../../../drizzle/schema.js'
import type { RateLimitRepository } from '../../application/ports/rate-limit-repository.js'

/**
 * Driven adapter do contador de chamadas (Story 1.5).
 *
 * O adapter conta; quem sabe qual e o teto e `platform/limites`.
 */
export const criarRateLimitRepository = (db: PostgresJsDatabase): RateLimitRepository => ({
  /**
   * Incremento atomico: `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
   * resolve ler-e-somar em UMA operacao, sob o lock da propria linha.
   *
   * `SELECT` seguido de `UPDATE` deixaria duas chamadas simultaneas lerem o
   * mesmo valor e gravarem o mesmo incremento — uma delas some. O efeito e
   * perverso: o limite passa a ser mais frouxo exatamente sob concorrencia,
   * que e quando ele existe para agir. E a mesma razao pela qual o consumo do
   * link de login (Story 1.3) e um UPDATE unico.
   *
   * `excluded` e a linha que o INSERT tentou gravar; somar sobre a coluna da
   * TABELA (`rate_limit.chamadas`) e o que garante que o valor de partida e o
   * que ja estava la, e nao o `1` que veio junto.
   */
  async registrarChamada(identity, janela) {
    const [linha] = await db
      .insert(rateLimit)
      .values({ identity, janela, chamadas: 1 })
      .onConflictDoUpdate({
        target: [rateLimit.identity, rateLimit.janela],
        set: { chamadas: sql`${rateLimit.chamadas} + 1` },
      })
      .returning({ chamadas: rateLimit.chamadas })

    if (linha === undefined) {
      // Sem isto, uma falha do UPSERT viraria "zero chamadas" e o limite
      // simplesmente pararia de existir, em silencio.
      throw new Error('UPSERT do contador de rate limit nao retornou linha.')
    }

    return linha.chamadas
  },
})
