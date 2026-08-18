#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 2.5 (resolver Chamado + e-mail de resolucao).

Esta story NAO cria mutacao de campo nova: resolver e uma transicao que ja
existia (2.2), entao as garantias do AD-10 — versao no WHERE, filtro de
excluido, auditoria transacional, rate limit — seguem cobertas pelos scripts
das Stories 2.2 e 2.3, que atacam os helpers. Aqui ficam as mutacoes proprias
da NOTIFICACAO: quando o e-mail sai, o que ele leva, e o que acontece quando o
transporte falha.

Os alvos foram escritos DEPOIS de `pnpm biome check --write` e ancorados em
texto unico — as duas mutacoes sobreviventes da 2.4 foram alvo ambiguo e alvo
evaporado pelo formatador, nao codigo fraco.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-25.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

COMMAND = "src/application/commands/mudar-status.ts"
CANAL = "src/application/commands/notificacao-de-chamado.ts"
DURACAO = "src/domain/duracao.ts"
SMTP = "src/adapters/email/smtp.ts"

GATILHO = """    if (para === 'resolvido' && notificacao !== undefined) {
      await notificarResolucao(notificacao, visivel.ticket, autor)
    }"""

CATCH = """  } catch (erro) {
    logger.erro(evento, {
      numero,
      destinatario,
      causa: erro instanceof Error ? erro.message : String(erro),
    })
  }"""

MUTACOES = [
    (
        "Notificar em QUALQUER transicao, nao so na resolucao",
        COMMAND,
        "    if (para === 'resolvido' && notificacao !== undefined) {",
        "    if (notificacao !== undefined) {",
    ),
    (
        "NAO notificar ao resolver",
        COMMAND,
        "    if (para === 'resolvido' && notificacao !== undefined) {",
        "    if (false && notificacao !== undefined) {",
    ),
    (
        "Notificar ANTES de saber se o UPDATE casou (avisa resolucao que nao aconteceu)",
        COMMAND,
        "    const resultado = await repositorio.mudarStatusComAuditoria({",
        GATILHO + "\n\n    const resultado = await repositorio.mudarStatusComAuditoria({",
    ),
    (
        "Guardar 'ja avisei' e nao re-notificar a re-resolucao",
        COMMAND,
        GATILHO,
        """    const jaAvisados = ((globalThis as Record<string, unknown>).__avisados ??=
      new Set<number>()) as Set<number>
    if (para === 'resolvido' && notificacao !== undefined && !jaAvisados.has(input.numero)) {
      jaAvisados.add(input.numero)
      await notificarResolucao(notificacao, visivel.ticket, autor)
    }""",
    ),
    (
        "Quem resolveu vira o Dono, e nao quem executou a acao",
        COMMAND,
        "        resolvidoPor: autor.identity,",
        "        resolvidoPor: ticket.assignee ?? autor.identity,",
    ),
    (
        "Mandar o e-mail para quem resolveu, e nao para o Solicitante",
        COMMAND,
        """      numero: ticket.number,
      destinatario: ticket.requester,
      evento: 'falha_ao_notificar_resolucao',""",
        """      numero: ticket.number,
      destinatario: autor.identity,
      evento: 'falha_ao_notificar_resolucao',""",
    ),
    (
        "Medir o tempo total do instante da leitura, e nao da abertura",
        COMMAND,
        "        duracao: duracaoLegivel(ticket.criadoEm, canal.agora()),",
        "        duracao: duracaoLegivel(canal.agora(), canal.agora()),",
    ),
    (
        "Falha de e-mail PROPAGA e derruba a resolucao ja gravada",
        CANAL,
        CATCH,
        """  } catch (erro) {
    throw erro
  }""",
    ),
    (
        "Falha de e-mail engolida sem log (catch vazio)",
        CANAL,
        CATCH,
        """  } catch {
    // engolido
  }""",
    ),
    (
        "Token do link vaza para o log da falha",
        CANAL,
        """    const token = await criarLink({ ticketNumber: numero, email: destinatario })

    await enviar(notificador, montarUrl(numero, token))
  } catch (erro) {
    logger.erro(evento, {
      numero,
      destinatario,""",
        """    const token = await criarLink({ ticketNumber: numero, email: destinatario })

    await enviar(notificador, montarUrl(numero, token))
  } catch (erro) {
    logger.erro(evento, {
      numero,
      destinatario,
      link: `https://desk.empresa.com/chamados/${numero}?acesso=vazado`,""",
    ),
    (
        "Duracao arredondada para CIMA (anuncia um dia que nao passou)",
        DURACAO,
        "    return plural(Math.floor(ms / DIA_MS), 'dia', 'dias')",
        "    return plural(Math.ceil(ms / DIA_MS), 'dia', 'dias')",
    ),
    (
        "Duracao negativa vira numero em vez de 'menos de um minuto'",
        DURACAO,
        "  if (ms >= MINUTO_MS) {",
        "  if (true) {",
    ),
    (
        "Duracao em horas arredondada para cima",
        DURACAO,
        "    return plural(Math.floor(ms / HORA_MS), 'hora', 'horas')",
        "    return plural(Math.ceil(ms / HORA_MS), 'hora', 'horas')",
    ),
    (
        "E-mail de resolucao sem quem resolveu",
        SMTP,
        "        `Resolvido por: ${mensagem.resolvidoPor}`,",
        "        'Resolvido pelo time de atendimento.',",
    ),
    (
        "E-mail de resolucao sem o tempo total",
        SMTP,
        "        `Tempo total: ${mensagem.duracao}`,",
        "        'Tempo total: indisponivel',",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-25.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-25.json").read_text())
    except Exception:
        return (r.returncode != 0, ["<sem relatorio: falha de compilacao>"])

    reprovados = [
        t["fullName"]
        for arq in dados.get("testResults", [])
        for t in arq.get("assertionResults", [])
        if t.get("status") == "failed"
    ]
    return (len(reprovados) > 0, reprovados)


def main() -> int:
    resultados = []
    for nome, arquivo, alvo, troca in MUTACOES:
        caminho = RAIZ / arquivo
        original = caminho.read_text()
        if alvo not in original:
            print(f"!! ALVO NAO ENCONTRADO: {nome} ({arquivo})")
            resultados.append((nome, False, ["<alvo nao encontrado>"]))
            continue
        caminho.write_text(original.replace(alvo, troca, 1))
        try:
            reprovou, quais = rodar_suite()
        finally:
            caminho.write_text(original)
        print(f"{'OK ' if reprovou else '!! '}{nome}: {len(quais)} teste(s)")
        resultados.append((nome, reprovou, quais))

    print("\n| Mutacao aplicada | Reprovou |")
    print("| --- | --- |")
    for nome, reprovou, quais in resultados:
        print(f"| {nome} | {len(quais)} teste(s) |" if reprovou else f"| {nome} | **NAO REPROVOU** |")

    sobreviventes = [n for n, ok, _ in resultados if not ok]
    if sobreviventes:
        print(f"\nMUTACOES SOBREVIVENTES: {len(sobreviventes)}")
        return 1
    print("\nTodas as mutacoes foram reprovadas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
