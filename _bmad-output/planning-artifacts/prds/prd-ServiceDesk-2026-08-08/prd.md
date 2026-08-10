---
title: ServiceDesk
status: final
created: 2026-08-08
updated: 2026-08-08
---

# PRD: ServiceDesk
*Working title — confirmar.*

## 0. Propósito do Documento

Este PRD é para o construtor do ServiceDesk (uma pessoa + IA) e para os workflows seguintes do BMad (arquitetura, épicos e stories). Ele deriva de três inputs desta iniciativa: o [product brief](../../briefs/brief-ServiceDesk-2026-08-08/brief.md), seu [addendum](../../briefs/brief-ServiceDesk-2026-08-08/addendum.md) e o [brainstorm-intent](../../../brainstorming/brainstorm-service-desk-mvp-2026-08-08/brainstorm-intent.md) — não os duplica. A estrutura: vocabulário ancorado no Glossário (§3), features agrupadas com FRs aninhados e numerados globalmente, NFRs transversais em seção própria, e suposições marcadas `[SUPOSIÇÃO]` inline e indexadas em §14. Decisões de tecnologia/implementação vivem no addendum, não aqui.

## 1. Visão

O ServiceDesk é um sistema interno de controle de chamados cujo **núcleo é uma API + servidor MCP**: as funcionalidades centrais são publicadas como ferramentas MCP, de modo que o suporte é operado **de dentro de uma IA**, por linguagem natural. A interface web é uma fase seguinte (Fase 1.5), construída sobre a mesma API. A referência conceitual é o ServiceNow, reduzido aos poucos recursos que concentram o uso real.

O produto existe para **substituir o software de service desk hoje contratado** (~R$ 20 mil/mês; ≈ R$ 240 mil/ano), construído por uma pessoa apoiada por IA. Sendo MCP-first, o próprio agente de IA atua como camada de automação — dispensando um motor de workflow interno e entregando um diferencial que o fornecedor atual não possui.

A vitória é objetiva: **cancelar o contrato com tudo funcionando como hoje** — paridade nos 20% de recursos que cobrem 80% do uso, provada rodando em paralelo antes do corte. O valor central protegido é a rastreabilidade: nada pode cair no esquecimento.

## 2. Usuário-Alvo

### 2.1 Jobs To Be Done

- **Agente de suporte (8 pessoas):** "quando um chamado chega, quero pegá-lo, resolver e registrar sem garimpar — e sem nada se perder." Operar a fila de dentro da IA (copiloto: "o que faço com o #1042?").
- **Solicitante (~100 funcionários):** "quando tenho um problema, quero abrir um chamado em segundos e saber em que pé está sem precisar cobrar ninguém."
- **Gestor de suporte:** "quero enxergar carga, gargalos e volume sob demanda, sem abrir relatório."
- **Construtor (eu + IA):** "quero um sistema que eu consiga construir e manter sozinho, e que justifique cortar R$ 240k/ano."

### 2.2 Não-Usuários (v1)

- Clientes/usuários externos à empresa (é ferramenta interna).
- Áreas além de TI (RH, Facilities) — arquitetura permite no futuro, mas fora do v1.
- Solicitantes que exigem interface gráfica própria: no MVP operam via e-mail/IA; portal web só na Fase 1.5.

### 2.3 Jornadas-Chave

- **UJ-1. Bruno, agente de N1, opera a fila de dentro da IA.**
  Bruno começa o dia e pergunta à IA "quais chamados estão sem dono?". A IA chama `resumo_fila`/`buscar_chamados` via MCP, lista os pendentes, ele diz "pega o mais antigo pra mim", a IA executa `atribuir_chamado`, ele resolve e pede "marca como resolvido e avisa o solicitante". A IA executa `mudar_status` e o e-mail de resolução dispara. **Climax:** um chamado sai da fila sem Bruno abrir nenhuma tela. **Edge:** ao fechar, por ser ação irreversível, a IA pede confirmação explícita antes de executar `fechar_chamado`. Realiza FR-5, FR-4, FR-10, FR-17, FR-18.

