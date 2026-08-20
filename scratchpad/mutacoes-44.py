#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 4.4 (Relatorio de operacao).

Esta story e diferente das outras do epico: ela nao escreve nada. E 100%
leitura, e o risco nao e corromper dado — e **produzir um numero errado que
alguem usa para decidir cortar um contrato de R$240k/ano**. As mutacoes atacam
exatamente isso:

- o **periodo** (se o filtro nao existir, o relatorio mede a base inteira e
  ninguem percebe, porque o numero continua "plausivel");
- a **regra da reabertura** (usar o primeiro `resolvido` faz a metrica MELHORAR
  quando o atendimento piora — o pior defeito possivel aqui);
- o **Chamado sem resolucao** entrando na media como se tivesse acabado;
- o **excluido** voltando para a contagem (`audit_entries` nao tem
  `deleted_at`);
- a **autorizacao** (AD-8) e o **periodo invertido**.

TRES MUTACOES ESTAO DELIBERADAMENTE FORA, e as tres pelo mesmo criterio da 4.3:
sobrevivente por AUSENCIA DE EFEITO e sintoma de mutacao mal formulada, nao de
teste faltando. Mas os motivos sao diferentes, e vale distinguir:

1. **`min` -> `max` na abertura.** So existe UM `abrir_chamado` por Chamado, e o
   `GROUP BY` produz grupos de uma linha — as duas funcoes dao o mesmo
   resultado. O `min` esta la por defesa contra dado corrompido (duas aberturas
   para o mesmo Chamado), e defesa contra o que nao acontece nao tem teste
   possivel.

2. **`JOIN` -> `LEFT JOIN` em `resolucoes`.** Aqui a razao e melhor: o
   `WHERE r.resolucao >= ab.abertura`, que existe para barrar tempo NEGATIVO
   (dado corrompido), tambem elimina as linhas nulas que o `LEFT JOIN`
   introduziria. **Uma guarda protege duas coisas** — e isso e garantia
   estrutural, nao cobertura faltando.

   NOTA HONESTA: quando escrevi isto, afirmei que a mutacao que remove aquele
   `WHERE` "morre". Ela SOBREVIVEU na rodada seguinte — nenhum teste criava
   dado corrompido. **Afirmacao nao e teste**, pela quarta vez neste projeto, e
   desta vez a afirmacao estava no arquivo que existe para verificar
   afirmacoes. O teste foi escrito; agora ela morre de verdade.

3. **`veHistorico` -> `veChamadoDeTerceiro`.** As duas capacidades tem hoje a
   mesma politica (`['agente']`). A escolha de reusar `veHistorico` e semantica
   — a pergunta e a mesma —, e a 4.3 ja registrou que separacao que nao muda
   comportamento e mutacao que nao morre.

A quarta sobrevivente da primeira rodada ERA real: o filtro de periodo na
contagem de autores podia sumir sem nenhum teste notar, porque todos os outros
so criam acao DENTRO da janela. O efeito seria o SM-5 inflado — quem agiu ha
seis meses contaria como "operando no sistema", e a metrica erraria para o lado
OTIMISTA, que e o pior lado para uma metrica de decisao. Teste adicionado.

Conferencia previa de alvos ativa (herdada da 4.2). E CONFIRA `git status`
depois de rodar: script morto no meio deixa o repositorio mutado.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-44.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

REPO = "src/adapters/persistence/ticket-repository.ts"
QUERY = "src/application/queries/relatorio-de-operacao.ts"
VISIBILIDADE = "src/domain/visibilidade.ts"

