# Checklist de paridade — antes de cortar o contrato

**Criada na Story 4.4.** Este documento existe porque a decisão de desligar o
software contratado **não é tomada por código**, e fingir que é seria o erro
mais caro do projeto.

O ServiceDesk mede sozinho metade do que o corte exige — a metade que acontece
dentro dele. A outra metade depende de alguém olhando o mundo real. Esta
checklist é essa outra metade, em forma verificável.

---

## Como usar

Cada item tem **o que verificar**, **o que conta como aprovado** e **quem
responde**. Um item sem responsável não é um item: é uma esperança.

Marque `[x]` só quando o critério estiver satisfeito **e observado** — não
quando parecer provável. O objetivo não é a checklist ficar verde; é ela ficar
verde por motivo verdadeiro.

**Nada aqui é medido pelo sistema.** O que o sistema mede está na tool
`relatorio_de_operacao`, e os números dela alimentam os itens marcados com 📊.

---

## Parte 0 — O que precisa existir ANTES de começar

Sem estes dois, o resto da checklist não pode ser avaliado. Os dois são
**pré-condições**, não tarefas do desenvolvimento.

- [ ] **A lista de tipos de Chamado que hoje passam pelo contratado**
  - **Verificar:** exportar ou levantar, do software atual, a lista de
    categorias/tipos usados nos últimos 3 meses, com o volume de cada um.
  - **Aprovado quando:** a lista existe, está datada, e cobre ≥ 95% do volume
    do período.
  - **Quem:** dono do projeto.
  - **Por que importa:** o SM-1 fala em "100% dos tipos de Chamado". Sem a
    lista, "100%" não tem denominador — e a paridade vira opinião.

- [ ] **O baseline de tempo de resolução do sistema contratado** 📊
  - **Verificar:** extrair do software atual o tempo médio **e** a mediana de
    resolução dos últimos 3 meses.
  - **Aprovado quando:** os dois números existem, com o período e o total de
    Chamados que os sustentam.
  - **Quem:** dono do projeto (exige acesso ao contratado).
  - **Por que importa:** o SM-3 é comparativo — "não pior que o baseline". Sem o
    baseline, o número do ServiceDesk não prova nada. **Peça a mediana também**:
    o relatório do ServiceDesk devolve as duas justamente para que a comparação
    seja entre coisas iguais.

---

## Parte 1 — Paridade funcional (SM-1)

- [ ] **Cada tipo de Chamado da lista pode ser aberto, atendido e resolvido**
  - **Verificar:** para cada tipo da Parte 0, abrir um Chamado real (ou de
    ensaio) no ServiceDesk e levá-lo até `resolvido`, usando os caminhos que a
    equipe usaria de verdade.
  - **Aprovado quando:** 100% dos tipos completaram o ciclo. **Um tipo que não
    completa é um bloqueio, não uma ressalva** — anote qual e por quê.
  - **Quem:** um Agente por tipo, com o dono do projeto conferindo a cobertura.

- [ ] **Os três caminhos de entrada funcionam**
  - **Verificar:** abrir um Chamado por **MCP** (via IA), por **e-mail**
    (intake) e conferir que ambos aparecem na Fila.
  - **Aprovado quando:** os dois caminhos produziram Chamado, e o Log mostra a
    origem correta (`mcp`, `email`).
  - **Quem:** Agente.
  - **Nota:** a origem `api` existe no Log mas **não tem adapter HTTP** neste
    MVP — não a verifique, e não a marque como falha.

- [ ] **O Solicitante consegue acompanhar o próprio Chamado**
  - **Verificar:** com uma identidade de Solicitante, ver o próprio Chamado,
    comentar, e confirmar que **não** enxerga Chamado de terceiro nem
    Comentário Interno.
  - **Aprovado quando:** as três coisas se confirmam.
  - **Quem:** dono do projeto, com uma conta de Solicitante real.

---

## Parte 2 — Adoção (SM-5)

- [ ] **Os Agentes estão operando no ServiceDesk** 📊
  - **Verificar:** `relatorio_de_operacao` no período de paralelo →
    `adocao.autoresDistintos`.
  - **Aprovado quando:** o número bate com a quantidade de Agentes que a
    empresa tem operando (hoje, 8).
  - **Quem:** dono do projeto.
  - **Limite conhecido:** o sistema conta **quem agiu**, não sabe quantos
    Agentes existem. A comparação é humana.