- **UJ-2. Marina, do financeiro, abre um chamado sem sair do e-mail.**
  Marina está sem acesso a um sistema. No MVP, ela relata o problema à IA/por e-mail; a IA chama `chamados_parecidos` (não há duplicado) e `abrir_chamado`, e ela recebe um e-mail com o número `#1042` e o status. **Climax:** ela sabe que o chamado existe e está rastreado. **Resolução:** acompanha por e-mail até a resolução. Realiza FR-1, FR-12, FR-18.

- **UJ-3. Aline, gestora, pede o resumo do dia.**
  Aline pergunta "como está a fila hoje?"; a IA chama `resumo_fila` e devolve abertos por status, por técnico e por categoria, apontando o técnico sobrecarregado. Realiza FR-10.

## 3. Glossário

- **Chamado** — Unidade central de trabalho: uma solicitação de suporte com identidade própria. Possui exatamente um **Número**, um **Status**, zero-ou-um **Dono**, uma **Categoria**, uma **Prioridade**, um **Solicitante** e zero-ou-mais **Comentários**.
- **Número** — Identificador sequencial legível do Chamado (ex.: `#1042`). Único e imutável.
- **Status** — Estado do Chamado, fonte da verdade. Conjunto fechado: Aberto, Em andamento, Aguardando, Resolvido, Fechado, Cancelado.
- **Dono** — O Agente responsável pelo Chamado num dado momento. No máximo um por vez; pode estar vazio ("sem Dono").
- **Agente** — Usuário do suporte que opera Chamados (os 8). Papel com permissão de escrita.
- **Solicitante** — Usuário que abre e acompanha Chamados. Papel com acesso restrito aos próprios Chamados.
- **Categoria** — Classificação fixa do Chamado (ex.: Hardware, Software, Rede, Acesso). Determina o **Time responsável**.
- **Time responsável** — Grupo de Agentes associado a uma Categoria (fusão dos conceitos "fila" e "categoria").
- **Prioridade** — Grau de urgência do Chamado: Baixa, Média, Alta, Crítica.
- **Comentário** — Entrada no histórico de um Chamado. **Público** (visível ao Solicitante) ou **Interno** (só Agentes).
- **Fila** — Conjunto de Chamados filtrável por Status, Dono, Categoria/Time e texto.
- **Tool MCP** — Função do produto exposta via servidor MCP para operação por IA. Classificada como Leitura, Escrita ou Irreversível.
- **Ação irreversível** — Tool MCP de escrita cujo efeito é custoso de desfazer (fechar, cancelar, reabrir); exige confirmação humana.
- **Log de auditoria** — Registro append-only de toda mudança em Chamado, com autor e origem (UI ou MCP).

## 4. Features

### 4.1 Gestão de Chamados

**Descrição:** O CRUD central. Um Chamado é criado com campos mínimos, ganha Número na hora, transita por Status controlados e acumula Comentários. Toda mudança vai para o Log de auditoria. Realiza UJ-1, UJ-2.

**Requisitos Funcionais:**

#### FR-1: Abrir chamado
Um Solicitante (ou Agente em seu nome) pode abrir um Chamado com Título, Descrição, Categoria e Solicitante. Realiza UJ-2.
**Consequências (testáveis):**
- O sistema gera um Número sequencial único e legível (ex.: `#1042`) no ato da criação.
- Chamado nasce com Status "Aberto" e sem Dono.
- Título e Descrição obrigatórios; Categoria obrigatória a partir de lista fixa.

#### FR-2: Ver chamado
Um Agente pode ver o detalhe completo de um Chamado, incluindo todos os Comentários em ordem cronológica. Um Solicitante vê apenas os próprios Chamados e apenas Comentários Públicos.
**Consequências (testáveis):**
- Retorna todos os campos + thread de Comentários.
- Solicitante recebe erro de autorização ao pedir Chamado que não é seu.

#### FR-3: Comentar
Um Agente pode adicionar Comentário Público ou Interno; um Solicitante pode adicionar Comentário Público no próprio Chamado.
**Consequências (testáveis):**
- Comentário Interno nunca aparece para o Solicitante (FR-2).
- Cada Comentário registra autor e timestamp (timezone único da empresa).

