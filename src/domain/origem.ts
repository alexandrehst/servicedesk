/**
 * De onde a acao veio (AD-9).
 *
 * Vive no dominio porque e ela que o Log de auditoria usa para distinguir
 * "humano via IA" de chamada direta da API — uma distincao de negocio, nao de
 * transporte. O contrato Zod em `application` deriva desta lista, como
 * `papelSchema` deriva de `PAPEIS`.
 */
/**
 * `email` entrou na Story 1.9. Deixa-lo como `api` faria o Log afirmar algo
 * falso — e cegaria a revisao da 1.8, que filtra exatamente por este campo:
 * nao haveria como perguntar "o que entrou pelo intake?".
 */
export const ORIGENS = ['api', 'mcp', 'email'] as const
export type Origem = (typeof ORIGENS)[number]
