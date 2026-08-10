import { simpleParser } from 'mailparser'
import {
  type MensagemRecebida,
  mensagemRecebidaSchema,
  type ResultadoDeAutenticacao,
} from '../../application/contracts/intake-de-email.js'

/**
 * RFC 5322 bruto -> `MensagemRecebida` (Story 1.9).
 *
 * Interpretar e-mail e trabalho de biblioteca: cabecalho dobrado, palavras
 * codificadas em RFC 2047, multipart, charset, transfer-encoding. Escrever
 * isso a mao e uma fonte classica de bug de seguranca. `mailparser` e do mesmo
 * autor do Nodemailer, que a Story 1.6 ja trouxe.
 *
 * O adapter NAO decide nada sobre o Chamado: ele traduz. A unica coisa que
 * conclui e o veredito de autenticidade — e mesmo esse ele nao calcula, apenas
 * le o que o servidor de recepcao ja concluiu.
 */

/**
 * Le `Authentication-Results` (RFC 8601).
 *
 * O ServiceDesk nao valida SPF/DKIM por conta propria — o MTA corporativo ja
 * fez isso. Aqui so se interpreta o veredito.
 *
 * Duas decisoes de seguranca moram nesta funcao:
 *
 * 1. **So o PRIMEIRO cabecalho vale.** Qualquer pessoa pode incluir um
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
 */
export const interpretarAutenticacao = (cabecalho: string | undefined): ResultadoDeAutenticacao => {
  if (cabecalho === undefined || cabecalho.trim().length === 0) {
    // Ausencia nao e permissao: um relay que nao avalia autenticidade nao e
    // base para confiar em identidade.
    return 'ausente'
  }

  const texto = cabecalho.toLowerCase()
  const passou = (metodo: string): boolean => new RegExp(`\\b${metodo}\\s*=\\s*pass\\b`).test(texto)

  return passou('dmarc') || passou('dkim') ? 'aprovada' : 'reprovada'
}

/**
 * O `mailparser` devolve o valor de um cabecalho repetido como array. Só o
 * primeiro interessa (ver acima), e ele e o ultimo a ter sido adicionado.
 */
const primeiroCabecalho = (valor: unknown): string | undefined => {
  if (typeof valor === 'string') return valor
  if (Array.isArray(valor) && typeof valor[0] === 'string') return valor[0]
  return undefined
}

export const analisarMensagem = async (bruto: string): Promise<MensagemRecebida> => {
  const analisada = await simpleParser(bruto)

  const remetente = analisada.from?.value[0]?.address ?? ''

  return mensagemRecebidaSchema.parse({
    // `Message-ID` e opcional no RFC: ausencia vira `null`, nunca `''`.
    messageId: analisada.messageId ?? null,
    de: remetente,
    assunto: analisada.subject ?? '',
    // So o texto puro. Quando a mensagem e so-HTML, `text` nao existe e o
    // corpo fica vazio — o caso de uso trata isso com a regra do corpo vazio.
    // Jogar HTML cru na Descricao faria o Agente ler marcacao em vez do relato.
    corpo: analisada.text ?? '',
    autenticacao: interpretarAutenticacao(
      primeiroCabecalho(analisada.headers.get('authentication-results')),
    ),
  })
}
