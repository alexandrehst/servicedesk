import { avaliarAutenticidade } from '../../domain/autenticidade-de-email.js'
import { normalizarEmail } from '../../domain/email.js'
import { ehDomainError } from '../../domain/errors.js'
import type {
  MensagemRecebida,
  MotivoDeRecusa,
  ResultadoDoIntake,
} from '../contracts/intake-de-email.js'
import type { Principal } from '../contracts/principal.js'
import type { IdentityRepository } from '../ports/identity-repository.js'
import type { Logger } from '../ports/logger.js'
import type { TicketRepository } from '../ports/ticket-repository.js'
import type { abrirChamado } from './abrir-chamado.js'

/**
 * Intake por e-mail (Story 1.9, FR-1).
 *
 * Este caso de uso NAO abre Chamado: ele decide se aquela mensagem merece um, e
 * delega a abertura ao command da Story 1.1 (AD-2). Tudo que o Chamado ganha de
 * graca — validacao de dominio, auditoria transacional (AD-3), e-mail de
 * abertura fora da transacao (1.6) — vem de nao haver um segundo caminho de
 * escrita aqui.
 *
 * O que ele faz de proprio e a parte que so existe neste canal: decidir em quem
 * acreditar.
 */
export type IntakeDeEmailDeps = {
  /**
   * `Pick` em vez do port inteiro: este caso de uso consome UMA operacao de
   * cada repositorio, e declarar isso deixa obvio o que ele nao faz — nao cria
   * sessao, nao emite token, nao le Chamado. Tambem dispensa duble de seis
   * metodos no teste para exercitar um.
   */
  readonly identidades: Pick<IdentityRepository, 'buscarUsuarioPorEmail'>
  readonly repositorio: Pick<TicketRepository, 'buscarIntakePorMessageId'>
  /**
   * O command da Story 1.1, ja montado. Injetado em vez de construido aqui
   * para que quem monta a aplicacao decida se ha notificacao — o intake nao
   * precisa saber que existe e-mail de abertura.
   */
  readonly abrir: ReturnType<typeof abrirChamado>
  readonly logger: Logger
}

/** Quando o assunto nao veio. E o que todo cliente de e-mail mostra no lugar. */
const SEM_ASSUNTO = '(sem assunto)'

export const abrirChamadoPorEmail =
  ({ identidades, repositorio, abrir, logger }: IntakeDeEmailDeps) =>
  async (mensagem: MensagemRecebida): Promise<ResultadoDoIntake> => {
    const recusar = (motivo: MotivoDeRecusa): ResultadoDoIntake => {
      // Nada volta para o remetente — nem "voce nao esta cadastrado".
      // Responder a um endereco forjado transforma o suporte em amplificador de
      // spam e confirma a quem sonda que o endereco existe (Story 1.3).
      //
      // Para DENTRO, porem, a recusa e barulhenta: sem registro, um intake
      // quebrado e um intake sem demanda sao indistinguiveis.
      //
      // Assunto e corpo NAO entram no log (AD-9): log nao e copia da caixa de
      // entrada. O remetente entra porque e o que permite agir — reconhecer um
      // padrao de ataque ou perceber que falta cadastrar alguem.
      logger.aviso('intake_de_email_recusado', { motivo, de: mensagem.de })
      return { tipo: 'recusado', motivo }
    }

    // PRIMEIRO de tudo, e a ordem e a regra: o `From` e escrito por quem envia.
    // Checar o cadastro antes disto faria a verificacao existir sem valer nada
    // — bastaria escrever o e-mail de um funcionario para virar ele.
    //
    // Quem avalia e o DOMINIO, a partir dos cabecalhos crus. O adapter nao
    // entrega veredito pronto: se entregasse, um adapter de entrada novo
    // poderia calcula-lo com regra mais fraca e nada aqui perceberia.
    if (avaliarAutenticidade(mensagem.autenticacaoBruta) !== 'aprovada') {
      return recusar('autenticidade')
    }

    // Sem `Message-ID` nao ha deduplicacao possivel, e sem deduplicacao a
    // reentrega — que e comportamento normal de SMTP — abriria o mesmo Chamado
    // varias vezes. Recusar e mais honesto do que inventar um identificador.
    if (mensagem.messageId === null) {
      return recusar('sem_message_id')
    }

    const assunto = mensagem.assunto.trim()
    const corpo = mensagem.corpo.trim()

    if (assunto.length === 0 && corpo.length === 0) {
      return recusar('mensagem_vazia')
    }

    // A identidade vem do CADASTRO, nunca do cabecalho (AD-9). O papel tambem:
    // aceitar papel de fora seria deixar qualquer um se declarar Agente.
    const usuario = await identidades.buscarUsuarioPorEmail(normalizarEmail(mensagem.de))

    if (usuario === null) {
      return recusar('remetente_desconhecido')
    }

    const jaProcessada = await repositorio.buscarIntakePorMessageId(mensagem.messageId)

    if (jaProcessada !== null) {
      return { tipo: 'duplicado', numero: jaProcessada }
    }

    const autor: Principal = {
      identity: usuario.email,
      role: usuario.papel,
      origin: 'email',
    }

    try {
      const { number } = await abrir(
        {
          titulo: assunto.length > 0 ? assunto : SEM_ASSUNTO,
          // Corpo vazio com assunto preenchido: a descricao recebe o assunto.
          // O dominio exige descricao (Story 1.1), e repetir o assunto e
          // preferivel a recusar um Chamado legitimo de quem so escreveu na
          // linha de assunto — comportamento comum em pedido curto.
          descricao: corpo.length > 0 ? corpo : assunto,
          // Ninguem classificou: quem manda e-mail nao escolhe categoria e nao
          // ha formulario para perguntar. A triagem do Epic 3 reclassifica.
          categoria: 'nao_classificado',
        },
        autor,
        { messageId: mensagem.messageId },
      )

      return { tipo: 'aberto', numero: number }
    } catch (erro) {
      // A corrida: a leitura acima nao viu nada porque a outra entrega ainda
      // nao tinha comitado, e o UNIQUE do banco reprovou esta. Nao e falha — e
      // a garantia funcionando, e o desfecho correto e o mesmo da reentrega.
      if (ehDomainError(erro) && erro.code === 'MensagemJaProcessada') {
        const numero = await repositorio.buscarIntakePorMessageId(mensagem.messageId)

        if (numero !== null) {
          return { tipo: 'duplicado', numero }
        }
      }

      // Qualquer outra falha sobe. Transformar erro desconhecido em recusa
      // silenciosa faria a mensagem ser marcada como processada e sumir.
      throw erro
    }
  }
