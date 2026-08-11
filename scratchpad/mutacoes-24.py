#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 2.4 (mudar Prioridade).

A story usa os tres helpers extraidos na 2.3, entao as mutacoes contra eles
(versao no WHERE, filtro de excluido, auditoria, rate limit) ja sao cobertas
pelo `mutacoes-23.py` e valem para esta story tambem. Aqui ficam as que sao
proprias da Prioridade.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-24.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

COMMAND = "src/application/commands/mudar-prioridade.ts"
TICKET = "src/domain/ticket.ts"
PAPEIS = "src/domain/papeis.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"

MUTACOES = [
    (
        "Solicitante ganha permissao de mudar Prioridade",
        PAPEIS,
        "  mudaPrioridade: ['agente'],",
        "  mudaPrioridade: ['agente', 'solicitante'],",
    ),
    (
        "Ignorar a capacidade de mudar Prioridade",
        COMMAND,
        "    if (!pode(autor.role, 'mudaPrioridade')) {",
        "    if (false) {",
    ),
    (
        "Validar o valor ANTES de autorizar (vaza a prioridade atual)",
        COMMAND,
        "    if (!pode(autor.role, 'mudaPrioridade')) {\n      throw semPermissao()\n    }\n",
        "",
    ),
    (
        "Aceitar a prioridade que o Chamado ja tem",
        COMMAND,
        "    if (de === para) {",
        "    if (false) {",
    ),
    (
        "Pular o gargalo de visibilidade",
        COMMAND,
        "    if (visivel === null) {\n      throw ticketNaoEncontrado(input.numero)\n    }",
        "    if (bruto === null) {\n      throw ticketNaoEncontrado(input.numero)\n    }",
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
    (
        "Chamado nasce sem a prioridade padrao",
        TICKET,
        "    prioridade: prioridade ?? PRIORIDADE_PADRAO,",
        "    prioridade: prioridade ?? 'critica',",
    ),
    (
        "Nao gravar a prioridade na abertura",
        REPO,
        "          priority: novo.prioridade,",
        "          priority: 'baixa',",
    ),
    (
        "Voltar a hardcodar a prioridade na leitura",
        REPO,
        "      // Story 2.4 — LIDA do banco, pela licao do `assignee` na 2.3.\n      prioridade: linha.priority as Prioridade,",
        "      prioridade: 'media' as Prioridade,",
    ),
    (
        "Gravar a prioridade errada no UPDATE",
        REPO,
        "      { priority: entrada.para },",
        "      { priority: entrada.de },",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-24.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-24.json").read_text())
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
