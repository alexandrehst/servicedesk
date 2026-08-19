#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 3.5 (sugerir Chamados parecidos).

A story reusa a forma do epico (escopo no dominio, traducao no adapter), entao
as mutacoes atacam o que e proprio dela: o escopo na sugestao, o limiar e a
ordem por semelhanca.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-35.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

DOMINIO = "src/domain/semelhanca.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
QUERY = "src/application/queries/chamados-parecidos.ts"

MUTACOES = [
    (
        "Sugerir de toda a base (ignorar o escopo)",
        QUERY,
        "      escopo: escopoDeLeitura(quem),",
        "      escopo: { tipo: 'todos' as const },",
    ),
    (
        "A query pula o gargalo do dominio",
        QUERY,
        "      parecidos: filaVisivelPara(quem, bruta).itens.map((item) => ({",
        "      parecidos: (bruta as unknown as { [k: symbol]: { itens: never[] } })[\n        Object.getOwnPropertySymbols(bruta)[0] as symbol\n      ].itens.map((item: any) => ({",
    ),
    (
        "Limiar zero (qualquer coisa vira parecida)",
        DOMINIO,
        "export const LIMIAR_DE_SEMELHANCA = 0.3",
        "export const LIMIAR_DE_SEMELHANCA = 0",
    ),
    (
        "Remover o limiar explicito do WHERE",
        REPO,
        "          sql`${semelhanca} >= ${limiar}`,",
        "",
    ),
    (
        "Ordenar por data em vez de semelhanca",
        REPO,
        "      .orderBy(sql`${semelhanca} DESC`, asc(tickets.number))",
        "      .orderBy(asc(tickets.criadoEm), asc(tickets.number))",
    ),
    (
        "Incluir Chamado excluido na sugestao",
        REPO,
        "          isNull(tickets.deletedAt),\n          ...(escopo.tipo === 'apenasDe' ? [eq(tickets.requester, escopo.requester)] : []),\n          sql`${tickets.titulo} % ${texto}`,",
        "          ...(escopo.tipo === 'apenasDe' ? [eq(tickets.requester, escopo.requester)] : []),\n          sql`${tickets.titulo} % ${texto}`,",
    ),
    (
        "Excluir os encerrados da sugestao",
        REPO,
        "          sql`${tickets.titulo} % ${texto}`,\n          sql`${semelhanca} >= ${limiar}`,",
        "          sql`${tickets.titulo} % ${texto}`,\n          sql`${semelhanca} >= ${limiar}`,\n          sql`${tickets.status} NOT IN ${STATUS_ENCERRADOS}`,",
    ),
    (
        "Aceitar texto curto demais",
        DOMINIO,
        "  if (limpo.length < MINIMO_DE_CARACTERES) {",
        "  if (false) {",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-35.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-35.json").read_text())
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