#### FR-4: Mudar status
Um Agente pode alterar o Status de um Chamado entre os valores do conjunto fechado. Realiza UJ-1.
**Consequências (testáveis):**
- Só transições para valores válidos do Glossário são aceitas.
- Mudança registra autor e origem no Log de auditoria.

#### FR-5: Atribuir responsável
Um Agente pode atribuir o Dono de um Chamado a si (self-assign) ou a outro Agente. Realiza UJ-1.
**Consequências (testáveis):**
- Chamado "sem Dono" é claramente identificável na Fila (FR-9).
- Reatribuição registra Dono anterior e novo no Log de auditoria.

#### FR-6: Mudar prioridade
Um Agente pode alterar a Prioridade de um Chamado.
**Consequências (testáveis):**
- Aceita apenas valores do conjunto fechado (Baixa…Crítica).

#### FR-7: Encerrar, cancelar e reabrir
Um Agente pode Resolver, Fechar, Cancelar ou Reabrir um Chamado. Fechar, Cancelar e Reabrir são Ações irreversíveis.
**Consequências (testáveis):**
- Chamado aberto por engano pode ir para "Cancelado".
- Reabrir um Chamado Resolvido/Fechado volta o Status para "Em andamento" e registra o motivo.
- Via MCP, estas ações exigem confirmação humana (FR-17).

**NFRs específicos:** edição concorrente de um mesmo Chamado por dois Agentes deve ser detectada (aviso ou trava otimista) para evitar sobrescrita silenciosa.

### 4.2 Fila e Triagem

**Descrição:** A visão operacional dos Chamados para o Agente e o resumo gerencial. Realiza UJ-1, UJ-3.

#### FR-8: Filtrar a fila
Um Agente pode listar/filtrar a Fila por Status, Dono, Categoria/Time e texto livre.
**Consequências (testáveis):**
- Filtros combináveis; resultado ordenável por data de abertura.

#### FR-9: Recortes "meus" e "sem dono"
Um Agente pode ver rapidamente os Chamados que são seus e os que estão sem Dono.
**Consequências (testáveis):**
- "Sem Dono" é um recorte de primeira classe, não um filtro escondido.

#### FR-10: Resumo da fila
Um Agente ou Gestor pode obter contadores da Fila: abertos por Status, por Time/Categoria e por Agente. Realiza UJ-3.
**Consequências (testáveis):**
- Retorna números agregados sem exigir navegação por Chamados.

### 4.3 Busca e Duplicados

#### FR-11: Busca simples
Um Agente pode buscar Chamados por texto (Título, Descrição, Comentários) e Status.
**Consequências (testáveis):**
- Evita reabrir problema já resolvido: busca cobre Chamados Fechados/Resolvidos.

#### FR-12: Sugerir chamados parecidos
Na abertura, o sistema pode sugerir Chamados parecidos ao texto informado. Realiza UJ-2.
**Consequências (testáveis):**
- Sugestão baseada em busca textual simples; não bloqueia a abertura.

### 4.4 Superfície MCP *(o contrato público do produto)*

**Descrição:** O núcleo do produto. As capacidades acima são expostas como Tools MCP, classificadas por risco, mais Resources e Prompts. Este é o contrato que a IA consome. Realiza UJ-1, UJ-2, UJ-3.

#### FR-13: Tools MCP de leitura
O servidor MCP expõe tools de Leitura: `buscar_chamados`, `ver_chamado`, `resumo_fila`, `chamados_parecidos`.
**Consequências (testáveis):**
- Tools de Leitura não alteram estado e não exigem confirmação.
- Respeitam a autorização do papel da identidade autenticada (FR-20).

#### FR-14: Tools MCP de escrita
O servidor MCP expõe tools de Escrita: `abrir_chamado`, `comentar_chamado`, `mudar_status`, `atribuir_chamado`, `mudar_prioridade`.
**Consequências (testáveis):**
- Cada execução registra autor e origem=MCP no Log de auditoria (FR-22).
- Sujeitas a rate limit (FR-21).

