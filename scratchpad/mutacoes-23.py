#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 2.3 (atribuir Dono).

Lembrete das 1.9, 2.1 e 2.2: mutacao sobrevivente NAO e sinonimo de teste
fraco. Pode ser inocua (nao muda comportamento), pode apontar redundancia
(codigo inalcancavel), ou pode ser lacuna real. Verifique antes de mexer no
teste.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-23.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

COMMAND = "src/application/commands/atribuir-chamado.ts"
PAPEIS = "src/domain/papeis.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
MCP = "src/adapters/mcp/server.ts"

MUTACOES = [
    # --- a divida do assignee (AC #5) ---
    (
        "Voltar a hardcodar assignee: null na leitura",
        REPO,
        "      assignee: linha.assignee,\n      criadoEm: linha.criadoEm,",
        "      assignee: null,\n      criadoEm: linha.criadoEm,",
    ),
    # --- o destinatario (AC #2) ---
    (
        "Nao verificar o destinatario no cadastro",
        COMMAND,
        "    if (usuario === null || !pode(usuario.papel, 'recebeAtribuicao')) {",
        "    if (false) {",
    ),
    (
        "Aceitar Solicitante como Dono",
        PAPEIS,
        "  recebeAtribuicao: ['agente'],",
        "  recebeAtribuicao: ['agente', 'solicitante'],",
    ),
    (
        "Gravar o e-mail da ENTRADA, e nao o do cadastro",
        COMMAND,
        "      para: usuario.email,\n      esperada: input.versao,",
        "      para: destinatario,\n      esperada: input.versao,",
    ),
    (
        "Nao normalizar o destinatario",
        COMMAND,
        "    const destinatario = normalizarEmail(input.agente ?? autor.identity)",
        "    const destinatario = input.agente ?? autor.identity",
    ),
    # --- reatribuicao ao mesmo Dono (AC #3) ---
    (
        "Permitir reatribuir ao mesmo Dono",
        COMMAND,
        "    if (donoAtual !== null && normalizarEmail(donoAtual) === destinatario) {",
        "    if (false) {",
    ),
    (
        "Comparar o Dono atual sem normalizar",
        COMMAND,
        "    if (donoAtual !== null && normalizarEmail(donoAtual) === destinatario) {",
        "    if (donoAtual === destinatario) {",
    ),
    # --- self-assign (AC #1) ---
    (
        "Self-assign vira atribuicao ao Solicitante do Chamado",
        COMMAND,
        "input.agente ?? autor.identity",
        "input.agente ?? visivel.ticket.requester",
    ),
    # --- AD-8 ---
    (
        "Solicitante ganha permissao de atribuir",
        PAPEIS,
        "  atribuiChamado: ['agente'],",
        "  atribuiChamado: ['agente', 'solicitante'],",
    ),
    (
        "Validar o destinatario ANTES de autorizar quem chama",
        COMMAND,
        "    if (!pode(autor.role, 'atribuiChamado')) {\n      throw semPermissao()\n    }\n",
        "",
    ),
    (
        "Pular o gargalo de visibilidade",
        COMMAND,
        "    if (visivel === null) {\n      throw ticketNaoEncontrado(input.numero)\n    }",
        "    if (bruto === null) {\n      throw ticketNaoEncontrado(input.numero)\n    }",
    ),
    # --- AD-10 ---
    (
        "Ignorar a versao esperada no UPDATE",
        REPO,
        "            eq(tickets.version, entrada.esperada),\n            isNull(tickets.deletedAt),\n          ),\n        )\n        .returning({ version: tickets.version })\n\n      if (linha === undefined) {\n        // Escrita que nao aconteceu nao vira auditoria (licao da 1.7).",
        "            isNull(tickets.deletedAt),\n          ),\n        )\n        .returning({ version: tickets.version })\n\n      if (linha === undefined) {\n        // Escrita que nao aconteceu nao vira auditoria (licao da 1.7).",
    ),
    (
        "Nao filtrar excluido no UPDATE da atribuicao",
        REPO,
        "            eq(tickets.version, entrada.esperada),\n            isNull(tickets.deletedAt),\n          ),\n        )\n        .returning({ version: tickets.version })\n\n      if (linha === undefined) {\n        // Escrita que nao aconteceu nao vira auditoria (licao da 1.7).",
        "            eq(tickets.version, entrada.esperada),\n          ),\n        )\n        .returning({ version: tickets.version })\n\n      if (linha === undefined) {\n        // Escrita que nao aconteceu nao vira auditoria (licao da 1.7).",
    ),
    (
        "Usar a versao do Chamado lido em vez da informada",
        COMMAND,
        "      esperada: input.versao,",
        "      esperada: visivel.ticket.version,",
    ),
    (
        "Conflito vira sucesso silencioso",
        COMMAND,
        "    if (resultado === null) {",
        "    if (false) {",
    ),
    # --- AD-3 ---
    (
        "Nao registrar o Dono anterior no Log",
        REPO,
        "        // `de` nulo na primeira atribuicao — o Chamado saiu de \"sem Dono\".\n        de: entrada.de,",
        "        de: null,",
    ),
    # --- FR-21 ---
    (
        "Esquecer o rate limit no handler de atribuicao",
        MCP,
        "  return async (input: AtribuirChamadoInput) => {\n    try {\n      const autor: Principal = { ...(await autenticar()), origin: 'mcp' }\n      await limitarChamadas(autor.identity)",
        "  return async (input: AtribuirChamadoInput) => {\n    try {\n      const autor: Principal = { ...(await autenticar()), origin: 'mcp' }",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-23.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-23.json").read_text())
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
        for q in quais[:2]:
            print(f"     - {q}")
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
