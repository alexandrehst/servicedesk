#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 4.2 (Import CSV de migracao).

O risco desta story e diferente das anteriores: o dado vem de FORA. As mutacoes
atacam (a) a validacao que separa linha boa de linha ruim, (b) a idempotencia
que impede o reimport de duplicar, (c) o AD-4 (Numero da sequence), (d) o AD-3
(auditoria com quem TROUXE o Chamado) e (e) o AD-8 (quem pode importar).

Repare no grupo do RELATORIO. Ele existe porque contar aceitas nao distingue
"rejeitou a linha" de "nao processou a linha": sem asserção sobre o motivo e o
numero da linha, uma mutacao que engole o erro sobrevive.

Uma mutacao NAO esta aqui, de proposito: remover a consulta previa de
`numero_legado` no adapter. Ela nao muda nada observavel — o `catch` de
unicidade produz o mesmo relatorio — e o que ela evita e ruido no log do
Postgres num reimport inteiro. Uma mutacao que a apagasse sobreviveria, e
sobrevivente por ausencia de efeito e sintoma de teste inventado, nao de teste
faltando.

Alvos escritos DEPOIS de `pnpm biome check --write` (licao repetida na 2.4,
3.2 e 4.1: o formatador evapora o alvo).

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-42.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

COMMAND = "src/application/commands/importar-csv.ts"
DOMINIO = "src/domain/importacao.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
CSV = "src/platform/csv/csv.ts"
PAPEIS = "src/domain/papeis.ts"