#### FR-15: Ações irreversíveis com confirmação
As tools `fechar_chamado`, `cancelar_chamado`, `reabrir_chamado` são marcadas como Ação irreversível e exigem confirmação humana explícita antes de efetivar.
**Consequências (testáveis):**
- Uma chamada sem o passo de confirmação não altera estado e retorna instrução de confirmação.

#### FR-16: MCP Resources e Prompts
O servidor MCP expõe Resources de leitura ("chamado", "fila") para contexto barato e um Prompt "triagem de chamado".
**Consequências (testáveis):**
- Resource "chamado" retorna o mesmo conteúdo de `ver_chamado` respeitando autorização.

#### FR-17: Confirmação humana em ações irreversíveis via IA
Toda Ação irreversível disparada por IA passa por human-in-the-loop.
**Consequências (testáveis):**
- Sem confirmação registrada, a ação não ocorre (reforça FR-7, FR-15).

**Notas:** `[NOTE FOR PM]` o schema das Tools deve ser gerado da mesma spec da API para evitar dessincronia (detalhe técnico no addendum).

### 4.5 Notificações

#### FR-18: E-mail nos eventos-chave
O sistema envia e-mail ao Solicitante na abertura e na resolução do Chamado. Realiza UJ-1, UJ-2.
**Consequências (testáveis):**
- Apenas abertura e resolução no MVP (sem ruído).
- E-mail contém Número, Status e link; o link também dá acesso no portal (mitiga spam).
**Decidido em 2026-08-10 (Story 1.6):** o link é um **magic link de acesso ao Chamado** — escopo de um Chamado só, válido por **7 dias** e **reutilizável** (uso único seria hostil: a pessoa clica, fecha a aba e volta depois). Transporte por **Nodemailer sobre SMTP** configurável por ambiente. O envio acontece **fora** da transação do AD-3: e-mail dentro dela prenderia a linha do Chamado pelo tempo do SMTP e desfaria a abertura se falhasse.

### 4.6 Identidade e Papéis

#### FR-19: Autenticação simples
Usuários autenticam por **magic link por e-mail** (decidido em 2026-08-10, Q7). `[SUPOSIÇÃO: sem SSO/AD no MVP]`
**Consequências (testáveis):**
- Sessão identifica unicamente o usuário para atribuição de autoria.

#### FR-20: Dois papéis
O sistema reconhece dois papéis: Agente e Solicitante. Sem matriz de permissões além disso no MVP.
**Consequências (testáveis):**
- Solicitante só acessa próprios Chamados e Comentários Públicos (FR-2).
- Qualquer Agente vê todos os Chamados.

#### FR-21: Token MCP escopado e rate limit
Cada cliente MCP autentica com token escopado por identidade e está sujeito a rate limit.
**Decidido em 2026-08-10 (Story 1.5):** o token é uma **credencial de máquina** separada da sessão humana (revogável, identidade própria — sem isso o AD-9 não consegue distinguir agente autônomo de "humano via IA"); o limite é de **60 chamadas por minuto por identidade**, com o contador no **Postgres**. Prazo de validade do token não foi definido: a coluna existe e aceita nulo (não expira), e quem emitir decide.
**Consequências (testáveis):**
- Ações via token são atribuídas à identidade correspondente no Log de auditoria.
- Excesso de chamadas é limitado para uma IA em loop não sobrecarregar o sistema.

### 4.7 Auditoria, Persistência e Migração

#### FR-22: Log de auditoria
Toda mudança em Chamado é registrada com autor e origem (UI ou MCP).
**Consequências (testáveis):**
- Registro append-only; distingue "humano via IA" de agente autônomo pela identidade do token.

#### FR-23: Soft-delete
Exclusões são lógicas (soft-delete), nunca físicas, no MVP.
**Consequências (testáveis):**
- Nenhum Chamado ou Comentário é apagado fisicamente; permanece auditável.
**Decidido em 2026-08-10 (Story 1.7):** excluir é ação de **Agente**; `audit_entries` **não** recebe soft-delete (é append-only, FR-22 — uma coluna de exclusão ali permitiria apagar a prova de que algo aconteceu). Quem não pode **ver** o Chamado recebe `TicketNaoEncontrado`; quem vê mas não pode **excluir** recebe `SemPermissao` — esconder existência de quem já a conhece não protege nada.

