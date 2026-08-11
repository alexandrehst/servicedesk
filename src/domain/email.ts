/**
 * Identidade por e-mail (Story 1.9).
 *
 * Vive no dominio porque "duas grafias do mesmo endereco sao a MESMA pessoa" e
 * uma decisao de negocio, nao um detalhe de transporte. Ate a Story 1.8 a
 * normalizacao era uma funcao privada de `platform/auth`, e o comentario de la
 * ja avisava o risco: "se o adapter tambem normalizasse, os dois poderiam
 * divergir e a mesma pessoa viraria duas identidades".
 *
 * A Story 1.9 trouxe o segundo canal de identidade — o remetente de um e-mail
 * — e transformou o risco em certeza. Mesmo movimento que a 1.8 fez com
 * `ORIGENS`: conceito duplicado sobe para o dominio e as bordas derivam.
 */
export const normalizarEmail = (email: string): string => email.trim().toLowerCase()
