<!--
Titulo do PR: use conventional commits (ex.: "feat: abre Chamado via MCP").
O merge e squash, entao ESTE TITULO vira a mensagem do commit na main.
-->

## O que muda

<!-- Uma frase objetiva. O que passa a existir, ou a funcionar diferente. -->

## Por que

<!-- O problema que isso resolve. Se houver decisao com trade-off, registre aqui:
     o que foi escolhido, o que foi descartado e por que. -->

## Story / FR

<!-- OBRIGATORIO. O job `traceability` reprova o PR sem referencia preenchida.
     Formato: a palavra Story seguida de <epico>.<numero>, ou FR-<numero>.
     Substitua a linha abaixo pela referencia real. -->

Story _._ — <titulo da story>

## Como foi verificado

<!-- Nao basta "os testes passam". Diga o que voce executou e o que observou.
     Se a mudanca adiciona um gate, prove que ele REPROVA quando deve:
     verde nao e evidencia. -->

- [ ] Regressão local: `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm arch`
- [ ] Novos gates provados por violação deliberada, com os demais jobs verdes

## Riscos e o que ficou de fora

<!-- Limitacoes conhecidas, decisoes adiadas, coisas que a story NAO cobre.
     Escopo declarado nao e escopo escondido. -->

<!-- Teste de canal do review por IA — Story 0.6. Revertido em seguida. -->
