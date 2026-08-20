#!/usr/bin/env python3
"""
Verificacao por mutacao — Story 4.3 (Soft-delete completo).

A story fecha o buraco da FR-23 e traz o AD-7 para as exclusoes. As mutacoes
atacam quatro frentes:

1. **A exclusao e LOGICA** — trocar por DELETE fisico, ou nao marcar.
2. **O ALVO da exclusao** — o `UPDATE` do Comentario tem de casar `id` E
   `ticket_number`; sem o segundo, um id de outro Chamado passa pelo gargalo de
   visibilidade do Chamado que quem chama informou.
3. **O Usuario excluido deixa de existir nos SEIS caminhos** — e cada uma das
   tres camadas do `identity-repository` e mutada SOZINHA, porque a redundancia
   que protege tambem esconde (licao da 3.1, 3.6 e 4.2).
4. **O AD-7** — sem confirmacao nada acontece, e o token amarra o objeto exato.

**A conferencia previa de alvos** (introduzida na 4.2) roda antes de qualquer
coisa: o alvo evaporou em tres rodadas seguidas daquela story, sempre por
refatoracao propria, e o script perdia 40 minutos para reportar isso junto com
as sobreviventes — misturando "o script esta desatualizado" com "falta teste".

DUAS MUTACOES ESTAO DELIBERADAMENTE FORA, e o motivo e o mesmo nas duas: elas
nao tem efeito observavel, entao sobreviveriam a qualquer teste. Sobrevivente
por ausencia de efeito e sintoma de mutacao mal formulada, nao de teste
faltando — o projeto ja registrou isso em `transicoes.ts` e na 4.2.

1. **Trocar `excluiComentario` por `excluiChamado` no command.** As duas
   capacidades tem HOJE a mesma politica (`['agente']`), entao a troca nao muda
   nada. A separacao existe por uma razao FUTURA — quando houver um papel de
   Gestor, ela aparece de uma vez —, e e a mesma aposta que separou
   `atribuiChamado` de `recebeAtribuicao` (2.3). Um teste que a "cobrisse"
   estaria comparando a tabela consigo mesma.

2. **Distinguir "Usuario inexistente" de "ja excluido".** Os dois convergem no
   MESMO ramo por construcao: `buscarUsuarioPorEmail` filtra o excluido, entao
   ele chega ao command como `null`, identico a inexistente. Nao existe defeito
   que os separe sem antes desligar aquele filtro — que TEM mutacao propria
   aqui ("Camada 1") e morre. A garantia e ESTRUTURAL, nao comportamental: e
   mais forte que um teste, porque nao depende de ninguem lembrar de escrever
   um.

A terceira sobrevivente da primeira rodada ERA real e foi corrigida: "excluir
Usuario ja excluido registra de novo" passava porque o command chama
`buscarUsuarioPorEmail` antes, e o gargalo dele mascarava o defeito do adapter.
E a oitava vez que esse padrao aparece no projeto. O teste novo chama o
REPOSITORIO direto — o port e publico, e o adapter HTTP da Fase 1.5 pode
chama-lo sem command nenhum na frente.

E CONFIRA `git status` DEPOIS DE RODAR: se este script for morto no meio, ele
deixa o repositorio mutado. O `finally` restaura; `finally` nao roda quando o
processo morre. Na 4.2 o que ficou aplicado foi justamente a mutacao que
inverte o AD-4.

Uso:
  source ~/.nvm/nvm.sh && nvm use 24 && corepack enable
  export DATABASE_URL='postgres://servicedesk:servicedesk@localhost:5432/servicedesk'
  python3 scratchpad/mutacoes-43.py
"""

import json
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent

IDENT = "src/adapters/persistence/identity-repository.ts"
REPO = "src/adapters/persistence/ticket-repository.ts"
CMD_COMENTARIO = "src/application/commands/excluir-comentario.ts"
CMD_CHAMADO = "src/application/commands/excluir-chamado.ts"
CMD_USUARIO = "src/application/commands/excluir-usuario.ts"
PAPEIS = "src/domain/papeis.ts"
ALVO = "src/domain/alvo-de-confirmacao.ts"
VISIBILIDADE = "src/domain/visibilidade.ts"

