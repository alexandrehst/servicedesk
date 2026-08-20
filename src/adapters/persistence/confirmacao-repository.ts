import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { auditEntries, confirmacoes } from '../../../drizzle/schema.js'
import type { ConfirmacaoRepository } from '../../application/ports/confirmacao-repository.js'

/**
 * Driven adapter da confirmacao de Acao irreversivel (Story 2.6, AD-7).
 *
 * O banco ve HASH, nunca o token cru (regra da 1.3). E a validade vive no
 * `WHERE`, nao num `if` depois da leitura — e o que torna o consumo atomico.
 */
export const criarConfirmacaoRepository = (db: PostgresJsDatabase): ConfirmacaoRepository => ({
  async criarConfirmacaoComAuditoria({
    alvo,
    ticketNumber,
    acao,
    autor,
    tokenHash,
    expiraEm,
    de,
    para,
  }) {
    await db.transaction(async (tx) => {
      await tx.insert(confirmacoes).values({
        alvo,
        acao,
        identity: autor.identity,
        tokenHash,
        expiraEm,
      })

      // O PEDIDO vai ao Log com o par de/para: e por ele que se ve o intervalo
      // entre pedir e executar. O rotulo e estatico, decidido por qual operacao
      // foi chamada (achado do review no PR #46).
      //
      // Story 4.3: `ticketNumber` e nulo quando a acao nao e sobre um Chamado
      // (excluir Usuario). O alvo esta na tabela de confirmacoes; aqui vale o
      // numero, porque e por ele que o historico de um Chamado e lido.
      await tx.insert(auditEntries).values({
        ticketNumber: ticketNumber ?? null,
        acao: 'solicitar_confirmacao',
        autor: autor.identity,
        origin: autor.origin,
        de,
        para,
      })
    })
  },

  async consumirConfirmacao({ tokenHash, alvo, acao, identity, agora }) {
    const [linha] = await db
      .update(confirmacoes)
      .set({ usadoEm: sql`now()` })
      .where(
        and(
          eq(confirmacoes.tokenHash, tokenHash),
          // O ESCOPO no WHERE: token de outra acao, de outro OBJETO ou de
          // outra identidade simplesmente nao casa. Comparar depois de ler
          // daria o mesmo resultado no caminho feliz e deixaria a janela em
          // que duas chamadas leem antes de qualquer uma marcar.
          eq(confirmacoes.alvo, alvo),
          eq(confirmacoes.acao, acao),
          eq(confirmacoes.identity, identity),
          // Uso unico e prazo, na mesma condicao.
          isNull(confirmacoes.usadoEm),
          gt(confirmacoes.expiraEm, agora),
        ),
      )
      .returning({ id: confirmacoes.id })

    return linha !== undefined
  },
})
