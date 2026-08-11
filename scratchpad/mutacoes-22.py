#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 2.2 (mudar Status).

Lembrete da 1.9 e da 2.1: mutacao sobrevivente NAO e sinonimo de teste fraco.
Verifique primeiro se ela muda comportamento observavel — duas ja sobreviveram
neste projeto por serem inocuas.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-22.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

COMMAND = "src/application/commands/mudar-status.ts"
TRANSICOES = "src/domain/transicoes.ts"
PAPEIS = "src/domain/papeis.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
MCP = "src/adapters/mcp/server.ts"

MUTACOES = [
    # --- AD-10: concorrencia otimista ---
    (
        "Ignorar a versao esperada no UPDATE (lost update)",
        REPO,
        "            eq(tickets.version, entrada.esperada),\n",
        "",
    ),
    (
        "Nao incrementar a versao",
        REPO,
        "        .set({ status: entrada.para, version: sql`${tickets.version} + 1` })",
        "        .set({ status: entrada.para })",
    ),
    (
        "Usar a versao do Chamado lido, e nao a informada pelo chamador",
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
    # --- AD-5: maquina de estados ---
    (
        "Aceitar qualquer transicao",
        COMMAND,
        "    if (!transicaoValida(de, para)) {",
        "    if (false) {",
    ),
    (
        "Auto-transicao entra na tabela de dados",
        TRANSICOES,
        "  em_andamento: ['resolvido', 'aberto'],",
        "  em_andamento: ['resolvido', 'aberto', 'em_andamento'],",
    ),
    # --- AD-7: a porta dos fundos da Story 2.6 ---
    (
        "mudar_status executa transicao que exige confirmacao",
        COMMAND,
        "    if (exigeConfirmacao(de, para)) {",
        "    if (false) {",
    ),
    (
        "Cancelar entra na tabela de transicoes comuns",
        TRANSICOES,
        "  aberto: ['em_andamento'],",
        "  aberto: ['em_andamento', 'cancelado'],",
    ),
    # --- AD-8: autorizacao ---
    (
        "Solicitante ganha permissao de mudar Status",
        PAPEIS,
        "  mudaStatus: ['agente'],",
        "  mudaStatus: ['agente', 'solicitante'],",
    ),
    (
        "Validar a transicao ANTES de autorizar (vaza a maquina de estados)",
        COMMAND,
        "    if (!pode(autor.role, 'mudaStatus')) {\n      throw semPermissao()\n    }\n",
        "",
    ),
    (
        "Pular o gargalo de visibilidade",
        COMMAND,
        "    if (visivel === null) {\n      throw ticketNaoEncontrado(input.numero)\n    }",
        "    if (bruto === null) {\n      throw ticketNaoEncontrado(input.numero)\n    }",
    ),
    (
        "Nao filtrar excluido no UPDATE",
        REPO,
        "            isNull(tickets.deletedAt),\n          ),\n        )\n        .returning({ version: tickets.version })",
        "          ),\n        )\n        .returning({ version: tickets.version })",
    ),
    # --- AD-3: auditoria ---
    (
        "Gravar auditoria de mudanca que nao aconteceu",
        REPO,
        "      if (linha === undefined) {\n        // Nada casou. Nenhuma linha de auditoria: registrar uma mudanca que\n        // nao aconteceu poluiria o Log com evento falso (licao da 1.7).\n        return null\n      }",
        "      if (linha === undefined) {\n        await tx.insert(auditEntries).values({\n          ticketNumber: entrada.numero,\n          acao: 'mudar_status',\n          autor: entrada.autor.identity,\n          origin: entrada.autor.origin,\n          de: entrada.de,\n          para: entrada.para,\n        })\n        return null\n      }",
    ),
    (
        "Nao registrar o par de/para no Log",
        REPO,
        "        de: entrada.de,\n        para: entrada.para,",
        "        de: null,\n        para: null,",
    ),
    # --- FR-21 ---
    (
        "Esquecer o rate limit no handler de mudar_status",
        MCP,
        "      const autor: Principal = { ...(await autenticar()), origin: 'mcp' }\n      await limitarChamadas(autor.identity)\n\n      const saida = await executar(input, autor)\n\n      return {\n        content: [\n          {\n            type: 'text' as const,\n            // A versao nova vai no texto",
        "      const autor: Principal = { ...(await autenticar()), origin: 'mcp' }\n\n      const saida = await executar(input, autor)\n\n      return {\n        content: [\n          {\n            type: 'text' as const,\n            // A versao nova vai no texto",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-22.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-22.json").read_text())
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
