import type { Categoria, Prioridade, Status } from './ticket.js'
import { ehCategoria, PRIORIDADE_PADRAO, PRIORIDADES, STATUS } from './ticket.js'

/**
 * Uma linha do CSV de migracao, validada (Story 4.2, FR-25).
 *
 * ZERO imports de application, adapters ou platform — nucleo puro.
 *
 * **Esta funcao NAO lanca**, e isso e a decisao central do modulo. `abrirTicket`
 * lanca `DomainError` porque a abertura e um evento unico: ou acontece, ou o
 * usuario corrige. Um import de dez mil linhas e outro caso — a AC exige
 * relatorio sem abortar o lote, e usar excecao para controle de fluxo linha a
 * linha transformaria o caso NORMAL (arquivo com sujeira) em caminho de erro.
 *
 * O `motivo` e texto, e nao codigo: quem o le e uma pessoa conferindo a
 * migracao, com o numero da linha ao lado.
 */
export type ChamadoImportado = {
  readonly numeroLegado: string
  readonly titulo: string
  readonly descricao: string
  readonly categoria: Categoria
  readonly status: Status
  readonly prioridade: Prioridade
  readonly requester: string
  readonly assignee: string | null
  /** Ausente quando o arquivo nao trazia data: quem grava decide o que fazer. */
  readonly criadoEm?: Date
}

export type ResultadoDaLinha =
  | { readonly ok: true; readonly novo: ChamadoImportado }
  | { readonly ok: false; readonly motivo: string }

const texto = (linha: Record<string, string>, campo: string): string => (linha[campo] ?? '').trim()

const recusa = (motivo: string): ResultadoDaLinha => ({ ok: false, motivo })

export const linhaImportada = (linha: Record<string, string>): ResultadoDaLinha => {
  // A chave da idempotencia: sem ela o reimport duplica, e nao ha como
  // distinguir o original da copia.
  const numeroLegado = texto(linha, 'numero_legado')
  if (numeroLegado.length === 0) {
    return recusa('numero_legado vazio: sem ele o reimport duplicaria o Chamado')
  }

  const titulo = texto(linha, 'titulo')
  if (titulo.length === 0) {
    return recusa('titulo vazio')
  }

  const descricao = texto(linha, 'descricao')
  if (descricao.length === 0) {
    return recusa('descricao vazia')
  }

  const requester = texto(linha, 'solicitante')
  if (requester.length === 0) {
    return recusa('solicitante vazio')
  }

  const categoriaBruta = texto(linha, 'categoria')
  // Vazia e INVALIDA sao casos diferentes. Vazia vira `nao_classificado`, que e
  // literalmente "ninguem avaliou" (1.9) e e verdade num import. Invalida
  // RECUSA: cair no default apagaria a informacao de que o sistema antigo tinha
  // uma categoria que este nao conhece — e o relatorio existe para isso
  // aparecer.
  const categoria = categoriaBruta === '' ? 'nao_classificado' : categoriaBruta
  if (!ehCategoria(categoria)) {
    return recusa(`categoria "${categoriaBruta}" nao existe neste sistema`)
  }

  const statusBruto = texto(linha, 'status')
  const status = statusBruto === '' ? 'aberto' : statusBruto
  if (!(STATUS as readonly string[]).includes(status)) {
    return recusa(`status "${statusBruto}" nao existe neste sistema`)
  }

  const prioridadeBruta = texto(linha, 'prioridade')
  const prioridade = prioridadeBruta === '' ? PRIORIDADE_PADRAO : prioridadeBruta
  if (!(PRIORIDADES as readonly string[]).includes(prioridade)) {
    return recusa(`prioridade "${prioridadeBruta}" nao existe neste sistema`)
  }

  const criadoEmBruto = texto(linha, 'criado_em')
  const criadoEm = criadoEmBruto === '' ? undefined : new Date(criadoEmBruto)
  if (criadoEm !== undefined && Number.isNaN(criadoEm.getTime())) {
    // Recusar, e nao usar "agora": uma data errada vira historico errado, e
    // ninguem descobre depois.
    return recusa(`criado_em "${criadoEmBruto}" nao e uma data ISO valida`)
  }

  const dono = texto(linha, 'dono')

  return {
    ok: true,
    novo: {
      numeroLegado,
      titulo,
      descricao,
      categoria,
      status: status as Status,
      prioridade: prioridade as Prioridade,
      // O e-mail do CSV NAO e validado contra `users`: o historico tem Chamado
      // de gente que saiu da empresa, e recusar essas linhas perderia o que a
      // migracao existe para trazer.
      requester,
      assignee: dono === '' ? null : dono,
      ...(criadoEm === undefined ? {} : { criadoEm }),
    },
  }
}
