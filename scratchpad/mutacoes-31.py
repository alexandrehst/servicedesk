#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 3.1 (filtrar a Fila).

A primeira leitura em CONJUNTO do projeto. O modo de falha do epico e
silencioso — uma lista com Chamado alheio vem ordenada, filtrada e plausivel —
entao as mutacoes atacam as duas camadas do AD-8 separadamente, alem da ordem,
da paginacao e da forma da linha.

Os alvos foram escritos DEPOIS de `pnpm biome check --write` e ancorados em
texto unico (as sobreviventes da 2.4 foram alvo ambiguo e alvo evaporado pelo
formatador; a da 2.6 foi teste que nao alcancava a linha).

DUAS MUTACOES SOBREVIVEM DE PROPOSITO, e o script sai com codigo 1 por causa
delas. As duas foram analisadas e sao INOCUAS — mantidas aqui porque a analise
vale mais registrada do que apagada:

1. "escopoDeLeitura usa a capacidade errada" — `veHistorico` e
   `veChamadoDeTerceiro` sao HOJE a mesma lista (`['agente']`), entao o codigo
   mutado tem comportamento identico ao original. Passa a ser detectavel no dia
   em que existir um papel com uma capacidade e nao a outra — um Gestor que le a
   fila sem ler o Log, por exemplo.

2. "Ignorar o limite e devolver tudo" — o `limit(limite + 1)` e garantia de
   CUSTO, nao de correcao: quem recorta a saida e o `slice(0, limite)`, e a
   mutacao que o remove ("Devolver a linha extra do limite+1") reprova. Nenhum
   teste de comportamento distingue "trouxe 21 linhas do banco" de "trouxe
   5000 e jogou fora" — so o plano de execucao distinguiria.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-31.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

DOMINIO = "src/domain/visibilidade.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
QUERY = "src/application/queries/buscar-chamados.ts"
CONTRATO = "src/application/contracts/buscar-chamados.ts"

MUTACOES = [
    # ---- Primeira camada: a decisao, no dominio ----
    (
        "escopoDeLeitura devolve 'todos' para qualquer papel",
        DOMINIO,
        """  pode(quem.role, 'veChamadoDeTerceiro')
    ? { tipo: 'todos' }
    : { tipo: 'apenasDe', requester: quem.identity }""",
        """  { tipo: 'todos' }""",
    ),
    (
        "escopoDeLeitura usa a capacidade errada",
        DOMINIO,
        "  pode(quem.role, 'veChamadoDeTerceiro')\n    ? { tipo: 'todos' }",
        "  pode(quem.role, 'veHistorico')\n    ? { tipo: 'todos' }",
    ),
    # ---- Segunda camada: o gargalo, depois de ler ----
    (
        "filaVisivelPara devolve tudo sem filtrar",
        DOMINIO,
        "  return { itens: itens.filter((item) => podeVerTicket(quem, item)), temMais }",
        "  return { itens, temMais }",
    ),
    # ---- O WHERE do adapter ----
    (
        "Remover o WHERE do escopo (o Solicitante alcanca a base inteira)",
        REPO,
        "      ...(escopo.tipo === 'apenasDe' ? [eq(tickets.requester, escopo.requester)] : []),",
        "",
    ),
    (
        "Remover deleted_at IS NULL da Fila",
        REPO,
        """      // Invariante de TODA leitura de lista, na mesma funcao que traduz o
      // escopo: excluido nao aparece para ninguem (1.7).
      isNull(tickets.deletedAt),""",
        "",
    ),
    (
        "Ignorar o filtro de status",
        REPO,
        "      ...(filtros.status === undefined ? [] : [eq(tickets.status, filtros.status)]),",
        "",
    ),
    (
        "Ignorar o filtro de dono",
        REPO,
        "      ...(filtros.dono === undefined ? [] : [eq(tickets.assignee, filtros.dono)]),",
        "",
    ),
    (
        "Ignorar o filtro de categoria",
        REPO,
        "      ...(filtros.categoria === undefined ? [] : [eq(tickets.categoria, filtros.categoria)]),",
        "",
    ),
    # ---- Ordem e paginacao ----
    (
        "Remover o desempate do ORDER BY",
        REPO,
        "      .orderBy(direcao(tickets.criadoEm), direcao(tickets.number))",
        "      .orderBy(direcao(tickets.criadoEm))",
    ),
    (
        "Ignorar a ordem pedida (sempre asc)",
        REPO,
        "    const direcao = pagina.ordem === 'desc' ? desc : asc",
        "    const direcao = asc",
    ),
    (
        "Ignorar o limite e devolver tudo",
        REPO,
        "      .limit(pagina.limite + 1)",
        "      .limit(1000)",
    ),
    (
        "Ignorar o deslocamento (toda pagina e a primeira)",
        REPO,
        "      .offset(pagina.deslocamento)",
        "      .offset(0)",
    ),
    (
        "temMais sempre false (a IA conclui que viu tudo)",
        REPO,
        "    const temMais = linhas.length > pagina.limite",
        "    const temMais = false",
    ),
    (
        "Devolver a linha extra do limite+1",
        REPO,
        "      itens: linhas.slice(0, pagina.limite).map((linha) => ({",
        "      itens: linhas.map((linha) => ({",
    ),
    # ---- A query ----
    (
        "A query pula o gargalo do dominio",
        QUERY,
        "    const { itens, temMais } = filaVisivelPara(quem, bruta)",
        "    const { itens, temMais } = { itens: (bruta as unknown as { [k: symbol]: { itens: never[] } })[Object.getOwnPropertySymbols(bruta)[0] as symbol].itens, temMais: false }",
    ),
    # ---- O contrato ----
    (
        "Teto do limite sobe para 1000",
        CONTRATO,
        "export const LIMITE_MAXIMO = 100",
        "export const LIMITE_MAXIMO = 1000",
    ),
    (
        "Limite sem teto no schema",
        CONTRATO,
        "  limite: z.number().int().positive().max(LIMITE_MAXIMO).default(LIMITE_PADRAO),",
        "  limite: z.number().int().positive().default(LIMITE_PADRAO),",
    ),
    (
        "A linha da Fila passa a carregar a Descricao",
        REPO,
        "        titulo: tickets.titulo,\n        status: tickets.status,",
        "        titulo: tickets.descricao,\n        status: tickets.status,",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-31.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-31.json").read_text())
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
