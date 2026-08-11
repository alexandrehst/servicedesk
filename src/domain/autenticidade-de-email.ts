/**
 * Em quem acreditar quando a identidade vem de um e-mail (Story 1.9).
 *
 * Vive no DOMINIO pelo mesmo motivo que a autorizacao do AD-8: e uma decisao
 * sobre confianca, nao uma traducao de formato. Enquanto esteve no adapter
 * IMAP, um segundo adapter de entrada — o webhook que a propria story antecipa
 * — teria que redescobrir estas duas regras, e um deslize abriria bypass de
 * autenticidade num canal que o caso de uso trata como fonte de identidade.
 *
 * O adapter entrega os cabecalhos como vieram. Quem decide o que eles
 * significam e este modulo, e ele e o mesmo para todo ponto de entrada.
 */

export const RESULTADOS_DE_AUTENTICACAO = ['aprovada', 'reprovada', 'ausente'] as const
export type ResultadoDeAutenticacao = (typeof RESULTADOS_DE_AUTENTICACAO)[number]

/**
 * Avalia os cabecalhos `Authentication-Results` (RFC 8601) de uma mensagem.
 *
 * O ServiceDesk nao valida SPF/DKIM por conta propria — isso e um sistema
 * inteiro, e o MTA corporativo ja o fez. Aqui se decide o que fazer com o
 * veredito dele, e sao tres regras:
 *
 * 1. **So o PRIMEIRO cabecalho vale.** Qualquer remetente pode incluir um
 *    `Authentication-Results` na mensagem que envia; o servidor de recepcao
 *    adiciona o dele no topo, porque cabecalhos sao prefixados. Aceitar
 *    "algum cabecalho diz pass" entregaria o intake a quem soubesse escrever
 *    um cabecalho.
 *
 * 2. **`spf=pass` sozinho nao aprova.** SPF valida o envelope (`MAIL FROM`), e
 *    a identidade que o intake usa e o `From` do cabecalho. Sao campos
 *    diferentes e nada obriga que combinem: um dominio com SPF proprio e
 *    valido pode enviar mensagem cujo `From` diga `alguem@empresa.com`. DKIM
 *    assina o cabecalho; DMARC exige o alinhamento entre os dois.
 *
 * 3. **Ausencia e recusa, nao permissao.** Um relay que nao avalia
 *    autenticidade nao e base para confiar em identidade. `ausente` e
 *    distinto de `reprovada` porque as causas pedem acoes opostas — a primeira
 *    e servidor mal configurado, a segunda e ataque provavel — mas as duas
 *    recusam.
 */
export const avaliarAutenticidade = (cabecalhos: readonly string[]): ResultadoDeAutenticacao => {
  const doServidor = cabecalhos[0]

  if (doServidor === undefined || doServidor.trim().length === 0) {
    return 'ausente'
  }

  const texto = doServidor.toLowerCase()
  const passou = (metodo: string): boolean => new RegExp(`\\b${metodo}\\s*=\\s*pass\\b`).test(texto)

  return passou('dmarc') || passou('dkim') ? 'aprovada' : 'reprovada'
}
