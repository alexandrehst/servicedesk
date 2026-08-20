import { z } from 'zod'

/**
 * AD-6: fonte UNICA dos contratos de exclusao (Story 4.3, FR-23).
 *
 * Tres schemas, e nao um so como em `acao-irreversivel` (2.6): la as tres
 * acoes tinham a MESMA entrada (numero + versao + confirmacao) e o que variava
 * era dado do dominio. Aqui as entradas sao genuinamente diferentes — um
 * Chamado e um numero, um Comentario e um par, um Usuario e um e-mail —, e
 * juntar tres formas num schema com campos opcionais faria o contrato aceitar
 * combinacoes que nao existem.
 *
 * O campo `confirmacao` e opcional nos tres pelo mesmo motivo da 2.6: a
 * ausencia dele E a primeira fase (AD-7). E, como la, ele NAO e um booleano —
 * um `confirmar: true` seria preenchido pela propria IA na tentativa seguinte,
 * que e exatamente o que o AD-7 impede.
 */
const confirmacao = z.string().min(1).optional()

export const excluirChamadoInputSchema = z.object({
  numero: z.number().int().positive(),
  confirmacao,
})

export type ExcluirChamadoInput = z.infer<typeof excluirChamadoInputSchema>

export const excluirChamadoOutputSchema = z.object({
  numero: z.number().int().positive(),
})

export const excluirComentarioInputSchema = z.object({
  numero: z.number().int().positive(),
  /** O `id` vem de `ver_chamado` — nao ha outro caminho para descobri-lo. */
  id: z.number().int().positive(),
  confirmacao,
})

export type ExcluirComentarioInput = z.infer<typeof excluirComentarioInputSchema>

export const excluirComentarioOutputSchema = z.object({
  id: z.number().int().positive(),
})

export const excluirUsuarioInputSchema = z.object({
  email: z.email(),
  confirmacao,
})

export type ExcluirUsuarioInput = z.infer<typeof excluirUsuarioInputSchema>

export const excluirUsuarioOutputSchema = z.object({
  email: z.string(),
  /**
   * Chamados nao encerrados que ficaram sem Dono util. Nada foi redistribuido:
   * escolher o novo Dono e decisao de operacao, e um UPDATE em massa disparado
   * por uma exclusao seria o efeito colateral invisivel que o AD-2 evita.
   */
  chamadosSemDono: z.number().int().min(0),
})
