# Intent — Service Desk MCP-first (MVP)

> Destilado da sessão de brainstorm de 08/08/2026 (125 ideias, 14 técnicas). Fonte canônica: `.memlog.md`. Pronto para servir de input a `bmad-product-brief` ou `bmad-prd`.

## One-liner

Um sistema de controle de chamados (service desk) interno, **MCP-first**: o núcleo é uma API + servidor MCP que permite operar todo o suporte de dentro de uma IA. Referência conceitual: ServiceNow, reduzido ao osso. Objetivo de longo prazo: substituir o software de chamados atualmente contratado.

## Problema & contexto

- A empresa usa hoje um software de chamados **contratado** — custo recorrente e dependência de fornecedor.
- Sem uma ferramenta enxuta e própria, o risco é o suporte informal ("volta pro WhatsApp"), onde chamados caem no esquecimento.
- Valor central buscado: **nada cair no esquecimento** — rastreabilidade de ponta a ponta.

## Tese / diferencial

- **MCP-first como núcleo, não como enfeite.** As funcionalidades centrais são publicadas como ferramentas MCP; a IA vira a interface primária de operação.
- **A IA é a camada de automação.** Expor MCP dispensa um workflow engine interno — dá para **pular a fase de automações** e deixar a orquestração para o agente de IA.
- **Razão de "build vs buy".** O software contratado atual quase certamente não expõe MCP; isso é o que justifica construir em vez de comprar.

## Usuários

- **Solicitante** — abre e acompanha chamados (futuramente via UI web; no núcleo, via IA/e-mail).
- **Agente/técnico** — opera a fila, atende, resolve. Público-alvo primário do MCP (copiloto de suporte).
- **Gestor** — visão de carga, gargalos e volume por categoria/técnico.

## Escopo do MVP — os 6+1 must-haves

O MVP entrega o **núcleo MCP** (Fase 1). Os seis pilares funcionais + o pilar de arquitetura:

1. **Abrir chamado** — formulário mínimo de 4 campos (título, descrição, categoria, solicitante); número sequencial legível (`#1042`) gerado na hora.
2. **Fila com dono visível** — o que é meu, o que está sem dono; self-assign de 1 passo. "Sem dono" precisa ser visível (senão o chamado some).
3. **Status como fonte da verdade** — no máximo 5 estados claros (Aberto · Em andamento · Aguardando · Resolvido · Fechado; + Cancelado). Nada mora na memória do técnico.
4. **Thread de comentários** — conversa rastreável presa ao número; comentário público vs. interno.
5. **Notificação por e-mail nos eventos-chave** — abertura e resolução apenas (nunca ruído).
6. **Busca simples** — por status e por texto (evita reabrir o já resolvido).
7. **(Pilar de arquitetura) API-first / camada de domínio limpa** — UI e MCP consomem a MESMA camada de domínio; zero lógica duplicada. É o que torna o MCP-first viável e barato.

### Superfície de ferramentas MCP

Separadas por risco:

- **Leitura (livres):** `buscar_chamados`, `ver_chamado`, `resumo_fila`, `chamados_parecidos`
- **Escrita (com guardrails):** `abrir_chamado`, `comentar_chamado`, `mudar_status`, `atribuir_chamado`, `mudar_prioridade`
- **Irreversíveis (confirmação humana obrigatória):** `fechar_chamado`, `cancelar_chamado`, `reabrir_chamado`
- **MCP Resources:** "chamado" e "fila" como leitura barata de contexto.
- **MCP Prompts:** template "triagem de chamado".

## Fora de escopo do MVP (won't, por ora)

SLA automatizado · workflow/automação interna · base de conhecimento · catálogo de serviços/self-service · CMDB/gestão de ativos · matriz de permissões (MVP tem só 2 papéis: agente e solicitante).

## Decisões travadas

- **Sequência de entrega:** Fase 1 = API + servidor MCP (operar via IA). **Fase 1.5 = UI web** (portal do solicitante + fila do agente, sobre a mesma API).
- **Sem motor de regras no MVP:** atribuição manual; prioridade/categoria com valores fixos.
- **Escrita via IA sempre com human-in-the-loop** em ações irreversíveis, token escopado por identidade, rate limit, e toda ação atribuída no log de auditoria.
- **Persistência barata desde o dia 1:** soft-delete, log de auditoria e export CSV (evita lock-in próprio e prepara a migração).

## Roadmap (visão até aposentar o contratado)

| Fase | Entrega |
|------|---------|
| **1 · MVP (núcleo MCP)** | API + servidor MCP: chamados, fila, status, comentários, e-mail |
| **1.5 · UI web** | Portal do solicitante + fila do agente |
| 2 | SLA e prazos com alerta de vencimento |
| 3 | Base de conhecimento e respostas prontas |
| 4 | Automações — *possivelmente dispensada* (a IA via MCP já orquestra) |
| 5 | Catálogo de serviços / self-service |
| 6 | Relatórios e dashboards gerenciais |
| 7 | Integrações (AD/SSO, e-mail bidirecional, Teams/Slack — mesmas tools MCP) |

**Critério de substituição do contratado:** rodar em paralelo ~1 mês → atingir paridade nos **20% de recursos que cobrem 80% do uso** → cortar o contrato. Não clonar o ServiceNow.

## Riscos & guardrails a carregar para o Brief/PRD

- Ação irreversível disparada por IA sem confirmação → exigir human-in-the-loop.
- Atribuição de autoria no audit log quando a ação vem via MCP (humano-via-IA vs. agente autônomo).
- Token super-permissionado → escopo estreito por identidade.
- Dessincronia entre schema das tools MCP e a API → gerar o schema da mesma spec.
- Formulário/fluxo pesado demais → mata adoção ("volta pro WhatsApp").

## Edge cases mapeados (para o PRD)

Chamado aberto por engano (→ Cancelado) · edição concorrente por dois agentes · solicitante desligado com chamado aberto · chamado que não é de TI (→ mudar time responsável) · limite de tamanho/tipo de anexo · notificação no spam (link também no portal) · timezone único da empresa.
