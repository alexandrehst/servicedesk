/**
 * Port de saida para entregar o magic link ao usuario.
 *
 * O transporte real (SMTP/Resend) e a Story 1.6 — aqui existe so a interface,
 * e os testes usam um duble que captura o token. Isso e uma limitacao
 * conhecida e registrada: o fluxo esta provado ate a fronteira do envio, nao
 * atraves dela.
 *
 * O token cru cruza esta fronteira porque e exatamente o que o usuario precisa
 * receber. Nenhuma implementacao deste port pode registra-lo em log.
 */
export type NotificadorDeLogin = {
  enviarLinkDeLogin(email: string, token: string): Promise<void>
}