#### FR-24: Export CSV
Um Agente/Gestor pode exportar Chamados em CSV.
**Consequências (testáveis):**
- Export cobre filtros aplicados; evita lock-in próprio.

#### FR-25: Import CSV (migração)
O sistema pode importar Chamados do software atual via CSV.
**Consequências (testáveis):**
- Import preserva Número/histórico quando disponíveis. `[SUPOSIÇÃO: formato de export do contratado a confirmar]`

### 4.8 Portal Web *(Fase 1.5 — [NON-GOAL for MVP])*

**Descrição:** Interface visual sobre a mesma API, para quem não opera via IA.
- **FR-26:** Portal do Solicitante (abrir e acompanhar Chamados). `[NON-GOAL for MVP — Fase 1.5]`
- **FR-27:** Fila do Agente na web (kanban/lista por Status). `[NON-GOAL for MVP — Fase 1.5]`

## 5. Não-Objetivos (Explícito)

- Não é ferramenta para clientes externos.
- Não vira plataforma multi-área (RH/Facilities) no v1.
- Não terá motor de automação/workflow interno — a IA via MCP cumpre esse papel.
- Não terá SLA automatizado, base de conhecimento, catálogo de serviços/self-service nem CMDB no MVP.
- Não terá matriz de permissões granular além dos dois papéis.

## 6. Escopo do MVP

### 6.1 Dentro (Fase 1 — núcleo MCP)

- API + servidor MCP com Tools de Leitura, Escrita e Irreversíveis (FR-13–FR-17).
- Gestão de Chamados completa (FR-1–FR-7), Fila e resumo (FR-8–FR-10), Busca e duplicados (FR-11–FR-12).
- Notificações por e-mail (FR-18), Identidade e dois papéis (FR-19–FR-21).
- Auditoria, soft-delete, export e import CSV (FR-22–FR-25).

### 6.2 Fora do MVP

- **Portal Web (FR-26–FR-27)** — Fase 1.5, logo após o MVP. `[NOTE FOR PM: emocionalmente relevante; revisar se o prazo permitir antecipar.]`
- SLA e prazos — Fase 2.
- Base de conhecimento — Fase 3.
- Automações internas — provavelmente dispensadas pelo MCP (Fase 4, condicional).
- Self-service/catálogo (Fase 5), dashboards robustos (Fase 6), integrações AD/SSO e Teams/Slack (Fase 7).

## 7. NFRs Transversais

- **Simplicidade de manutenção:** stack "boring", schema mínimo (essencialmente Chamados + Comentários + Usuários), operável por uma pessoa.
- **Consistência de contrato:** UI e MCP consomem a **mesma camada de domínio**; zero lógica de negócio duplicada.
- **Rastreabilidade:** nenhuma mudança de Chamado sem registro de autor/origem.
- **Disponibilidade:** adequada a uso interno em horário comercial. `[SUPOSIÇÃO: sem requisito de alta disponibilidade 24/7 no MVP]`
- **Desempenho:** operações de Fila/busca respondem em tempo interativo para o volume esperado. `[SUPOSIÇÃO: ~200–400 chamados/mês]`
- **Timezone único** da empresa em todas as datas.

## 8. Constraints e Guardrails

**Segurança (escrita via IA):** Ações irreversíveis exigem human-in-the-loop (FR-15/FR-17); tokens MCP escopados por identidade e rate-limited (FR-21); toda ação atribuída no Log de auditoria (FR-22).
**Privacidade:** dados internos da empresa; acesso do Solicitante restrito aos próprios Chamados; Comentários Internos nunca expostos.
**Custo:** infra enxuta; e-mail transacional por serviço simples. O produto compete contra R$ 240k/ano — custo operacional precisa ser uma fração disso.

## 9. Integração e Dependências

