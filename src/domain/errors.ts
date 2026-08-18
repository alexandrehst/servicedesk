/**
 * Erros de dominio tipados.
 *
 * O shape do erro NASCE aqui (Consistency Conventions da spine): o adapter
 * HTTP mapeia para status HTTP e o adapter MCP para erro de tool, mas nenhum
 * dos dois inventa formato proprio. Assim os dois pontos de entrada nao
 * divergem no que reportam.
 */

export type DomainErrorCode =
  | 'TituloObrigatorio'
  | 'DescricaoObrigatoria'
  | 'CategoriaInvalida'
  | 'TicketNaoEncontrado'
  // Credencial ausente, malformada, expirada, ja usada ou inexistente — um
  // codigo so, deliberadamente (Story 1.3). A spine cita `Unauthorized` entre
  // os erros de dominio tipados, entao o shape continua nascendo aqui em vez
  // de o modulo de auth inventar uma classe paralela.
  | 'CredencialInvalida'
  // Rate limit estourado (Story 1.5). DISTINTO de `CredencialInvalida` de
  // proposito: quem bate no limite ja provou quem e, e precisa saber que
  // adianta tentar de novo — confundir os dois faria reemitir um token bom.
  | 'LimiteExcedido'
  // Story 1.7: quem VE o Chamado mas nao pode agir sobre ele. Distinto de
  // `TicketNaoEncontrado` de proposito — quem ja enxerga o Chamado nao ganha
  // protecao nenhuma com "nao encontrado", so confusao.
  | 'SemPermissao'
  // Story 1.9: a mesma mensagem de e-mail chegou duas vezes ao mesmo tempo, e
  // o UNIQUE de `email_intake` reprovou a segunda. NAO e falha — e a garantia
  // funcionando. Quem chama traduz para "duplicado" e aponta o Chamado que ja
  // existe; nada disso chega ao remetente.
  | 'MensagemJaProcessada'
  // Story 2.1: Comentario sem corpo. Mesma familia de `TituloObrigatorio` e
  // `DescricaoObrigatoria` — o dominio recusa o vazio antes de qualquer I/O.
  | 'CorpoObrigatorio'
  // Story 2.2: a maquina de estados do AD-5 recusou o destino pedido.
  | 'TransicaoInvalida'
  // Story 2.2: concorrencia otimista (AD-10). Alguem mudou o Chamado entre a
  // leitura e a escrita — DISTINTO de `TicketNaoEncontrado`, porque quem bateu
  // num conflito pode reler e tentar de novo, e quem bateu num Chamado que
  // sumiu nao pode.
  | 'Conflict'
  // Story 2.3: o destinatario da atribuicao nao serve — nao esta no cadastro,
  // nao e Agente, ou ja e o Dono atual. UM codigo para os tres: distinguir
  // "nao cadastrado" de "nao e Agente" transformaria a tool num verificador de
  // quem trabalha na empresa (raciocinio da resposta cega da 1.3).
  | 'AtribuicaoInvalida'
  // Story 2.4: pedir a prioridade que o Chamado ja tem. Nao e falha de
  // permissao nem valor invalido — e uma mudanca que nao muda nada, e aceita-la
  // encheria o Log de evento que nao aconteceu.
  | 'PrioridadeInalterada'
  // Story 2.6: a Acao irreversivel foi pedida sem confirmacao valida (AD-7,
  // FR-15, FR-17). UM codigo para os quatro casos — nao mandou nada, token de
  // outra acao, expirado, ja usado — pela mesma razao da resposta cega da 1.3:
  // distinguir "expirou" de "nao existe" so ensina a sondar.
  | 'ConfirmationRequired'
  // Story 2.6: reabrir sem dizer por que. FR-7 exige o motivo, e a exigencia
  // vive no dominio (AD-7), nao no schema Zod — senao o adapter HTTP e a UI da
  // Fase 1.5 dependeriam de lembrar dela.
  | 'MotivoObrigatorio'
  // Story 3.2: `recorte` e `dono` juntos na consulta da Fila. Os dois filtram
  // por Dono, e aceitar ambos exigiria escolher um em silencio — quem chamou
  // nao saberia qual filtro foi aplicado.
  | 'RecorteConflitante'
  // Story 3.3: o resumo foi montado com um escopo diferente do que quem
  // pergunta alcanca. Nao e erro do usuario — e defeito de programacao, e
  // falha ALTO de proposito: um resumo montado com escopo largo devolveria
  // numeros da base inteira, e nenhum contador denuncia de quem sao os
  // Chamados que ele contou.
  | 'EscopoDivergente'

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export const ehDomainError = (erro: unknown): erro is DomainError => erro instanceof DomainError