MUTACOES = [
    # ---- 1. A exclusao e LOGICA, nunca fisica ----
    (
        "Excluir Comentario vira DELETE fisico",
        REPO,
        "      const [linha] = await tx\n        .update(comments)\n        .set({ deletedAt: sql`now()` })",
        "      const [linha] = await tx\n        .update(comments)\n        .set({ corpo: comments.corpo })",
    ),
    (
        "Excluir Usuario nao marca nada",
        IDENT,
        "        .set({ deletedAt: sql`now()` })",
        "        .set({ papel: users.papel })",
    ),
    # ---- 2. O ALVO da exclusao do Comentario ----
    (
        "O `numero` sai do WHERE: id de OUTRO Chamado passa a ser excluivel",
        REPO,
        "            eq(comments.ticketNumber, numero),",
        "",
    ),
    (
        "Comentario ja excluido e 'excluido' de novo (Log duplicado)",
        REPO,
        "            isNull(comments.deletedAt),",
        "",
    ),
    (
        "Exclusao que nao aconteceu vira registro no Log",
        REPO,
        "      if (linha === undefined) {\n        // Nao havia o que excluir. Sem linha de auditoria, pelo mesmo motivo da\n        // exclusao de Chamado (1.7): exclusao que nao aconteceu nao vira Log.\n        return false\n      }",
        "      if (false) {\n        return false\n      }\n      if (linha === undefined) {\n        await tx.insert(auditEntries).values({\n          ticketNumber: numero,\n          acao: 'excluir_comentario',\n          autor: autor.identity,\n          origin: autor.origin,\n        })\n        return false\n      }",
    ),
    (
        "A exclusao do Comentario nao vai para o Log",
        REPO,
        "      await tx.insert(auditEntries).values({\n        ticketNumber: numero,\n        acao: 'excluir_comentario',",
        "      await Promise.resolve({\n        ticketNumber: numero,\n        acao: 'excluir_comentario',",
    ),
    (
        "O Log registra o autor do Comentario em vez de quem excluiu",
        REPO,
        "        acao: 'excluir_comentario',\n        // AD-9: quem excluiu, nunca o nome da tool.\n        autor: autor.identity,",
        "        acao: 'excluir_comentario',\n        autor: 'sistema',",
    ),
    # ---- 3. O Usuario excluido, UMA camada por vez ----
    (
        "Camada 1: `buscarUsuarioPorEmail` deixa de filtrar o excluido",
        IDENT,
        "      .where(and(eq(users.email, email), isNull(users.deletedAt)))\n      .limit(1)",
        "      .where(eq(users.email, email))\n      .limit(1)",
    ),
    (
        "Camada 2: a SESSAO ja aberta continua valendo depois da exclusao",
        IDENT,
        "      .innerJoin(users, and(eq(users.email, sessions.email), isNull(users.deletedAt)))",
        "      .innerJoin(users, eq(users.email, sessions.email))",
    ),
    (
        "Camada 3: o token MCP de quem saiu continua resolvendo",
        IDENT,
        "      .innerJoin(users, and(eq(users.email, mcpTokens.identity), isNull(users.deletedAt)))",
        "      .innerJoin(users, eq(users.email, mcpTokens.identity))",
    ),
    (
        "A exclusao do Usuario nao vai para o Log",
        IDENT,
        "      await tx.insert(auditEntries).values({",
        "      await Promise.resolve({",
    ),
    (
        "O Log da exclusao de Usuario nao diz QUEM foi excluido",
        IDENT,
        "        de: email,\n        para: 'excluido',",
        "        de: null,\n        para: null,",
    ),
    (
        "A exclusao de Usuario inventa um Chamado no Log",
        IDENT,
        "        ticketNumber: null,",
        "        ticketNumber: 1,",
    ),
    (
        "Excluir Usuario ja excluido registra de novo",
        IDENT,
        "        .where(and(eq(users.email, email), isNull(users.deletedAt)))\n        .returning({ email: users.email })",
        "        .where(eq(users.email, email))\n        .returning({ email: users.email })",
    ),
    # ---- 4. O AD-7: sem confirmacao, nada acontece ----
    (
        "Excluir Chamado deixa de exigir confirmacao",
        CMD_CHAMADO,
        "    if (input.confirmacao === undefined) {",
        "    if (false) {",
    ),
    (
        "Excluir Chamado aceita QUALQUER confirmacao",
        CMD_CHAMADO,
        "    if (!valeu) {\n      throw confirmacaoNecessaria(input.numero)\n    }",
        "    if (false) {\n      throw confirmacaoNecessaria(input.numero)\n    }",
    ),
    (
        "Excluir Comentario deixa de exigir confirmacao",
        CMD_COMENTARIO,
        "    if (input.confirmacao === undefined) {",
        "    if (false) {",
    ),
    (
        "Excluir Comentario aceita QUALQUER confirmacao",
        CMD_COMENTARIO,
        "    if (!valeu) {\n      throw confirmacaoNecessaria(input.numero, input.id)\n    }",
        "    if (false) {\n      throw confirmacaoNecessaria(input.numero, input.id)\n    }",
    ),
    (
        "Excluir Usuario deixa de exigir confirmacao",
        CMD_USUARIO,
        "    if (input.confirmacao === undefined) {",
        "    if (false) {",
    ),
    (
        "Excluir Usuario aceita QUALQUER confirmacao",
        CMD_USUARIO,
        "    if (!valeu) {\n      throw confirmacaoNecessaria(alvo.email)\n    }",
        "    if (false) {\n      throw confirmacaoNecessaria(alvo.email)\n    }",
    ),
    (
        "Cracha para quem nao entra: emitir token antes de autorizar (Comentario)",
        CMD_COMENTARIO,
        "    if (!pode(autor.role, 'excluiComentario')) {",
        "    if (false && !pode(autor.role, 'excluiComentario')) {",
    ),
    (
        "Cracha para quem nao entra: emitir token antes de autorizar (Usuario)",
        CMD_USUARIO,
        "    if (!pode(autor.role, 'excluiUsuario')) {",
        "    if (false && !pode(autor.role, 'excluiUsuario')) {",
    ),
    # ---- O ESCOPO do token: o que impede reusar um aval por outro ----
    (
        "O alvo do Comentario ignora o Chamado (token serve para qualquer um)",
        ALVO,
        "  alvo(`comentario:${numeroDoChamado}/${id}`)",
        "  alvo(`comentario:${id}`)",
    ),
    (
        "O alvo do Usuario vira generico (um token exclui qualquer pessoa)",
        ALVO,
        "export const alvoDoUsuario = (email: string): AlvoDeConfirmacao => alvo(`usuario:${email}`)",
        "export const alvoDoUsuario = (_email: string): AlvoDeConfirmacao => alvo('usuario')",
    ),
    (
        "O alvo do Chamado vira generico",
        ALVO,
        "export const alvoDoChamado = (numero: number): AlvoDeConfirmacao => alvo(`chamado:${numero}`)",
        "export const alvoDoChamado = (_numero: number): AlvoDeConfirmacao => alvo('chamado')",
    ),
    # ---- Autorizacao (AD-8) ----
    (
        "Solicitante ganha permissao de excluir Comentario",
        PAPEIS,
        "  excluiComentario: ['agente'],",
        "  excluiComentario: ['agente', 'solicitante'],",
    ),
    (
        "Solicitante ganha permissao de excluir Usuario",
        PAPEIS,
        "  excluiUsuario: ['agente'],",
        "  excluiUsuario: ['agente', 'solicitante'],",
    ),
    (
        "Pular o gargalo de visibilidade do Chamado ao excluir Comentario",
        CMD_COMENTARIO,
        "    if (visivel === null) {\n      throw ticketNaoEncontrado(input.numero)\n    }",
        "    if (bruto === null) {\n      throw ticketNaoEncontrado(input.numero)\n    }",
    ),
    (
        "Excluir a si mesmo passa a ser permitido",
        CMD_USUARIO,
        "    if (alvo.email === autor.identity) {",
        "    if (false) {",
    ),
    # ---- O relatorio do que ficou parado ----
    (
        "O relatorio conta Chamado ENCERRADO como trabalho parado",
        REPO,
        "          notInArray(tickets.status, [...STATUS_ENCERRADOS]),",
        "",
    ),
    (
        "O relatorio conta Chamado de OUTRO Dono",
        REPO,
        "          eq(tickets.assignee, email),",
        "",
    ),
    # ---- O Log diz sobre QUE OBJETO foi a acao (achado do review, PR #81) ----
    (
        "O PEDIDO de confirmacao nao grava o alvo (tentativa nao concluida some do Log)",
        "src/adapters/persistence/confirmacao-repository.ts",
        "        alvo,\n      })",
        "        alvo: null,\n      })",
    ),
    (
        "A execucao da exclusao de Usuario nao grava o alvo (nao pareia com o pedido)",
        IDENT,
        "        alvo: alvoDoUsuario(email),",
        "        alvo: null,",
    ),
    (
        "O Log nao diz QUAL Comentario foi excluido",
        REPO,
        "        alvo: alvoDoComentario(numero, id),",
        "        alvo: null,",
    ),
    (
        "O contrato de saida diverge do que o command devolve (achado do #81)",
        "src/application/contracts/excluir.ts",
        "  number: z.number().int().positive(),\n})\n\nexport const excluirComentarioInputSchema",
        "  numero: z.number().int().positive(),\n})\n\nexport const excluirComentarioInputSchema",
    ),
    # ---- O Comentario excluido some da thread ----
    (
        "Comentario excluido volta a aparecer na thread",
        VISIBILIDADE,
        "  const vivos = comentarios.filter((c) => c.excluidoEm === null)",
        "  const vivos = comentarios",
    ),
    (
        "O `id` do Comentario para de chegar a quem le",
        REPO,
        "      id: c.id,\n      autor: c.autor,",
        "      id: 0,\n      autor: c.autor,",
    ),
]


def conferir_alvos() -> list[str]:
    """
    Todos os alvos existem, ANTES de rodar qualquer coisa.

    Nasceu de seis ocorrencias do mesmo acidente na Story 4.2: o alvo evapora
    quando o codigo muda, e o script antigo so descobria isso no meio da
    rodada — reportando-o junto com as mutacoes sobreviventes, que e um
    problema DIFERENTE e pede acao diferente.
    """
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
        ["pnpm", "vitest", "run", "--reporter=json", "--outputFile=/tmp/mut-43.json"],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )
    try:
        dados = json.loads(pathlib.Path("/tmp/mut-43.json").read_text())
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
