/**
 * De onde a acao veio (AD-9).
 *
 * Vive no dominio porque e ela que o Log de auditoria usa para distinguir
 * "humano via IA" de chamada direta da API — uma distincao de negocio, nao de
 * transporte. O contrato Zod em `application` deriva desta lista, como
 * `papelSchema` deriva de `PAPEIS`.
 */
export const ORIGENS = ['api', 'mcp'] as const
export type Origem = (typeof ORIGENS)[number]