- [ ] **Zero Chamados sendo tratados FORA do ServiceDesk**
  - **Verificar:** perguntar a cada Agente se atendeu algo pelo contratado, por
    WhatsApp, por conversa de corredor ou por e-mail direto no período; e
    conferir no contratado se entraram Chamados novos.
  - **Aprovado quando:** nenhum Chamado novo no contratado no período, e
    nenhum Agente relata atendimento por fora.
  - **Quem:** dono do projeto.
  - **Por que o sistema não mede:** esta pergunta é sobre o que **não** está
    aqui. Nenhuma consulta interna a responde — é o item mais fácil de fingir
    que está verde, e o mais caro se estiver errado.

---

## Parte 3 — Sem regressão de serviço (SM-3)

- [ ] **O tempo de resolução não piorou** 📊
  - **Verificar:** comparar `resolucao.medianaHoras` e `resolucao.mediaHoras`
    do `relatorio_de_operacao` com o baseline da Parte 0.
  - **Aprovado quando:** a **mediana** não é pior que a do baseline. Se a média
    piorou mas a mediana não, **investigue antes de reprovar**: em fila pequena
    um único Chamado esquecido move a média sozinho.
  - **Quem:** dono do projeto.
  - **Cuidado:** confira `resolucao.resolvidos`. Uma comparação sobre 5
    Chamados não sustenta decisão de contrato.

- [ ] **Nenhum Chamado ficou parado sem ninguém perceber** 📊
  - **Verificar:** `resolucao.semResolucao` no relatório, e olhar a Fila
    ordenada por mais antigo.
  - **Aprovado quando:** os Chamados sem resolução têm explicação (aguardando
    terceiro, etc.), e não são esquecimento.
  - **Quem:** Agente responsável pela fila.

---

## Parte 4 — O que a migração deixou em aberto

- [ ] **O formato real do CSV do fornecedor foi mapeado**
  - **Verificar:** obter um export real do contratado e compará-lo com
    `COLUNAS_DO_IMPORT` (Story 4.2).
  - **Aprovado quando:** existe um mapeamento coluna-a-coluna, e as colunas sem
    correspondência estão listadas com a decisão de cada uma.
  - **Quem:** dono do projeto + quem desenvolve.
  - **Estado:** a Story 4.2 definiu o **contrato de entrada**; o formato real
    continua desconhecido. **A lacuna é a diferença entre as duas listas.**

- [ ] **O histórico importado foi conferido por amostragem**
  - **Verificar:** escolher 20 Chamados importados e comparar com o original no
    contratado — Título, Descrição, Status, data de abertura e Solicitante.
  - **Aprovado quando:** os 20 batem. **Um que não bata para o import inteiro
    para revisão.**
  - **Quem:** dono do projeto.
  - **Cuidado registrado na 4.2:** Chamado importado tem `numero_legado` do
    sistema antigo e Número **novo** daqui — a divergência de número é
    esperada, não é erro.

- [ ] **As pessoas do histórico existem no cadastro**
  - **Verificar:** listar `requester` de Chamados importados que não estão em
    `users`.
  - **Aprovado quando:** a lista foi revisada e cada caso tem decisão (cadastrar
    ou aceitar como histórico sem dono).
  - **Quem:** dono do projeto.
  - **Consequência registrada na 4.2:** esses Chamados **não têm dono humano
    capaz de vê-los** até a pessoa existir no cadastro.

---

## Parte 5 — O que fica sabidamente para depois

Não são itens a marcar: são decisões **já tomadas** de não resolver agora, aqui
para que ninguém as descubra no meio do corte.

| O que | Onde está registrado | Consequência |
| --- | --- | --- |
| **Não há restauração** do que foi excluído | PRD, FR-23 (Story 4.3) | Exclusão por engano só volta por SQL manual. É por isso que as três exclusões exigem confirmação |
| **Não há política de retenção** | PRD, FR-23 | Excluídos ficam para sempre. Decisão de negócio/conformidade |
| **Recadastrar quem saiu não funciona** | migration `0014` | O `UNIQUE` de e-mail é da tabela inteira, de propósito |
| **Não há adapter HTTP** | arquitetura | Só MCP no MVP; a origem `api` existe no Log mas nada a produz |
| **Comentários não são exportados nem importados** | PRD, FR-24/FR-25 | O CSV leva o Chamado, não a thread |

---

## Decisão final

- [ ] **Recomendar o corte do contrato**
  - **Aprovado quando:** todos os itens das Partes 1–4 estão verdes, **e** o
    período de paralelo de ~1 mês foi cumprido.
  - **Quem:** dono do projeto.
  - **Regra:** um item vermelho **adia**. A checklist não é média ponderada —
    ela existe para impedir que "quase tudo funcionando" vire "desligamos".
