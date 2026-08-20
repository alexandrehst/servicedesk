/**
 * O ALVO de uma confirmacao (Story 4.3, AD-7).
 *
 * ZERO imports de application, adapters ou platform — nucleo puro.
 *
 * A Story 2.6 escopou o token por `ticket_number + acao + identidade`, e a
 * migration 0010 registrou por que o escopo importa: "sem ela, uma confirmacao
 * de 'cancelar #1042' fecharia #1042".
 *
 * Esta story expoe exclusao de Comentario e de Usuario, e nenhum dos dois e um
 * Chamado. O escopo vira um alvo TEXTUAL, e continua amarrando o objeto exato:
 * um token de "excluir usuario X" que servisse para o Y seria pior que nao ter
 * token — daria a impressao de guardrail sem a garantia.
 *
 * Vive no dominio, e nao no adapter, pelo mesmo motivo do AD-7 inteiro: se o
 * formato fosse do adapter, o HTTP poderia montar o alvo de um jeito
 * ligeiramente diferente e um token do MCP deixaria de valer la — ou, pior,
 * passaria a valer para o objeto errado.
 *
 * As funcoes existem para que ninguem escreva o prefixo a mao. Uma string
 * montada com template em cada ponto de chamada e exatamente como dois lugares
 * divergem.
 */
export type AlvoDeConfirmacao = string & { readonly __alvo: unique symbol }

const alvo = (texto: string): AlvoDeConfirmacao => texto as AlvoDeConfirmacao

export const alvoDoChamado = (numero: number): AlvoDeConfirmacao => alvo(`chamado:${numero}`)

/**
 * O Comentario carrega o Chamado no alvo de proposito.
 *
 * `comentario:7` bastaria para identificar a linha — e e justamente por isso
 * que nao basta: o command exige `numero` E `id` (senao um id de outro Chamado
 * passa pelo gargalo de visibilidade), entao o token precisa amarrar o mesmo
 * par. Um alvo mais frouxo que a autorizacao e um buraco com cara de guardrail.
 */
export const alvoDoComentario = (numeroDoChamado: number, id: number): AlvoDeConfirmacao =>
  alvo(`comentario:${numeroDoChamado}/${id}`)

/**
 * O alvo do Usuario e o e-mail, nao o id da linha.
 *
 * E o que quem confirma le na mensagem: "excluir usuario ana@empresa.com" e
 * verificavel por uma pessoa; "excluir usuario 47" nao e — e o ponto do AD-7 e
 * justamente haver uma pessoa conferindo.
 */
export const alvoDoUsuario = (email: string): AlvoDeConfirmacao => alvo(`usuario:${email}`)
