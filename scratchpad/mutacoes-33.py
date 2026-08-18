#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 3.3 (resumo da Fila).

Esta story perde a segunda camada do AD-8: um resumo nao tem itens para
`filaVisivelPara` filtrar. O que a substitui e a conferencia do ESCOPO que
produziu os numeros — e as mutacoes atacam justamente isso, alem do que conta
como carga e do preenchimento dos zeros.

Alvos escritos DEPOIS de `pnpm biome check --write` e copiados do arquivo
formatado (na 3.2 um alvo evaporou porque o formatador juntou as linhas).

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-33.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

DOMINIO = "src/domain/visibilidade.ts"
TICKET = "src/domain/ticket.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
QUERY = "src/application/queries/resumo-fila.ts"

MUTACOES = [
    # ---- A conferencia que substitui a segunda camada ----
    (
        "A query pede sempre 'todos' ao adapter (resumo da base inteira)",
        QUERY,
        "    const bruto = await repositorio.buscarResumoBruto(escopoDeLeitura(quem))",
        "    const bruto = await repositorio.buscarResumoBruto({ tipo: 'todos' })",
    ),
    (
        "resumoVisivelPara nao confere o escopo",
        DOMINIO,
        "  if (!mesmoEscopo(escopo, escopoDeLeitura(quem))) {",
        "  if (false) {",
    ),
    (
        "mesmoEscopo ignora a identidade (qualquer 'apenasDe' serve)",
        DOMINIO,
        "  a.tipo === 'todos' ? b.tipo === 'todos' : b.tipo === 'apenasDe' && a.requester === b.requester",
        "  a.tipo === 'todos' ? b.tipo === 'todos' : b.tipo === 'apenasDe'",
    ),
    # ---- O WHERE da agregacao ----
    (
        "Remover o WHERE do escopo na agregacao",
        REPO,
        "      ...(escopo.tipo === 'apenasDe' ? [eq(tickets.requester, escopo.requester)] : []),\n      sql`${tickets.status} NOT IN ${STATUS_ENCERRADOS}`,",
        "      sql`${tickets.status} NOT IN ${STATUS_ENCERRADOS}`,",
    ),
    (
        "Contar encerrados (o resumo deixa de medir carga)",
        REPO,
        "      sql`${tickets.status} NOT IN ${STATUS_ENCERRADOS}`,",
        "",
    ),
    (
        "Contar excluidos",
        REPO,
        "      isNull(tickets.deletedAt),\n      ...(escopo.tipo === 'apenasDe'",
        "      ...(escopo.tipo === 'apenasDe'",
    ),
    # ---- A forma da resposta ----
    (
        "semDono vira chave nula em porDono",
        REPO,
        "          porDono.filter((l) => l.chave !== null).map((l) => [l.chave as string, l.quantos]),",
        "          porDono.map((l) => [String(l.chave), l.quantos]),",
    ),
    (
        "semDono sempre zero",
        REPO,
        "        semDono: porDono.find((l) => l.chave === null)?.quantos ?? 0,",
        "        semDono: 0,",
    ),
    (
        "Omitir os eixos com zero (so o que o GROUP BY trouxe)",
        REPO,
        "        porStatus: Object.fromEntries(STATUS.map((s) => [s, contar(porStatus, s)])) as Record<\n          Status,\n          number\n        >,",
        "        porStatus: Object.fromEntries(porStatus.map((l) => [l.chave, l.quantos])) as Record<\n          Status,\n          number\n        >,",
    ),
    (
        "Omitir as Categorias com zero",
        REPO,
        "        porCategoria: Object.fromEntries(\n          CATEGORIAS.map((c) => [c, contar(porCategoria, c)]),\n        ) as Record<Categoria, number>,",
        "        porCategoria: Object.fromEntries(\n          porCategoria.map((l) => [l.chave, l.quantos]),\n        ) as Record<Categoria, number>,",
    ),
    # ---- O que e carga ----
    (
        "resolvido passa a ser encerrado",
        TICKET,
        "export const STATUS_ENCERRADOS = ['fechado', 'cancelado'] as const",
        "export const STATUS_ENCERRADOS = ['fechado', 'cancelado', 'resolvido'] as const",
    ),
    (
        "ehStatusEmAberto responde sempre true",
        TICKET,
        "  !(STATUS_ENCERRADOS as readonly string[]).includes(status)",
        "  true",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-33.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-33.json").read_text())
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
