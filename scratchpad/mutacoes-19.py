#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 1.9 (intake por e-mail).

Cada mutacao quebra uma garantia de proposito e roda a suite. Se nenhum teste
reprovar, a garantia nao estava protegida: o teste que existia passava por
acaso. E o unico jeito de saber se a cobertura tem dentes.

Uso: source ~/.nvm/nvm.sh && nvm use 24 && python3 scratchpad/mutacoes-19.py
"""

import pathlib
import re
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

INTAKE = "src/application/commands/abrir-chamado-por-email.ts"
MENSAGEM = "src/adapters/email/mensagem.ts"
VARREDURA = "src/adapters/email/varredura.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
IMAP = "src/adapters/email/imap.ts"

MUTACOES = [
    (
        "Aceitar mensagem nao autenticada",
        INTAKE,
        "if (mensagem.autenticacao !== 'aprovada') {",
        "if (false) {",
    ),
    # Esta e uma REORDENACAO de verdade, e nao a remocao da checagem (que seria
    # so uma variante da mutacao anterior): o bloco sai de cima e entra depois
    # da busca no cadastro. So um teste distingue as duas situacoes.
    (
        "Checar cadastro ANTES da autenticidade (ordem trocada)",
        INTAKE,
        "    if (usuario === null) {\n      return recusar('remetente_desconhecido')\n    }\n",
        "    if (usuario === null) {\n      return recusar('remetente_desconhecido')\n    }\n"
        "\n    if (mensagem.autenticacao !== 'aprovada') {\n"
        "      return recusar('autenticidade')\n    }\n",
        # O bloco original tambem precisa sair de cima; ver PRE_MUTACAO abaixo.
        "    if (mensagem.autenticacao !== 'aprovada') {\n      return recusar('autenticidade')\n    }\n\n",
    ),
    (
        "Usar o From cru como identidade, em vez do cadastro",
        INTAKE,
        "identity: usuario.email,",
        "identity: mensagem.de,",
    ),
    (
        "Carimbar origin api em vez de email",
        INTAKE,
        "origin: 'email',",
        "origin: 'api',",
    ),
    (
        "Ignorar a deduplicacao previa",
        INTAKE,
        "if (jaProcessada !== null) {",
        "if (false) {",
    ),
    (
        "Nao gravar o vinculo da mensagem na abertura",
        INTAKE,
        "{ messageId: mensagem.messageId },",
        "undefined,",
    ),
    (
        "Aceitar spf=pass sozinho como autenticacao valida",
        MENSAGEM,
        "return passou('dmarc') || passou('dkim') ? 'aprovada' : 'reprovada'",
        "return passou('dmarc') || passou('dkim') || passou('spf') ? 'aprovada' : 'reprovada'",
    ),
    (
        "Ler o ULTIMO Authentication-Results (aceita cabecalho forjado)",
        MENSAGEM,
        "if (Array.isArray(valor) && typeof valor[0] === 'string') return valor[0]",
        "if (Array.isArray(valor)) return valor.at(-1) as string | undefined",
    ),
    (
        "Tratar ausencia de autenticacao como aprovada",
        MENSAGEM,
        "return 'ausente'",
        "return 'aprovada'",
    ),
    (
        "Marcar como processada mesmo quando o processamento falha",
        VARREDURA,
        "logger.erro('falha_ao_processar_mensagem', {",
        "await caixa.marcarProcessada(bruta.id)\n        logger.erro('falha_ao_processar_mensagem', {",
    ),
    (
        "Abortar o lote na primeira falha",
        VARREDURA,
        "      } catch (erro) {\n        falhas += 1",
        "      } catch (erro) {\n        falhas += 1\n        throw erro",
    ),
    (
        "Gravar o vinculo FORA da transacao da abertura",
        REPO,
        "if (ehViolacaoDeUnicidade(erro)) {",
        "if (false) {",
    ),
    (
        "Remover o teto de mensagens por varredura",
        IMAP,
        "if (mensagens.length >= MAXIMO_POR_VARREDURA) break",
        "",
    ),
    (
        "Nao fazer logout quando a operacao falha",
        IMAP,
        "    } finally {\n      await cliente.logout()\n    }",
        "    } catch (erro) {\n      throw erro\n    }",
    ),
]


def rodar_suite() -> tuple[bool, list[str]]:
    r = subprocess.run(
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-19.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    import json

    try:
        dados = json.loads(pathlib.Path("/tmp/mut-19.json").read_text())
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

    for nome, arquivo, alvo, troca, *extra in MUTACOES:
        caminho = RAIZ / arquivo
        original = caminho.read_text()

        if alvo not in original:
            print(f"!! ALVO NAO ENCONTRADO: {nome} ({arquivo})")
            resultados.append((nome, False, ["<alvo nao encontrado>"]))
            continue

        mutado = original.replace(alvo, troca, 1)

        # Quinto elemento opcional: trecho a REMOVER alem da substituicao. Serve
        # para mutacoes que movem codigo de lugar em vez de so troca-lo.
        if extra:
            remover = extra[0]
            if remover not in mutado:
                print(f"!! TRECHO A REMOVER NAO ENCONTRADO: {nome}")
                resultados.append((nome, False, ["<trecho a remover nao encontrado>"]))
                continue
            mutado = mutado.replace(remover, "", 1)

        caminho.write_text(mutado)
        try:
            reprovou, quais = rodar_suite()
        finally:
            caminho.write_text(original)

        marca = "OK " if reprovou else "!! "
        print(f"{marca}{nome}: {len(quais)} teste(s) reprovaram")
        for q in quais[:3]:
            print(f"     - {q}")
        resultados.append((nome, reprovou, quais))

    print("\n| Mutacao aplicada | Reprovou |")
    print("| --- | --- |")
    for nome, reprovou, quais in resultados:
        print(f"| {nome} | {len(quais)} teste(s)" if reprovou else f"| {nome} | **NAO REPROVOU**")

    sobreviventes = [n for n, ok, _ in resultados if not ok]
    if sobreviventes:
        print(f"\nMUTACOES SOBREVIVENTES: {len(sobreviventes)}")
        return 1

    print("\nTodas as mutacoes foram reprovadas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