MUTACOES = [
    # ---- O periodo: o filtro que, ausente, ninguem percebe ----
    (
        "O periodo nao filtra as aberturas (mede a base inteira)",
        REPO,
        "         WHERE a.acao = 'abrir_chamado'\n           AND a.registrado_em >= ${inicio}::timestamptz AND a.registrado_em < ${fim}::timestamptz",
        "         WHERE a.acao = 'abrir_chamado'",
    ),
    (
        "O periodo nao filtra a contagem de autores (SM-5 infla)",
        REPO,
        "        (SELECT count(DISTINCT a.autor)::int FROM audit_entries a\n          WHERE a.registrado_em >= ${inicio}::timestamptz AND a.registrado_em < ${fim}::timestamptz\n        ) AS autores_distintos",
        "        (SELECT count(DISTINCT a.autor)::int FROM audit_entries a\n        ) AS autores_distintos",
    ),
    (
        "Periodo invertido devolve vazio em vez de recusar",
        QUERY,
        "    if (de >= ate) {",
        "    if (false) {",
    ),
    (
        "O padrao deixa de ser 30 dias",
        QUERY,
        "        ? new Date(ate.getTime() - DIAS_PADRAO_DO_RELATORIO * MS_POR_DIA)",
        "        ? new Date(0)",
    ),
    (
        "A busca por resolucoes ganha limite SUPERIOR (o que resolve depois some)",
        REPO,
        "           AND a.registrado_em >= ${inicio}::timestamptz\n           -- SEM limite superior",
        "           AND a.registrado_em >= ${inicio}::timestamptz AND a.registrado_em < ${fim}::timestamptz\n           -- SEM limite superior",
    ),
    # ---- A regra da reabertura: o defeito que MELHORA o numero ----
    (
        "Reabertura usa o PRIMEIRO resolvido (a metrica melhora quando o atendimento piora)",
        REPO,
        "        SELECT a.ticket_number, max(a.registrado_em) AS resolucao",
        "        SELECT a.ticket_number, min(a.registrado_em) AS resolucao",
    ),
    # ---- O que NAO pode entrar na media ----
    (
        "Resolucao anterior a abertura entra como tempo NEGATIVO",
        REPO,
        "         WHERE r.resolucao >= ab.abertura",
        "",
    ),
    (
        "A contagem de sem-resolucao some do relatorio",
        REPO,
        "          WHERE NOT EXISTS (SELECT 1 FROM resolucoes r WHERE r.ticket_number = ab.ticket_number)",
        "          WHERE false",
    ),
    # ---- O excluido (FR-23): `audit_entries` nao tem `deleted_at` ----
    (
        "Chamado excluido volta para a contagem",
        REPO,
        "          JOIN tickets t ON t.number = a.ticket_number AND t.deleted_at IS NULL",
        "          JOIN tickets t ON t.number = a.ticket_number",
    ),
    # ---- Mediana e media: as duas, e nao uma ----
    (
        "A mediana passa a ser a media (some o numero honesto)",
        REPO,
        "        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY horas) FROM tempos) AS mediana_horas",
        "        (SELECT avg(horas) FROM tempos) AS mediana_horas",
    ),
    (
        "Base vazia devolve 0 em vez de nulo ('resolveu em 0h' != 'nao resolveu')",
        REPO,
        "      v === null || v === undefined ? null : Number(v)",
        "      Number(v ?? 0)",
    ),
    (
        "Sem acao nenhuma, o percentual via MCP vira 0% em vez de nulo",
        QUERY,
        "          totalDeAcoes === 0\n            ? null",
        "          false\n            ? null",
    ),
    # ---- Autorizacao (AD-8) ----
    (
        "Qualquer um passa a ver o relatorio",
        VISIBILIDADE,
        "): MedidasDaOperacao | null => (pode(quem.role, 'veHistorico') ? bruto[conteudo] : null)",
        "): MedidasDaOperacao | null => bruto[conteudo]",
    ),
    (
        "Sem permissao devolve relatorio vazio em vez de recusar",
        QUERY,
        "    if (medidas === null) {",
        "    if (false && medidas === null) {",
    ),
]


def conferir_alvos() -> list[str]:
    ausentes = []
    cache: dict[str, str] = {}
    for nome, arquivo, alvo, _ in MUTACOES:
        if arquivo not in cache:
            cache[arquivo] = (RAIZ / arquivo).read_text()
        if alvo not in cache[arquivo]:
            ausentes.append(f"{nome}  [{arquivo}]")
    return ausentes


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-44.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-44.json").read_text())
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
    ausentes = conferir_alvos()
    if ausentes:
        print("SCRIPT DESATUALIZADO — estes alvos nao existem mais no codigo:")
        for a in ausentes:
            print(f"  !! {a}")
        print("\nIsto NAO e mutacao sobrevivente: e o script apontando para codigo")
        print("que mudou. Corrija os alvos e rode de novo.")
        return 2

    resultados = []
    for nome, arquivo, alvo, troca in MUTACOES:
        caminho = RAIZ / arquivo
        original = caminho.read_text()
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
