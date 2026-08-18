#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 3.4 (busca simples).

A mutacao que da nome a story e a PRIMEIRA da lista: remover o recorte de
Comentario Interno do `EXISTS`. Ela e a razao de a story existir do jeito que
existe — o gargalo do dominio (`filaVisivelPara`) sabe de posse e exclusao, nao
de CONTEUDO, entao um Comentario Interno que casa faz o Chamado aparecer para
quem nao pode ler a conversa do time. O conteudo nao seria exibido; a EXISTENCIA
do resultado ja teria contado.

Alvos copiados do arquivo DEPOIS de `pnpm biome check --write` (na 3.2 um alvo
evaporou porque o formatador juntou as linhas).

UMA MUTACAO SOBREVIVE DE PROPOSITO, e o script sai com codigo 1 por causa dela:
"alcanceDaBusca usa a capacidade errada" (`veComentarioInterno` trocada por
`veChamadoDeTerceiro`). E INOCUA hoje — as duas capacidades sao a mesma lista
(`['agente']`), entao o codigo mutado se comporta igual. E a terceira vez que
esse par aparece (3.1 e 3.2 tiveram o mesmo), e vai virar detectavel no dia em
que existir um papel que ve a fila inteira sem ver a conversa interna do time.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-34.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

DOMINIO = "src/domain/busca.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
QUERY = "src/application/queries/buscar-chamados.ts"

MUTACOES = [
    (
        "REMOVER o recorte de Interno do EXISTS (vazamento por existencia)",
        REPO,
        "    ...(busca.comentarios === 'apenasPublicos' ? [eq(comments.internal, false)] : []),",
        "",
    ),
    (
        "alcanceDaBusca devolve 'todos' para qualquer papel",
        DOMINIO,
        "    comentarios: pode(quem.role, 'veComentarioInterno') ? 'todos' : 'apenasPublicos',",
        "    comentarios: 'todos' as const,",
    ),
    (
        "alcanceDaBusca usa a capacidade errada",
        DOMINIO,
        "pode(quem.role, 'veComentarioInterno')",
        "pode(quem.role, 'veChamadoDeTerceiro')",
    ),
    (
        "Comentario EXCLUIDO volta a casar",
        REPO,
        "    isNull(comments.deletedAt),",
        "",
    ),
    (
        "Buscar so no Titulo (ignorar Descricao)",
        REPO,
        "    sql`${tickets.descricao} ILIKE ${padrao}`,",
        "",
    ),
    (
        "Buscar so nos campos do Chamado (ignorar Comentario)",
        REPO,
        "    sql`EXISTS (SELECT 1 FROM ${comments} WHERE ${comentarioQueCasa})`,",
        "",
    ),
    (
        "numero_legado casa por ILIKE em vez de igualdade",
        REPO,
        "    eq(tickets.numeroLegado, busca.termo),",
        "    sql`${tickets.numeroLegado} ILIKE ${padrao}`,",
    ),
    (
        "O texto substitui o escopo em vez de somar",
        REPO,
        "      ...(escopo.tipo === 'apenasDe' ? [eq(tickets.requester, escopo.requester)] : []),",
        "      ...(escopo.tipo === 'apenasDe' && filtros.busca === undefined\n        ? [eq(tickets.requester, escopo.requester)]\n        : []),",
    ),
    (
        "Aceitar termo vazio (a busca vira 'toda a base')",
        DOMINIO,
        "  if (termo.length === 0) {",
        "  if (false) {",
    ),
    (
        "A query ignora o texto informado",
        QUERY,
        "        ...(input.texto === undefined ? {} : { busca: alcanceDaBusca(quem, input.texto) }),",
        "",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-34.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-34.json").read_text())
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