MUTACOES = [
    # ---- AD-4: o Numero e deste sistema ----
    (
        "O Numero passa a vir do arquivo (AD-4 contornado)",
        REPO,
        "            number: sql`nextval('ticket_number_seq')`,",
        "            number: sql`coalesce(nullif(${novo.numeroLegado}, '')::integer, nextval('ticket_number_seq'))`,",
    ),
    (
        "O numero_legado nao e gravado (nao ha como ligar ao sistema antigo)",
        REPO,
        "            numeroLegado: novo.numeroLegado,",
        "",
    ),
    # ---- Idempotencia: o reimport nao pode duplicar ----
    (
        "Violacao de unicidade vira ERRO (o lote inteiro cai no reimport)",
        REPO,
        "        if (ehViolacaoDeUnicidade(erro)) {\n          return null\n        }",
        "        if (false) {\n          return null\n        }",
    ),
    (
        "Repetida e contada como aceita",
        COMMAND,
        "        if (resultado.value === null) {",
        "      if (false) {",
    ),
    # ---- O relatorio: a unica prova de que a validacao rodou ----
    (
        "Linha invalida e ignorada em silencio (some do relatorio)",
        COMMAND,
        "        rejeitadas.push({\n          linha,\n          numeroLegado: bruta.numero_legado ?? '',\n          motivo: resultado.motivo,\n        })",
        "        void 0",
    ),
    (
        "O motivo da rejeicao vira generico",
        COMMAND,
        "          motivo: resultado.motivo,",
        "          motivo: 'linha invalida',",
    ),
    (
        "O numero da linha ignora o cabecalho (aponta para a linha errada)",
        COMMAND,
        "      const linha = indice + 2",
        "      const linha = indice + 1",
    ),
    (
        "Linha invalida ABORTA o lote (a AC #2 deixa de valer)",
        COMMAND,
        "      if (!resultado.ok) {",
        "      if (!resultado.ok && (() => { throw new Error(resultado.motivo) })()) {",
    ),
    (
        "O aviso de 'sem data original' some do relatorio",
        COMMAND,
        "        if (novo.criadoEm === undefined) {",
        "      if (false) {",
    ),
    # ---- A validacao do dominio ----
    (
        "numero_legado vazio passa (o reimport duplicaria)",
        DOMINIO,
        "  if (numeroLegado.length === 0) {",
        "  if (false) {",
    ),
    (
        "Titulo vazio passa",
        DOMINIO,
        "  if (titulo.length === 0) {",
        "  if (false) {",
    ),
    (
        "Solicitante vazio passa (Chamado sem dono conhecido)",
        DOMINIO,
        "  if (requester.length === 0) {",
        "  if (false) {",
    ),
    (
        "Categoria desconhecida cai no default (a informacao some)",
        DOMINIO,
        "  const categoria = categoriaBruta === '' ? 'nao_classificado' : categoriaBruta\n  if (!ehCategoria(categoria)) {",
        "  const categoria = ehCategoria(categoriaBruta) ? categoriaBruta : 'nao_classificado'\n  if (false) {",
    ),
    (
        "Status desconhecido vira 'aberto' (Chamado fechado volta a fila)",
        DOMINIO,
        "  const status = statusBruto === '' ? 'aberto' : statusBruto\n  if (!(STATUS as readonly string[]).includes(status)) {",
        "  const status = (STATUS as readonly string[]).includes(statusBruto) ? statusBruto : 'aberto'\n  if (false) {",
    ),
    (
        "Prioridade desconhecida vira a padrao",
        DOMINIO,
        "  if (!(PRIORIDADES as readonly string[]).includes(prioridade)) {",
        "  if (false) {",
    ),
    (
        "Data invalida vira 'agora' (historico errado, e ninguem descobre)",
        DOMINIO,
        "  if (criadoEm !== undefined && Number.isNaN(criadoEm.getTime())) {",
        "  if (false) {",
    ),
    (
        "A data do arquivo e ignorada (todo Chamado nasce hoje)",
        REPO,
        "            ...(novo.criadoEm === undefined ? {} : { criadoEm: novo.criadoEm }),",
        "",
    ),
    (
        "O status do arquivo e ignorado (tudo entra como aberto)",
        REPO,
        "            status: novo.status,",
        "            status: 'aberto',",
    ),
    # ---- AD-3 / AD-9: quem trouxe o Chamado responde ----
    (
        "A abertura do importado nao vai para o Log",
        REPO,
        "        await tx.insert(auditEntries).values({\n          ticketNumber: linha.number,\n          acao: 'abrir_chamado',",
        "        await Promise.resolve({\n          ticketNumber: linha.number,\n          acao: 'abrir_chamado',",
    ),
    (
        "O Log registra o solicitante em vez de quem importou",
        REPO,
        "          autor: autor.identity,\n          origin: autor.origin,\n        })\n\n        return { number: linha.number }",
        "          autor: novo.requester,\n          origin: autor.origin,\n        })\n\n        return { number: linha.number }",
    ),
    (
        "O requester passa a ser quem importou (o Chamado troca de dono)",
        REPO,
        "            requester: novo.requester,",
        "            requester: autor.identity,",
    ),
    # ---- AD-8: quem pode importar ----
    (
        "REMOVER a checagem de permissao (qualquer um importa)",
        COMMAND,
        "    if (!pode(autor.role, 'importa')) {",
        "    if (false) {",
    ),
    (
        "Solicitante ganha a capacidade de importar",
        PAPEIS,
        "  importa: ['agente'],",
        "  importa: ['agente', 'solicitante'],",
    ),
    # ---- O que o LOTE PARALELO introduziu (achado do claude-review, PR #79) ----
    (
        "O relatorio sai na ordem em que o banco respondeu, nao na do arquivo",
        COMMAND,
        "      aceitas: porLinha(aceitas),\n      repetidas: porLinha(repetidas),\n      rejeitadas: porLinha(rejeitadas),",
        "      aceitas,\n      repetidas,\n      rejeitadas,",
    ),
    (
        "Duplicata dentro do arquivo vai ao banco e o vencedor vira sorteio",
        COMMAND,
        "      if (jaNoLote.has(resultado.novo.numeroLegado)) {",
        "      if (false) {",
    ),
    (
        "O lote pula a ultima fatia (arquivo maior que LINHAS_POR_LOTE)",
        COMMAND,
        "    for (let inicio = 0; inicio < pendentes.length; inicio += LINHAS_POR_LOTE) {",
        "    for (let inicio = 0; inicio + LINHAS_POR_LOTE <= pendentes.length; inicio += LINHAS_POR_LOTE) {",
    ),
    (
        "O lote reprocessa a primeira fatia (avanco errado)",
        COMMAND,
        "      const lote = pendentes.slice(inicio, inicio + LINHAS_POR_LOTE)",
        "      const lote = pendentes.slice(0, LINHAS_POR_LOTE)",
    ),
    # ---- O erro GENUINO do banco no meio do lote (2o achado do review, PR #79) ----
    (
        "Uma falha de banco derruba o import inteiro (`all` no lugar de `allSettled`)",
        COMMAND,
        "      const gravadas = await Promise.allSettled(",
        "      const gravadas = await Promise.all(",
    ),
    (
        "A falha some do relatorio (o operador nao sabe o que nao entrou)",
        COMMAND,
        "          falhas.push({ linha, numeroLegado: novo.numeroLegado, erro: causa })",
        "          void 0",
    ),
    (
        "Falha e classificada como rejeitada (perde-se a acao que ela pede)",
        COMMAND,
        "          falhas.push({ linha, numeroLegado: novo.numeroLegado, erro: causa })",
        "          rejeitadas.push({ linha, numeroLegado: novo.numeroLegado, motivo: 'falhou' })",
    ),
    (
        "A causa da falha vira texto generico",
        COMMAND,
        "const mensagem = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro))",
        "const mensagem = (_erro: unknown): string => 'falhou'",
    ),
    # ---- A falha tambem vai para o LOG (3o achado do review, PR #79) ----
    (
        "A falha nao e registrada no log (so o relatorio sincrono a conhece)",
        COMMAND,
        "          logger.erro('falha_ao_importar_linha', {",
        "          void ({",
    ),
    (
        "O log leva o TITULO da linha (AD-9: dado do Solicitante vaza no log)",
        COMMAND,
        "            numero_legado: novo.numeroLegado,\n            causa,",
        "            numero_legado: novo.numeroLegado,\n            titulo: novo.titulo,\n            causa,",
    ),
    (
        "Linha rejeitada tambem vira erro no log (treina quem monitora a ignorar erro)",
        COMMAND,
        "        rejeitadas.push({\n          linha,\n          numeroLegado: bruta.numero_legado ?? '',\n          motivo: resultado.motivo,\n        })",
        "        logger.erro('falha_ao_importar_linha', { linha, numero_legado: '', causa: 'x' })\n        rejeitadas.push({\n          linha,\n          numeroLegado: bruta.numero_legado ?? '',\n          motivo: resultado.motivo,\n        })",
    ),
    # ---- O parser: o dado vem de FORA ----
    (
        "Campo entre aspas perde o tratamento (virgula quebra a linha)",
        CSV,
        "    if (dentroDeAspas) {",
        "    if (false) {",
    ),
    (
        "Aspas dobradas deixam de virar uma so",
        CSV,
        '        if (texto[i + 1] === \'"\') {',
        "        if (false) {",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-42.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-42.json").read_text())
    except Exception:
        return (r.returncode != 0, ["<sem relatorio: falha de compilacao>"])

    reprovados = [
        t["fullName"]
        for arq in dados.get("testResults", [])
        for t in arq.get("assertionResults", [])
        if t.get("status") == "failed"
    ]
    return (len(reprovados) > 0, reprovados)


def conferir_alvos() -> list[str]:
    """
    Todos os alvos existem, ANTES de rodar qualquer coisa.

    Esta funcao nasceu de quatro ocorrencias do mesmo acidente: o alvo evapora
    quando o codigo muda — duas vezes pelo formatador, duas pela minha propria
    refatoracao (o `for` virou lote; `Promise.all` virou `allSettled`). O
    script antigo descobria isso 40 minutos depois, no meio da rodada, e
    reportava o alvo ausente junto com as mutacoes sobreviventes — misturando
    "o script esta desatualizado" com "falta teste", que sao problemas
    diferentes e pedem acoes diferentes.

    Toda mudanca no codigo e mudanca nos alvos. Agora isso aparece em um
    segundo, e o script se recusa a rodar.
    """
    ausentes = []
    cache: dict[str, str] = {}
    for nome, arquivo, alvo, _ in MUTACOES:
        if arquivo not in cache:
            cache[arquivo] = (RAIZ / arquivo).read_text()
        if alvo not in cache[arquivo]:
            ausentes.append(f"{nome}  [{arquivo}]")
    return ausentes


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
