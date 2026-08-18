#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 3.2 (recortes "meus" e "sem Dono").

A story reusa a forma da 3.1, entao as garantias de escopo, paginacao e ordem
seguem cobertas pelo `mutacoes-31.py`. Aqui ficam as proprias do recorte — e a
mais importante e a que faz o recorte SUBSTITUIR o escopo em vez de somar, que
e a forma mais provavel de esta story vazar Chamado alheio.

Nota: diferente da 3.1, o gargalo do dominio NAO e rede de seguranca aqui —
`podeVerTicket` nao sabe nada sobre Dono. Um erro no `WHERE` do recorte chega
inteiro a saida, e por isso os testes de saida bastam.

UMA MUTACAO SOBREVIVE DE PROPOSITO, e o script sai com codigo 1 por causa dela:
"'meus' usa o parametro dono em vez da identidade autenticada". Ela e INOCUA —
e a razao e boa: quando `recorte === 'meus'`, a guarda de conflito ja garantiu
que `entrada.dono` e `undefined`, entao `entrada.dono ?? quem.identity` sempre
cai no fallback. O codigo mutado e equivalente ao original PORQUE a recusa do
conflito existe; se ela fosse removida, esta mutacao passaria a vazar — e a
mutacao "Aceitar recorte e dono juntos" cobre esse caso, reprovando 6 testes.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-32.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

DOMINIO = "src/domain/recorte-da-fila.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
QUERY = "src/application/queries/buscar-chamados.ts"

MUTACOES = [
    (
        "O recorte 'meus' e ignorado (vira qualquer)",
        DOMINIO,
        "  if (entrada.recorte === 'meus') {\n    return { tipo: 'identidade', identity: quem.identity }\n  }",
        "",
    ),
    (
        "O recorte 'sem_dono' e ignorado (vira qualquer)",
        DOMINIO,
        "  if (entrada.recorte === 'sem_dono') {\n    return { tipo: 'ninguem' }\n  }",
        "",
    ),
    (
        "'meus' usa o parametro dono em vez da identidade autenticada",
        DOMINIO,
        "    return { tipo: 'identidade', identity: quem.identity }",
        "    return { tipo: 'identidade', identity: entrada.dono ?? quem.identity }",
    ),
    (
        "Aceitar recorte e dono juntos",
        DOMINIO,
        "  if (entrada.recorte !== undefined && entrada.dono !== undefined) {",
        "  if (false) {",
    ),
    (
        "'sem_dono' vira 'tem dono' (isNull -> isNotNull)",
        REPO,
        "      ...(filtros.dono.tipo === 'ninguem' ? [isNull(tickets.assignee)] : []),",
        "      ...(filtros.dono.tipo === 'ninguem' ? [isNotNull(tickets.assignee)] : []),",
    ),
    (
        "O filtro de Dono por identidade e ignorado",
        REPO,
        "      ...(filtros.dono.tipo === 'identidade' ? [eq(tickets.assignee, filtros.dono.identity)] : []),",
        "",
    ),
    (
        "O RECORTE SUBSTITUI O ESCOPO em vez de somar (vaza Chamado alheio)",
        REPO,
        "      ...(escopo.tipo === 'apenasDe' ? [eq(tickets.requester, escopo.requester)] : []),",
        "      ...(escopo.tipo === 'apenasDe' && filtros.dono.tipo === 'qualquer'\n        ? [eq(tickets.requester, escopo.requester)]\n        : []),",
    ),
    (
        "A query ignora o recorte e passa o dono cru",
        QUERY,
        """        dono: filtroDeDono(quem, {
          ...(input.recorte === undefined ? {} : { recorte: input.recorte }),
          ...(input.dono === undefined ? {} : { dono: input.dono }),
        }),""",
        """        dono: filtroDeDono(quem, {
          ...(input.dono === undefined ? {} : { dono: input.dono }),
        }),""",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-32.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-32.json").read_text())
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
