---
title: "Product Brief — ServiceDesk (MCP-first)"
status: final
created: 2026-08-08
updated: 2026-08-08
---

# Product Brief: ServiceDesk

## Resumo Executivo

O **ServiceDesk** é um sistema interno de controle de chamados construído para **substituir o software de service desk hoje contratado** — um contrato de **~R$ 20 mil/mês (≈ R$ 240 mil/ano)**. A tese é enxuta e radical: em vez de mais uma interface web pesada, o núcleo do produto é uma **API + servidor MCP**, permitindo operar todo o suporte **de dentro de uma IA**, por linguagem natural. A referência conceitual é o ServiceNow, reduzido ao osso que a empresa realmente usa.

O produto é construído por **uma pessoa apoiada por IA**, sem time de desenvolvimento. Isso torna a matemática do "build vs buy" agressiva: o custo de construção é essencialmente tempo, contra R$ 240 mil/ano de contrato recorrente. O diferencial defensável — ser **MCP-first** — é exatamente o que o fornecedor atual não oferece, e o que permite que a própria IA atue como camada de automação, dispensando um motor de workflow interno.

O critério de vitória é objetivo: **cancelar o contrato atual com tudo funcionando como hoje** — paridade funcional nos poucos recursos que concentram o uso real, provada rodando em paralelo antes do corte.

## O Problema

Uma empresa de **~100 funcionários** com **8 agentes de suporte** depende hoje de um software de chamados contratado a R$ 20k/mês. Dois problemas se somam:

- **Custo recorrente alto e dependência de fornecedor.** R$ 240k/ano por uma fração dos recursos efetivamente usados — o clássico "pagamos por um ERP e usamos como bloco de notas".
- **Sem uma ferramenta própria e enxuta, o suporte escorrega para o informal** (WhatsApp, e-mail solto), onde chamados caem no esquecimento. O valor central em risco é a **rastreabilidade**: nada pode se perder.

O fornecedor atual também **não expõe MCP** — ou seja, não permite operar o suporte de dentro de uma IA, que é justamente para onde o fluxo de trabalho da empresa está indo.

## A Solução

Um service desk cujo **núcleo é uma API + servidor MCP**. As funcionalidades centrais viram **ferramentas MCP** que um agente de IA (ou o próprio técnico, via IA) opera por linguagem natural: abrir e triar chamados, consultar a fila, comentar, mudar status, atribuir responsável, resumir a fila. A interface visual (portal do solicitante + fila do agente) é uma **fase seguinte**, construída sobre a mesma API.

A experiência que se busca:

- O técnico pergunta à IA *"o que faço com o #1042?"* e recebe o contexto do chamado + próximos passos.
- Um chamado é aberto e triado por linguagem natural, com detecção de duplicados na hora.
- O gestor pede *"resumo do dia"* e recebe volume, gargalos e carga por técnico — sem abrir tela.

Cada chamado tem **dono único e status visíveis** como fonte da verdade; e-mail avisa o solicitante nos eventos que importam (abertura e resolução), nunca ruído.

## O Que Torna Isto Diferente

- **MCP-first, não MCP-como-plugin.** A IA é a interface primária de operação — o fornecedor atual não tem isso.
- **A IA é a camada de automação.** Expor MCP dispensa um workflow engine interno; a orquestração fica no agente de IA. Isso permite **pular a fase de automações** que um service desk tradicional exige.
- **Vantagem de custo estrutural.** Construído por uma pessoa + IA, o produto compete contra R$ 240k/ano de contrato. A vantagem é execução barata e foco nos 20% que importam — não um moat tecnológico inventado.
- **Sem lock-in próprio.** Export CSV e log de auditoria desde o dia 1: os dados são da empresa.

## Quem Isto Serve