- **E-mail transacional** (SMTP/serviço) — dependência do MVP para FR-18.
- **Software contratado atual** — origem da migração via import CSV (FR-25).
- **AD/SSO, Teams/Slack** — integrações **futuras** (Fase 7), reusando as mesmas Tools MCP.
- **Cliente MCP (IA)** — a IA que consome o servidor é a interface primária; não é dependência de terceiros crítica, mas define o contrato (FR-13–FR-17).

## 10. ROI / Business Case

- **Custo evitado:** ~R$ 240k/ano ao cancelar o contrato atual (R$ 20k/mês).
- **Custo de construção:** tempo do construtor + IA; sem custo de equipe de desenvolvimento.
- **Payback:** dominado pelo custo evitado; qualquer mês de contrato a menos após o corte é economia direta. `[SUPOSIÇÃO: sem multa/carência relevante de rescisão]`
- **Gatilho de decisão:** cortar somente após paridade comprovada em paralelo (§11).

## 11. Rollout e Change Management

- **Paralelo:** rodar o ServiceDesk junto ao contratado por ~1 mês.
- **Critério de corte:** paridade nos 20% de recursos que cobrem 80% do uso + os 8 Agentes operando 100% dos novos Chamados no sistema, zero Chamados perdidos fora dele.
- **Migração:** import CSV do histórico relevante (FR-25) antes do corte.
- **Baseline:** medir o tempo médio de resolução atual antes do corte, para provar "sem regressão" (SM-3).

## 12. Métricas de Sucesso

**Primárias**
- **SM-1: Paridade funcional** — 100% dos tipos de Chamado que hoje passam pelo contratado podem ser abertos, atendidos e resolvidos no ServiceDesk. Valida FR-1–FR-12, FR-18.
- **SM-2: Corte do contrato** — contrato cancelado após o período em paralelo. Valida o objetivo do produto (§10, §11).

**Secundárias**
- **SM-3: Sem regressão de serviço** — tempo médio de resolução não pior que o baseline atual. Valida FR-8–FR-10. `[SUPOSIÇÃO: baseline a medir]`
- **SM-4: Operação via IA** — parcela relevante dos Chamados aberta/triada via MCP. `[SUPOSIÇÃO: meta ≥ 50% no 1º trimestre]` Valida FR-13–FR-16.
- **SM-5: Adoção** — 8 Agentes operando 100% dos novos Chamados no sistema; zero Chamados perdidos fora dele. Valida FR-8, FR-9.

**Counter-metrics (não otimizar)**
- **SM-C1: Ruído de notificação** — nº de e-mails por Chamado deve permanecer baixo; não aumentar "engajamento" por e-mail. Contrabalança SM-4/SM-5.
- **SM-C2: Complexidade** — nº de campos obrigatórios na abertura não deve crescer para "melhorar dados"; um formulário pesado mata adoção. Contrabalança SM-1.

## 13. Questões em Aberto

1. Volume real de Chamados/mês (estimado ~200–400).
2. Prazo-alvo do MVP (estimado ~4–8 semanas com IA).
3. Baseline atual de tempo médio de resolução — precisa ser medido antes do corte (SM-3).
4. Existe multa/carência na rescisão do contrato atual?
5. Formato de export/migração do software contratado (FR-25).
6. Meta concreta de % de Chamados operados via MCP (SM-4).
7. ~~Autenticação: magic link vs. login corporativo — qual no MVP (FR-19)?~~ **Respondida em 2026-08-10:** magic link por e-mail, sessão em tabela no Postgres (token só em hash), link de 15 min de uso único, sessão de 8 h. Implementada na Story 1.3.

## 14. Índice de Suposições

- §4.6 FR-19 — sem SSO/AD no MVP.
- §4.7 FR-25 — formato de export do contratado a confirmar.
- §7 — sem alta disponibilidade 24/7 no MVP; volume ~200–400 chamados/mês.
- §10 — sem multa/carência relevante de rescisão.
- §12 SM-3 — baseline de tempo de resolução a medir; SM-4 — meta ≥ 50% via MCP no 1º trimestre.
