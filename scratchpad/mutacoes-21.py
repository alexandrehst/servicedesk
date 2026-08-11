#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 2.1 (comentar Chamado).

Cada mutacao quebra uma garantia de proposito e roda a suite. Se nenhum teste
reprovar, a garantia nao estava protegida: o teste que existia passava por
acaso.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-21.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

COMMAND = "src/application/commands/comentar-chamado.ts"
DOMINIO = "src/domain/comentario.ts"
PAPEIS = "src/domain/papeis.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
MCP = "src/adapters/mcp/server.ts"

MUTACOES = [
    (
        "Solicitante ganha permissao de Comentario Interno",
        PAPEIS,
        "comentaInterno: ['agente'],",
        "comentaInterno: ['agente', 'solicitante'],",
    ),
    (
        "Ignorar a capacidade comentaInterno",
        COMMAND,
        "if (entrada.interno && !pode(autor.role, 'comentaInterno')) {",
        "if (false) {",
    ),
    (
        "Rebaixar Comentario Interno para publico em silencio",
        COMMAND,
        "      throw semPermissao()",
        "      entrada = { ...entrada, interno: false }",
    ),
    (
        "Pular o gargalo de visibilidade",
        COMMAND,
        "    if (visivel === null) {\n      throw ticketNaoEncontrado(entrada.numero)\n    }",
        "    if (bruto === null) {\n      throw ticketNaoEncontrado(entrada.numero)\n    }",
    ),
    (
        "Aceitar corpo vazio",
        DOMINIO,
        "if (corpoLimpo.length === 0) {",
        "if (false) {",
    ),
    (
        "Autor gravado e o dono do Chamado, e nao quem escreveu (AD-9)",
        COMMAND,
        "      autor: autor.identity,",
        "      autor: 'sistema@empresa.com',",
    ),
    (
        "Nao distinguir interno na acao auditada",
        REPO,
        "acao: novo.internal ? 'comentar_chamado_interno' : 'comentar_chamado',",
        "acao: 'comentar_chamado',",
    ),
    (
        "Gravar o corpo do Comentario na auditoria",
        REPO,
        "        acao: novo.internal ? 'comentar_chamado_interno' : 'comentar_chamado',",
        "        acao: `comentar_chamado:${novo.corpo}`,",
    ),
    (
        "Nao gravar auditoria do Comentario",
        REPO,
        "      await tx.insert(auditEntries).values({\n        ticketNumber: numero,",
        "      await Promise.resolve({\n        ticketNumber: numero,",
    ),
    (
        "Esquecer o rate limit no handler MCP (FR-21)",
        MCP,
        "      // E limitar antes de executar: contar depois deixaria a escrita\n      // acontecer, e o limite serviria para nada numa IA em loop (FR-21).\n      await limitarChamadas(autor.identity)",
        "      // rate limit removido pela mutacao",
    ),
    (
        "Default de `interno` vira true no handler",
        MCP,
        "interno: input.interno ?? false",
        "interno: input.interno ?? true",
    ),
    (
        "Engolir erro nao-tipado no handler de Comentario",
        MCP,
        "      if (ehDomainError(erro)) {\n        return {\n          content: [{ type: 'text' as const, text: `[${erro.code}] ${erro.message}` }],\n          isError: true,\n        }\n      }\n      throw erro\n    }\n  }\n}\n\nexport const criarServidorMcp",
        "      return {\n        content: [{ type: 'text' as const, text: 'falhou' }],\n        isError: true,\n      }\n    }\n  }\n}\n\nexport const criarServidorMcp",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-21.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-21.json").read_text())
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

        print(f"{'OK ' if reprovou else '!! '}{nome}: {len(quais)} teste(s) reprovaram")
        for q in quais[:3]:
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
