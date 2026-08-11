/**
 * Port de log estruturado (Story 1.6).
 *
 * Existe por causa de um caso concreto: o e-mail de abertura e I/O externo e
 * pode falhar, mas a falha nao pode derrubar a abertura do Chamado nem sumir
 * num `catch {}` vazio — engolir erro e violacao direta do pilar Observavel.
 * Sem um canal para reportar, so restariam as duas saidas ruins.
 *
 * A spine ja previa `platform/logging`; esta story so o materializa.
 *
 * NUNCA registrar token, credencial ou corpo de e-mail: log e um lugar por
 * onde segredo vaza, tanto quanto mensagem de erro (AD-9).
 */
export type Logger = {
  erro(evento: string, dados: Readonly<Record<string, string | number>>): void

  /**
   * Story 1.9 — o que foi recusado de proposito.
   *
   * Separado de `erro` porque as duas coisas pedem reacoes diferentes: `erro`
   * significa "algo quebrou e alguem precisa olhar"; um e-mail de remetente
   * desconhecido e o intake funcionando. Registrar recusa como erro treinaria
   * quem monitora a ignorar erro.
   *
   * O que junta as duas: silencio nao e opcao. Uma recusa invisivel faz um
   * intake quebrado parecer um intake sem demanda.
   */
  aviso(evento: string, dados: Readonly<Record<string, string | number>>): void
}
