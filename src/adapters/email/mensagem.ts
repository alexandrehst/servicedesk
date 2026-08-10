import { simpleParser } from 'mailparser'
import {
  type MensagemRecebida,
  mensagemRecebidaSchema,
} from '../../application/contracts/intake-de-email.js'

/**
 * RFC 5322 bruto -> `MensagemRecebida` (Story 1.9).
 *
 * Interpretar e-mail e trabalho de biblioteca: cabecalho dobrado, palavras
 * codificadas em RFC 2047, multipart, charset, transfer-encoding. Escrever
 * isso a mao e uma fonte classica de bug de seguranca. `mailparser` e do mesmo
 * autor do Nodemailer, que a Story 1.6 ja trouxe.
 *
 * O adapter NAO conclui nada: ele traduz. Ate o veredito de autenticidade sai
 * daqui como texto cru — quem decide o que ele significa e
 * `avaliarAutenticidade`, no dominio. Enquanto essa politica morou aqui, um
 * segundo adapter de entrada teria que redescobri-la, e uma versao mais fraca
 * abriria bypass num canal que o caso de uso trata como fonte de identidade.
 */

/**
 * Os cabecalhos `Authentication-Results`, na ORDEM em que vieram.
 *
 * A ordem e a unica coisa que importa preservar aqui, porque a regra "so o
 * primeiro vale" — que e do dominio — depende dela. O `mailparser` devolve
 * valor unico como string e repetidos como array.
 */
const cabecalhosDeAutenticacao = (valor: unknown): readonly string[] => {
  if (typeof valor === 'string') return [valor]
  if (Array.isArray(valor)) return valor.filter((v): v is string => typeof v === 'string')
  return []
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
    autenticacaoBruta: cabecalhosDeAutenticacao(analisada.headers.get('authentication-results')),
  })
}
