/**
 * Papeis e o que cada um pode ver (FR-20, AD-8).
 *
 * ZERO imports de application, adapters ou platform — nucleo puro.
 *
 * A razao de existir deste modulo: ate a Story 1.3 a decisao de papel era uma
 * comparacao `role === 'agente'` escrita em cada lugar que precisava dela. Duas
 * ocorrencias ainda dava para acompanhar; o Epic 3 traz fila, busca, resumo e
 * "parecidos", e cada leitura nova seria mais uma chance de escrever a regra
 * de um jeito ligeiramente diferente. Aqui a regra e UMA tabela.
 */

export const PAPEIS = ['solicitante', 'agente'] as const
export type Papel = (typeof PAPEIS)[number]

/**
 * Capacidades sao declaradas pelo que a pessoa VE, nao por nome de tela ou de
 * tool: "ve Comentario Interno" continua valendo quando a interface mudar.
 */
export type Capacidade =
  | 'veChamadoDeTerceiro'
  | 'veComentarioInterno'
  | 'excluiChamado'
  | 'veHistorico'
  | 'comentaInterno'
  | 'mudaStatus'
  | 'atribuiChamado'
  | 'recebeAtribuicao'
  | 'mudaPrioridade'
  | 'fechaOuCancela'
  | 'reabre'
  | 'importa'
  | 'excluiComentario'
  | 'excluiUsuario'

/**
 * Quem pode o quê. `Record<Capacidade, ...>` é deliberado: o TypeScript exige
 * uma linha para **cada** capacidade, então acrescentar uma sem decidir quem a
 * tem é erro de COMPILAÇÃO.
 *
 * A direção importa. Uma tabela `papel -> capacidades` deixaria capacidade nova
 * cair silenciosamente em "ninguém pode" — seguro, mas invisível, e alguém
 * passaria uma tarde descobrindo por que o Agente não consegue agir. Do jeito
 * que está, quem acrescenta a capacidade é obrigado a declarar a política junto.
 *
 * Papel novo em `PAPEIS` que não apareça em nenhuma lista fica sem privilégio
 * algum — o default seguro.
 */
const QUEM_PODE: Record<Capacidade, readonly Papel[]> = {
  // O Agente atende: enxerga Chamado de qualquer Solicitante e le a conversa
  // interna do time (FR-2).
  veChamadoDeTerceiro: ['agente'],
  veComentarioInterno: ['agente'],
  // Excluir e acao de quem atende (FR-23, Story 1.7). O Solicitante nao decide
  // que o proprio Chamado deixa de existir.
  excluiChamado: ['agente'],
  // Ver o Chamado nao basta para ver o Log dele (Story 1.8): o historico expoe
  // identidade de Agentes e o ritmo do time. Nem o dono do Chamado ve.
  veHistorico: ['agente'],
  // Story 2.1: o Solicitante PODE comentar o proprio Chamado — e a unica
  // escrita que ele tem. O que nao pode e criar Comentario INTERNO: a conversa
  // do time nao e dele, mesmo no Chamado dele. Por isso a capacidade e sobre
  // "interno", e nao sobre "comentar": comentar depende de posse, que quem
  // decide e `visivelPara`, nao esta tabela.
  comentaInterno: ['agente'],
  // Story 2.2: mudar Status e ATENDIMENTO. O Solicitante acompanha e comenta o
  // proprio Chamado, mas nao declara que ele esta resolvido — quem faz isso e
  // quem atende (FR-4).
  mudaStatus: ['agente'],
  // Story 2.3: atribuir e distribuir trabalho entre quem atende. O Solicitante
  // nao escolhe quem cuida do Chamado dele (FR-5).
  atribuiChamado: ['agente'],
  // SEPARADA de `atribuiChamado` de proposito: "pode distribuir trabalho" e
  // "pode receber trabalho" sao coisas diferentes, e hoje coincidem so porque
  // ha um papel de atendimento. Um Gestor que distribui sem atender — ou um
  // papel de auditoria que nunca recebe — quebraria a coincidencia, e a
  // reutilizacao da capacidade errada so apareceria como Chamado atribuido a
  // quem nao atende.
  recebeAtribuicao: ['agente'],
  // Story 2.4: prioridade e COMPARATIVA — ordena um Chamado contra os outros,
  // e quem enxerga a fila inteira e quem atende. Um campo de urgencia
  // preenchido por quem abre vira, na pratica, uma coluna onde todo mundo
  // escreve "critica"; o Solicitante tem a Descricao e o Comentario para
  // explicar a urgencia dele.
  mudaPrioridade: ['agente'],
  // Story 2.6: encerrar um Chamado — fechar ou cancelar — e a ultima palavra
  // sobre ele. O Solicitante que quer desistir tem o Comentario (2.1) para
  // dizer isso; quem decide que o trabalho acabou e quem atende (FR-7).
  //
  // As duas acoes compartilham a capacidade porque a pergunta e a MESMA
  // ("pode encerrar este Chamado?"); o que difere e so o estado final.
  fechaOuCancela: ['agente'],
  // SEPARADA de `fechaOuCancela` pelo mesmo motivo que separou
  // `atribuiChamado` de `recebeAtribuicao` na 2.3: "encerrar" e "trazer de
  // volta" sao decisoes diferentes, e hoje coincidem so porque ha um unico
  // papel de atendimento. Um Gestor que reabre sem poder cancelar quebraria a
  // coincidencia, e a capacidade errada so apareceria como Chamado encerrado
  // por quem nao devia.
  reabre: ['agente'],
  // Story 4.2: importar cria Chamados EM NOME DE TERCEIROS — o `requester` vem
  // do arquivo, nao de quem chama. Sem esta capacidade, um Solicitante montaria
  // um CSV e abriria Chamados no nome de quem quisesse, com uma tool so. E a
  // unica escrita do sistema em que o autor e o dono do registro sao
  // deliberadamente pessoas diferentes (AD-9), e por isso ela e a mais restrita.
  importa: ['agente'],
  // Story 4.3: apagar Comentario e apagar CONVERSA — a do time, inclusive.
  // SEPARADA de `excluiChamado` pelo mesmo motivo que separou `atribuiChamado`
  // de `recebeAtribuicao` (2.3) e `fechaOuCancela` de `reabre` (2.6): hoje
  // coincidem porque so ha um papel de atendimento, e a coincidencia esconde
  // que sao decisoes diferentes.
  //
  // O AUTOR nao ganha o direito de apagar o proprio: um Comentario ja lido faz
  // parte do registro do atendimento, e "quem escreveu pode desescrever" e
  // decisao de produto que ninguem tomou.
  excluiComentario: ['agente'],
  // Story 4.3: a acao mais destrutiva do sistema, e a unica que TIRA O ACESSO
  // de uma pessoa. Nada mais aqui faz isso.
  excluiUsuario: ['agente'],
}

export const pode = (papel: Papel, capacidade: Capacidade): boolean => {
  if (!(PAPEIS as readonly string[]).includes(papel)) {
    // So alcancavel com cast — e e assim que aconteceria de verdade: uma linha
    // corrompida em `users`. Falha ALTO de proposito. Um `false` faria a pessoa
    // simplesmente nao ver o que deveria, sem ninguem entender por que.
    throw new Error(`Papel sem politica de autorizacao: ${String(papel)}`)
  }

  return QUEM_PODE[capacidade].includes(papel)
}
