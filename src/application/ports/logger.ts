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
}
