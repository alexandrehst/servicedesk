#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 2.6 (Acoes irreversiveis com confirmacao).

A story constroi o AD-7 inteiro, entao as mutacoes atacam o guardrail em si:
a checagem de confirmacao, o escopo do token, o uso unico, a ORDEM das
checagens e o motivo da reabertura. As garantias compartilhadas — versao no
WHERE, filtro de excluido, auditoria transacional, rate limit — seguem cobertas
pelos scripts das Stories 2.2 e 2.3, que atacam os helpers.

Os alvos foram escritos DEPOIS de `pnpm biome check --write` e ancorados em
texto unico (as duas sobreviventes da 2.4 foram alvo ambiguo e alvo evaporado
pelo formatador).

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-26.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

COMMAND = "src/application/commands/acao-irreversivel.ts"
DOMINIO = "src/domain/acoes-irreversiveis.ts"
REPO_CONF = "src/adapters/persistence/confirmacao-repository.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
PAPEIS = "src/domain/papeis.ts"
TRANSICOES = "src/domain/transicoes.ts"

MUTACOES = [
    # ---- O guardrail do AD-7, que a story existe para construir ----
    (
        "REMOVER a checagem de confirmacao (o AD-7 deixa de existir)",
        COMMAND,
        "    if (input.confirmacao === undefined) {",
        "    if (false) {",
    ),
    (
        "Aceitar qualquer confirmacao (ignorar o resultado do consumo)",
        COMMAND,
        "    if (!valeu) {",
        "    if (false) {",
    ),
    (
        "Emitir confirmacao ANTES de autorizar (cracha para quem nao entra)",
        COMMAND,
        "    if (!pode(autor.role, capacidade)) {",
        "    if (false && !pode(autor.role, capacidade)) {",
    ),
    (
        "Emitir confirmacao para transicao invalida",
        COMMAND,
        "    if (!exigeConfirmacao(de, destino)) {",
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
    # ---- O escopo do token: o que impede reusar um aval por outro ----
    (
        "Confirmacao serve para qualquer ACAO",
        REPO_CONF,
        "          eq(confirmacoes.acao, acao),",
        "",
    ),
    (
        "Confirmacao serve para qualquer CHAMADO",
        REPO_CONF,
        "          eq(confirmacoes.ticketNumber, ticketNumber),",
        "",
    ),
    (
        "Confirmacao serve para qualquer IDENTIDADE",
        REPO_CONF,
        "          eq(confirmacoes.identity, identity),",
        "",
    ),
    (
        "Confirmacao vira REUTILIZAVEL (nao checa usado_em)",
        REPO_CONF,
        "          isNull(confirmacoes.usadoEm),",
        "",
    ),
    (
        "Confirmacao nunca expira",
        REPO_CONF,
        "          gt(confirmacoes.expiraEm, agora),",
        "",
    ),
    (
        "Nao marcar a confirmacao como usada",
        REPO_CONF,
        "      .set({ usadoEm: sql`now()` })",
        "      .set({ identity: confirmacoes.identity })",
    ),
    # ---- O pedido no Log: a unica evidencia de human-in-the-loop ----
    (
        "Nao auditar o pedido de confirmacao",
        REPO_CONF,
        "      await tx.insert(auditEntries).values({\n        ticketNumber,\n        acao: 'solicitar_confirmacao',",
        "      await Promise.resolve({\n        ticketNumber,\n        acao: 'solicitar_confirmacao',",
    ),
    # ---- O motivo da reabertura ----
    (
        "Reabrir deixa de exigir motivo",
        DOMINIO,
        "  reabrir_chamado: { destino: 'em_andamento', capacidade: 'reabre', exigeMotivo: true },",
        "  reabrir_chamado: { destino: 'em_andamento', capacidade: 'reabre', exigeMotivo: false },",
    ),
    (
        "Motivo em branco passa a valer",
        DOMINIO,
        "  !exigeMotivo(acao) || (motivo !== undefined && motivo.trim().length > 0)",
        "  !exigeMotivo(acao) || motivo !== undefined",
    ),
    (
        "Nao gravar o motivo no Log",
        REPO,
        "      motivo: entrada.motivo ?? null,",
        "      motivo: null,",
    ),
    # ---- Autorizacao ----
    (
        "Solicitante ganha permissao de encerrar",
        PAPEIS,
        "  fechaOuCancela: ['agente'],",
        "  fechaOuCancela: ['agente', 'solicitante'],",
    ),
    (
        "Reabrir passa a usar a capacidade de encerrar",
        DOMINIO,
        "capacidade: 'reabre', exigeMotivo: true },",
        "capacidade: 'fechaOuCancela', exigeMotivo: true },",
    ),
    # ---- A porta dos fundos da 2.2 ----
    (
        "mudar_status volta a aceitar as irreversiveis",
        TRANSICOES,
        "  resolvido: ['em_andamento'],",
        "  resolvido: ['em_andamento', 'fechado'],",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-26.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-26.json").read_text())
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