- **Agente/técnico de suporte (8 pessoas)** — público primário. Opera a fila e resolve chamados; o MCP vira um copiloto de suporte. Sucesso: menos garimpo, contexto na hora, nada perdido.
- **Solicitante (≈100 funcionários)** — abre e acompanha chamados. No núcleo, via IA/e-mail; na Fase 1.5, via portal web. Sucesso: sabe "em que pé está" sem precisar perguntar.
- **Gestor de suporte** — visão de carga, gargalos e volume por categoria/técnico, sob demanda. Sucesso: enxerga o gargalo antes de virar incêndio.

## Critérios de Sucesso

O sinal de vitória definido pelo usuário: **contrato cancelado, tudo funcionando como hoje.** Traduzido em critérios verificáveis:

- **Paridade funcional:** 100% dos tipos de chamado que hoje passam pelo contratado podem ser abertos, atendidos e resolvidos no ServiceDesk.
- **Adoção total:** os 8 agentes operando 100% dos novos chamados no sistema; **zero chamados "perdidos"** fora dele.
- **Operação via IA:** parcela relevante dos chamados aberta/triada via MCP — o diferencial em uso real. `[SUPOSIÇÃO: meta ≥ 50% no primeiro trimestre pós-lançamento]`
- **Sem regressão de serviço:** tempo médio de resolução **não pior que hoje**. `[SUPOSIÇÃO: exige medir o baseline atual antes do corte]`
- **Prova antes do corte:** rodar em paralelo ao contratado por **~1 mês** e atingir paridade nos 20% de recursos que cobrem 80% do uso.
- **Resultado financeiro:** contrato cancelado → **~R$ 240k/ano liberados.** `[SUPOSIÇÃO: sem multa/carência relevante de rescisão]`

## Escopo

**Dentro — MVP (Fase 1, núcleo MCP):**

- API + servidor MCP com as funcionalidades centrais (abrir, buscar, ver, comentar, mudar status, atribuir, prioridade, resumo de fila, chamados parecidos).
- Os 6 pilares funcionais: abrir chamado (4 campos) · fila com dono visível · status como fonte da verdade (máx. 5+cancelado) · thread de comentários (público/interno) · e-mail nos eventos-chave · busca simples.
- Pilar de arquitetura: **API-first / camada de domínio única** consumida por MCP e (depois) UI.
- Guardrails de escrita via IA: human-in-the-loop em ações irreversíveis, token escopado por identidade, rate limit, auditoria.
- Persistência barata: soft-delete, log de auditoria, export CSV.

**Fase 1.5 (logo após o MVP):** UI web — portal do solicitante + fila do agente, sobre a mesma API.

**Fora — por ora (won't):** SLA automatizado · workflow/automação interna · base de conhecimento · catálogo de serviços/self-service · CMDB/gestão de ativos · matriz de permissões (MVP tem 2 papéis: agente e solicitante).

> Detalhamento da superfície de tools MCP, edge cases e riscos: ver `brainstorm-intent.md` (companion) e `addendum.md`.

## Restrições & Premissas

- **Equipe:** 1 pessoa + IA. Favorece stack simples, "boring technology" e schema mínimo (1 tabela `tickets` + comentários + usuários).
- **Prazo:** `[SUPOSIÇÃO: MVP núcleo MCP em ~4–8 semanas de trabalho com IA; a definir]`.
- **Volume:** `[SUPOSIÇÃO: ~200–400 chamados/mês para 100 funcionários — a confirmar]`. Escala pequena reforça a escolha por simplicidade.
- **Migração:** planejar import CSV do software atual desde o início para não deixar dados presos.

## Visão

Se der certo, o ServiceDesk deixa de ser "o clone barato do contratado" e vira **a forma como a empresa opera suporte de dentro da IA**. Roadmap além do MVP: SLA e prazos (Fase 2) · base de conhecimento (3) · automações — *possivelmente dispensadas pelo MCP* (4) · self-service (5) · dashboards gerenciais (6) · integrações AD/SSO e Teams/Slack reusando as mesmas tools MCP (7). O corte do contrato é o primeiro marco, não o teto: a mesma fundação MCP abre o caminho para atender RH e Facilities, não só TI.
