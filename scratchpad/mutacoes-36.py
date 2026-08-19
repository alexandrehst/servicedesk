#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 3.6 (Resources e Prompt de triagem).

O risco da story e o Resource virar uma SEGUNDA porta de leitura, com regras
proprias. As mutacoes atacam isso: consulta propria, escopo ignorado,
autenticacao ou rate limit pulados, e o Prompt citando o que nao existe.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-36.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SERVER = "src/adapters/mcp/server.ts"

MUTACOES = [
    (
        "O Resource nao autentica",
        SERVER,
        "    const quem: Principal = { ...(await autenticar()), origin: 'mcp' }\n    await limitarChamadas(quem.identity)\n\n    const saida = await executar(input, quem)",
        "    const quem: Principal = { identity: 'ninguem@empresa.com', role: 'agente', origin: 'mcp' }\n    await limitarChamadas(quem.identity)\n\n    const saida = await executar(input, quem)",
    ),
    (
        "O Resource nao chama limitarChamadas",
        SERVER,
        "    await limitarChamadas(quem.identity)\n\n    const saida = await executar(input, quem)",
        "    const saida = await executar(input, quem)",
    ),
    (
        "O Resource de Fila ignora os defaults do contrato",
        SERVER,
        "    executar({ limite: LIMITE_PADRAO, deslocamento: 0, ordem: 'asc' }, quem),",
        "    executar({ limite: 1, deslocamento: 0, ordem: 'desc' }, quem),",
    ),
    (
        "O numero da URI nao passa pelo contrato Zod (achado do review, PR #74)",
        SERVER,
        "    ler(uri, verChamadoInputSchema.parse({ numero: Number(numeroDaUri) }))",
        "    ler(uri, { numero: Number(numeroDaUri) })",
    ),
    (
        "O Prompt cita uma tool que nao existe",
        SERVER,
        "    `1. Leia o Chamado com ver_chamado(numero: ${numero}). Anote a versao: toda`,",
        "    `1. Leia o Chamado com consultar_chamado(numero: ${numero}). Anote a versao: toda`,",
    ),
    (
        "O Prompt esquece a regra da versao",
        SERVER,
        "    '- A versao vem de ver_chamado e e obrigatoria em toda mutacao. Se vier',\n    '  Conflict, releia e refaca com a versao nova.',",
        "",
    ),
    (
        "O Prompt encaminha para acao irreversivel",
        SERVER,
        "    '- Fechar, cancelar e reabrir NAO fazem parte da triagem: sao acoes',\n    '  irreversiveis e exigem confirmacao humana explicita.',",
        "",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-36.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-36.json").read_text())
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
