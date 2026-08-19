#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 4.1 (export CSV).

O export tem dois riscos, e as mutacoes atacam os dois:

1. **Seguranca do FORMATO** — sem escape o arquivo mente sobre as colunas; sem
   neutralizar formula, ele EXECUTA na maquina de quem abre. O Titulo vem do
   Solicitante: e entrada de usuario indo para uma planilha.
2. **Seguranca do CONTEUDO** — o escopo aqui nao tem segunda chance: um
   vazamento na Fila aparece numa tela e some; num CSV, vira arquivo, e arquivo
   e encaminhado.

Alvos copiados do arquivo DEPOIS de `pnpm biome check --write`.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-41.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

CSV = "src/platform/csv/csv.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
QUERY = "src/application/queries/exportar-csv.ts"
CONTRATO = "src/application/contracts/exportar-csv.ts"

# O bloco do export no adapter, que compartilha texto com o da Fila: os alvos
# abaixo usam as linhas UNICAS desta consulta (ORDER BY e as colunas).
MUTACOES = [
    # ---- Seguranca do formato ----
    (
        "NAO neutralizar formula (o CSV passa a executar no Excel)",
        CSV,
        "  const seguro = INICIOS_PERIGOSOS.some((inicio) => bruto.startsWith(inicio)) ? `'${bruto}` : bruto",
        "  const seguro = bruto",
    ),
    (
        "Neutralizar apenas '=' (esquecer +, -, @, tab, CR)",
        CSV,
        "const INICIOS_PERIGOSOS = ['=', '+', '-', '@', '\\t', '\\r']",
        "const INICIOS_PERIGOSOS = ['=']",
    ),
    (
        "Nao escapar (aspas e virgula saem cruas)",
        CSV,
        "  return PRECISA_ASPAS.test(seguro) ? `\"${seguro.replaceAll('\"', '\"\"')}\"` : seguro",
        "  return seguro",
    ),
    (
        "Nao duplicar as aspas internas",
        CSV,
        "`\"${seguro.replaceAll('\"', '\"\"')}\"`",
        "`\"${seguro}\"`",
    ),
    (
        "Nulo vira a string 'null' no arquivo",
        CSV,
        "    return ''\n  }\n\n  return valor instanceof Date ? valor.toISOString() : String(valor)",
        "    return String(valor)\n  }\n\n  return valor instanceof Date ? valor.toISOString() : String(valor)",
    ),
    (
        "O cabecalho volta em toda pagina (corrompe o arquivo juntado)",
        CSV,
        "  return (opcoes.cabecalho === false ? corpo : [colunas.join(','), ...corpo]).join('\\n')",
        "  return [colunas.join(','), ...corpo].join('\\n')",
    ),
    # ---- Seguranca do conteudo ----
    (
        "O export ignora o escopo (vaza a base num arquivo)",
        REPO,
        """  async buscarParaExportarBruto(escopo: EscopoDeLeitura, filtros, pagina) {
    const condicoes = [
      isNull(tickets.deletedAt),
      ...(escopo.tipo === 'apenasDe' ? [eq(tickets.requester, escopo.requester)] : []),""",
        """  async buscarParaExportarBruto(escopo: EscopoDeLeitura, filtros, pagina) {
    const condicoes = [
      isNull(tickets.deletedAt),""",
    ),
    (
        "O export inclui Chamado excluido",
        REPO,
        """  async buscarParaExportarBruto(escopo: EscopoDeLeitura, filtros, pagina) {
    const condicoes = [
      isNull(tickets.deletedAt),""",
        """  async buscarParaExportarBruto(escopo: EscopoDeLeitura, filtros, pagina) {
    const condicoes = [""",
    ),
    (
        "A query do export pula o gargalo do dominio",
        QUERY,
        "    const { itens, temMais } = exportacaoVisivelPara(quem, bruta)",
        "    const { itens, temMais } = { itens: (bruta as unknown as { [k: symbol]: { itens: never[] } })[Object.getOwnPropertySymbols(bruta)[0] as symbol].itens, temMais: false }",
    ),
    (
        "O export pede sempre 'todos' ao repositorio",
        QUERY,
        "      escopoDeLeitura(quem),",
        "      { tipo: 'todos' as const },",
    ),
    # ---- Filtros e paginacao ----
    (
        "O export ignora os filtros informados",
        QUERY,
        "        ...(input.status === undefined ? {} : { status: input.status }),",
        "",
    ),
    (
        "temMais sempre falso no export",
        QUERY,
        "      temMais,\n    }\n  }",
        "      temMais: false,\n    }\n  }",
    ),
    (
        "Teto do export sobe para 100 mil",
        CONTRATO,
        "export const LIMITE_MAXIMO_EXPORT = 5_000",
        "export const LIMITE_MAXIMO_EXPORT = 100_000",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-41.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-41.json").read_text())
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
