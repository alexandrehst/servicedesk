---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-ServiceDesk-2026-08-08/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-ServiceDesk-2026-08-08/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/briefs/brief-ServiceDesk-2026-08-08/addendum.md
---

# ServiceDesk - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for ServiceDesk, decomposing the requirements from the PRD and Architecture into implementable stories. UX não se aplica ao MVP (o núcleo é API + servidor MCP; a UI web é Fase 1.5, fora do MVP).

## Requirements Inventory

### Functional Requirements

FR-1: Abrir Chamado com Título, Descrição, Categoria e Solicitante; Número sequencial gerado no ato; nasce Aberto e sem Dono.
FR-2: Ver detalhe do Chamado + thread de Comentários; Solicitante vê só os próprios e apenas Comentários Públicos.
FR-3: Comentar (Agente: Público ou Interno; Solicitante: Público no próprio Chamado); registra autor e timestamp.
FR-4: Mudar Status entre os valores do conjunto fechado; registra autor e origem.
FR-5: Atribuir Dono (self-assign ou a outro Agente); "sem Dono" identificável; reatribuição auditada.
FR-6: Mudar Prioridade (conjunto fechado Baixa…Crítica).
FR-7: Resolver / Fechar / Cancelar / Reabrir; Fechar/Cancelar/Reabrir são Ações irreversíveis.
FR-8: Filtrar a Fila por Status, Dono, Categoria/Time e texto; ordenável por data.
FR-9: Recortes de primeira classe "meus" e "sem Dono".
FR-10: Resumo da Fila (contadores por Status, Time/Categoria e Agente).
FR-11: Busca simples por texto e Status (cobre Resolvidos/Fechados).
FR-12: Sugerir Chamados parecidos na abertura (não bloqueia).
FR-13: Tools MCP de Leitura (buscar_chamados, ver_chamado, resumo_fila, chamados_parecidos).
FR-14: Tools MCP de Escrita (abrir_chamado, comentar_chamado, mudar_status, atribuir_chamado, mudar_prioridade) com auditoria origin=mcp e rate limit.
FR-15: Tools de Ação irreversível (fechar/cancelar/reabrir_chamado) exigem confirmação humana explícita.
FR-16: MCP Resources ("chamado", "fila") e Prompt "triagem de chamado".
FR-17: Human-in-the-loop em toda Ação irreversível disparada por IA.
FR-18: E-mail ao Solicitante na abertura e na resolução (Número, Status, link).
FR-19: Autenticação simples (magic link ou login corporativo; sem SSO no MVP).
FR-20: Dois papéis (Agente, Solicitante); sem matriz de permissões além disso.
FR-21: Token MCP escopado por identidade + rate limit; ações atribuídas à identidade.
FR-22: Log de auditoria append-only de toda mudança, com autor e origem (api|mcp).
FR-23: Soft-delete (sem exclusão física no MVP).
FR-24: Export CSV (respeita filtros).
FR-25: Import CSV para migração do software atual (formato a confirmar).
FR-26: [Fase 1.5] Portal Web do Solicitante — fora do MVP.
FR-27: [Fase 1.5] Fila do Agente na web — fora do MVP.

### NonFunctional Requirements

NFR-1: Simplicidade de manutenção — stack "boring", schema mínimo (Ticket + Comment + User), operável por 1 pessoa.
NFR-2: Consistência de contrato — UI e MCP consomem a MESMA camada de domínio; zero lógica de negócio duplicada.
NFR-3: Rastreabilidade — nenhuma mudança de Chamado sem registro de autor/origem.
NFR-4: Disponibilidade adequada a uso interno em horário comercial (sem alta disponibilidade 24/7 no MVP).
NFR-5: Desempenho interativo em Fila/busca para o volume esperado (~200–400 chamados/mês).
NFR-6: Timezone único da empresa em todas as datas (ISO 8601/UTC no armazenamento).
NFR-7: Segurança de escrita via IA — Ações irreversíveis com human-in-the-loop; tokens MCP escopados + rate limit; toda ação auditada.
NFR-8: Privacidade — acesso do Solicitante restrito aos próprios Chamados; Comentários Internos nunca expostos.
NFR-9: Custo operacional uma fração de R$ 240k/ano (infra enxuta; e-mail transacional simples).

### Additional Requirements

*(da Arquitetura — governam a implementação; ver ARCHITECTURE-SPINE.md)*

- **Scaffold greenfield (Epic 1):** não há starter template nomeado; montar o esqueleto hexagonal à mão. Stack fixada (seed): TypeScript 5, Node.js 24 LTS, PostgreSQL 18, @modelcontextprotocol/server (SDK v2, spec 2026-07-28), Hono 4.13, Zod 4.4, Drizzle ORM 0.45, e-mail via SMTP/Resend.
- **Estrutura hexagonal:** `domain/` (sem deps externas) · `application/` (contracts Zod, commands, queries, ports) · `adapters/` (mcp, http, persistence, email, web-adiado) · `platform/` (auth, config, logging). Dependências só para dentro (AD-1).
- **Invariantes transversais (AD-1..AD-10)** que TODA story deve respeitar: domínio único ponto de mutação (AD-2); auditoria transacional com autor+origem (AD-3); Número via sequence do Postgres, imutável (AD-4); Status como máquina de estados fechada no domínio (AD-5); contratos MCP/API de fonte Zod única (AD-6); confirmação de Ações irreversíveis no domínio (AD-7); autorização papel+posse no domínio (AD-8); identidade+origem propagadas até a auditoria (AD-9); concorrência otimista (version/updated_at) no command handler (AD-10).
- **Transporte MCP:** começar `stdio` local (validar no MCP Inspector); promover a HTTP autenticado quando >1 cliente precisar (decisão adiada).
- **Persistência:** coluna `version`/`updated_at` para concorrência otimista; coluna `origin` no audit; soft-delete lógico.
- **Migração:** adapter de import CSV desenhado quando o formato de export do contratado for conhecido (adiado).

### UX Design Requirements

N/A — MVP sem UI (núcleo API + MCP). UX entra na Fase 1.5 (FR-26, FR-27).

### FR Coverage Map

FR-1: Epic 1 — Abrir Chamado (via MCP e domínio).
FR-2: Epic 1 — Ver Chamado + thread, com autorização por papel.
FR-3: Epic 2 — Comentar (público/interno).
FR-4: Epic 2 — Mudar Status (máquina de estados).
FR-5: Epic 2 — Atribuir Dono / self-assign.
FR-6: Epic 2 — Mudar Prioridade.
FR-7: Epic 2 — Resolver/Fechar/Cancelar/Reabrir (ações irreversíveis).
FR-8: Epic 3 — Filtrar a Fila.
FR-9: Epic 3 — Recortes "meus"/"sem Dono".
FR-10: Epic 3 — Resumo da Fila.
FR-11: Epic 3 — Busca simples.
FR-12: Epic 3 — Sugerir Chamados parecidos.
FR-13: Epic 1 (ver_chamado) + Epic 3 (buscar_chamados, resumo_fila, chamados_parecidos) — tools MCP de leitura, entregues junto de cada capacidade.
FR-14: Epic 1 (abrir_chamado) + Epic 2 (comentar/mudar_status/atribuir/mudar_prioridade) — tools MCP de escrita.
FR-15: Epic 2 — Tools de ação irreversível com confirmação.
FR-16: Epic 3 — MCP Resources ("chamado","fila") e Prompt "triagem" (contexto de triagem).
FR-17: Epic 2 — Human-in-the-loop em ações irreversíveis via IA.
FR-18: Epic 1 (e-mail de abertura) + Epic 2 (e-mail de resolução).
FR-19: Epic 1 — Autenticação simples.
FR-20: Epic 1 — Dois papéis (Agente, Solicitante).
FR-21: Epic 1 — Token MCP escopado + rate limit (segurança do adapter desde a 1ª tool).
FR-22: Epic 1 — Log de auditoria com autor e origem (AD-9).
FR-23: Epic 1 (base) + Epic 4 (completo) — Soft-delete.
FR-24: Epic 4 — Export CSV.
FR-25: Epic 4 — Import CSV (migração do software atual).
FR-26: Fase 1.5 (fora do MVP) — Portal Web do Solicitante.
FR-27: Fase 1.5 (fora do MVP) — Fila do Agente na web.

## Epic List

### Epic 0: Governança de CI & Guardrails
O gateway de governança do fluxo spec-driven: monta o pipeline de CI que faz cumprir os **7 pilares não-negociáveis** (auditável, funcional, testado, seguro, escalável, performático, observável) + ampla cobertura de testes. Roda como **sprint 0**, antes/junto da Story 1.1 — nenhuma story seguinte mergeia sem o gateway verde. Contrato: `QUALITY-GATE.md`. Governado por AD-11.
**Cobre:** governança (NFR-3 rastreabilidade, NFR-7 segurança), AD-1/AD-3/AD-9/AD-11 no CI. Não cobre FRs de produto.

### Epic 1: Fundação segura & o primeiro Chamado
Estabelece o esqueleto hexagonal rodando com persistência, e entrega a primeira capacidade real ponta-a-ponta — abrir e ver um Chamado via MCP — já **segura por construção**: autenticação, dois papéis, autorização no domínio, auditoria com autor+origem, e o adapter MCP com token escopado e rate limit desde a primeira tool. Define o padrão que todas as stories seguintes copiam. Dispara o e-mail de abertura.
**FRs covered:** FR-1, FR-2, FR-13 (ver_chamado), FR-14 (abrir_chamado), FR-18 (abertura), FR-19, FR-20, FR-21, FR-22, FR-23 (base)

### Epic 2: Ciclo de vida do Chamado
O Agente conduz um Chamado do início ao fim via IA: comentar (público/interno), mudar status pela máquina de estados, atribuir Dono, ajustar prioridade e Resolver/Fechar/Cancelar/Reabrir — com o guardrail de confirmação humana nas ações irreversíveis. Dispara o e-mail de resolução.
**FRs covered:** FR-3, FR-4, FR-5, FR-6, FR-7, FR-14 (comentar/mudar_status/atribuir/mudar_prioridade), FR-15, FR-17, FR-18 (resolução)

### Epic 3: Fila, triagem e busca
Agente e Gestor enxergam e priorizam o trabalho: filtrar a Fila, recortes "meus" e "sem Dono", resumo gerencial, busca simples e sugestão de duplicados na abertura. Inclui os MCP Resources e o Prompt de triagem, cujo contexto natural é este.
**FRs covered:** FR-8, FR-9, FR-10, FR-11, FR-12, FR-13 (buscar/resumo/parecidos), FR-16

### Epic 4: Portabilidade & Migração de dados
O épico do corte do contrato: importar o histórico do software atual via CSV, exportar Chamados a qualquer momento e garantir soft-delete completo. Entrega independência de fornecedor — os dados são da empresa, entram e saem sem lock-in. Ataca cedo o risco do formato de import do contratado, para não doer na véspera do corte.
**FRs covered:** FR-23 (completo), FR-24, FR-25

### Fase 1.5 (fora do MVP)
Portal Web (FR-26, FR-27) — registrado, não vira épico no MVP.

---

## Epic 0: Governança de CI & Guardrails

O gateway que torna os 7 pilares não-negociáveis de fato. Sprint 0: cada story adiciona um portão ao CI; ao fim, `main` só aceita merge com tudo verde. Detalhe e mapa pilar→gate em `QUALITY-GATE.md`. Todas as ferramentas são gratuitas (repositório **público**).

### Story 0.1: Toolchain base e pipeline de CI

As a construtor,
I want um repositório público com Biome, TypeScript e Vitest rodando no CI,
So that todo PR já passe pelos gates de estilo, tipo e teste.

**Acceptance Criteria:**

**Given** um repositório público e o esqueleto do projeto
**When** um PR é aberto
**Then** o CI roda Biome (lint+format), `tsc --noEmit` e Vitest, e falha o build se qualquer um falhar (pilares Funcional, Auditável).

### Story 0.2: Gate de cobertura de testes

As a construtor,
I want um limite mínimo de cobertura verificado no CI,
So that "ampla cobertura de testes" seja não-negociável (pilar Testado).

**Acceptance Criteria:**

**Given** a suíte Vitest com relatório de cobertura
**When** a cobertura fica abaixo do limite (`[SUPOSIÇÃO: 80%]`)
**Then** o build falha
**And** o relatório de cobertura fica visível no PR.

### Story 0.3: Segurança — SAST, SCA e segredos

As a construtor,
I want checagem de vulnerabilidade automática no CI,
So that nada inseguro chegue à main (pilar Seguro).

**Acceptance Criteria:**

**Given** o pipeline de CI
**When** um PR é aberto
**Then** rodam CodeQL (code scanning), Trivy (CVEs de dependências) e Gitleaks (segredos), e achados High/Critical bloqueiam o merge
**And** o Dependabot abre PRs de atualização de dependências vulneráveis.

### Story 0.4: Fronteiras da arquitetura (dependency-cruiser)

As a construtor,
I want o CI reprovando violações das camadas hexagonais,
So that o AD-1 seja cumprido por máquina, não por disciplina (pilar Escalável).

**Acceptance Criteria:**

**Given** regras de dependency-cruiser que codificam "dependências só para dentro" (AD-1)
**When** um import viola a direção (ex.: `domain` importando de `adapters`)
**Then** o CI falha apontando a violação.

### Story 0.5: Rastreabilidade — commits e PRs

As a construtor,
I want commits convencionais e PRs ligados a Story/FR,
So that toda mudança seja auditável (pilar Auditável).

**Acceptance Criteria:**

**Given** commitlint e um template de PR
**When** um commit foge do padrão convencional ou um PR não referencia Story/FR
**Then** o CI/checagem sinaliza e bloqueia o merge.

### Story 0.6: Code Review por IA (Claude Code)

As a construtor,
I want um review automático por IA a cada PR,
So that os pilares de julgamento (auditável, observável, escalável, performático) sejam cobertos além das ferramentas.

**Acceptance Criteria:**

**Given** a action `anthropics/claude-code-action` instalada (via `/install-github-app`) e autenticada pela assinatura Claude
**When** um PR é aberto (ou alguém comenta `@claude`)
**Then** o Claude analisa o diff e posta comentários de review focados nos 4 pilares de julgamento e em violações de AD
**And** a autenticação usa a assinatura (sem gasto extra de API).

### Story 0.7: Quality gate agregado e branch protection

As a construtor,
I want a branch main protegida exigindo todos os checks verdes,
So that o gateway seja o guardrail real do Definition of Done.

**Acceptance Criteria:**

**Given** SonarCloud (quality gate) conectado e todos os checks das stories 0.1–0.6 configurados
**When** um PR tenta mergear para `main`
**Then** o merge só é permitido com **todos** os gates verdes e o review por IA sem bloqueios abertos (todos os 7 pilares satisfeitos).

---

## Epic 1: Fundação segura & o primeiro Chamado

Estabelece o esqueleto hexagonal e entrega a primeira capacidade real ponta-a-ponta — abrir e ver um Chamado via MCP — segura por construção. Cada story cria apenas o que precisa; todas herdam os invariantes AD-1..AD-10.

### Story 1.1: Abrir um Chamado via MCP (tracer bullet)

As a Agente operando via IA,
I want abrir um Chamado chamando a tool `abrir_chamado` com título, descrição e categoria,
So that o problema fique registrado e rastreável desde o primeiro minuto.

**Acceptance Criteria:**

**Given** o servidor MCP no ar e o esqueleto hexagonal (`domain`/`application`/`adapters`)
**When** a IA chama `abrir_chamado(titulo, descricao, categoria)` com dados válidos
**Then** um Chamado é criado com Número sequencial legível (`#1042`) vindo de uma sequence do Postgres (AD-4)
**And** o Chamado nasce com Status "Aberto" e sem Dono, e a tool retorna o Número.

**Given** a mesma criação
**When** o command handler persiste o Chamado
**Then** grava, na mesma transação, um registro de Log de auditoria com autor e `origin=mcp` (AD-3)
**And** nenhum adapter escreve no banco direto — a mutação passa só pelo domínio (AD-2).

**Given** um input inválido (título vazio ou categoria fora da lista fixa)
**When** a tool é chamada
**Then** o domínio rejeita com erro tipado e nada é persistido.

### Story 1.2: Ver um Chamado via MCP

As a Agente operando via IA,
I want consultar um Chamado pela tool `ver_chamado(numero)`,
So that eu tenha o contexto completo antes de agir.

**Acceptance Criteria:**

**Given** um Chamado existente
**When** a IA chama `ver_chamado(numero)`
**Then** retorna todos os campos + a thread de Comentários em ordem cronológica (FR-2, FR-13)
**And** as datas vêm em ISO 8601/UTC.

**Given** um Número inexistente
**When** a tool é chamada
**Then** retorna erro "não encontrado", sem vazar existência de outros Chamados.

### Story 1.3: Autenticação e identidade

As a usuário (Agente ou Solicitante),
I want autenticar por magic link / login corporativo simples,
So that o sistema saiba quem sou em cada ação.

**Acceptance Criteria:**

**Given** um usuário com e-mail corporativo
**When** ele autentica
**Then** uma sessão identifica unicamente o principal `{identidade, papel, origin}` (FR-19)
**And** não há SSO/AD no MVP (fora de escopo).

**Given** um principal autenticado
**When** um caso de uso é invocado
**Then** o principal é injetado no handler (base para AD-8/AD-9).

### Story 1.4: Papéis e autorização

As a Solicitante,
I want ver apenas os meus Chamados e apenas Comentários Públicos,
So that a privacidade de terceiros seja preservada.

**Acceptance Criteria:**

**Given** dois papéis (Agente, Solicitante) e a autorização no domínio (AD-8)
**When** um Solicitante chama `ver_chamado` de um Chamado que não é seu
**Then** recebe erro de autorização (FR-2, FR-20).

**Given** um Agente autenticado
**When** ele consulta qualquer Chamado
**Then** vê todos os Chamados e todos os Comentários (públicos e internos).

### Story 1.5: Segurança do adapter MCP (token escopado + rate limit)

As a construtor,
I want que cada cliente MCP use token escopado por identidade e sofra rate limit,
So that uma IA em loop ou um token vazado não comprometam o sistema.

**Acceptance Criteria:**

**Given** o adapter MCP exposto
**When** um cliente se conecta
**Then** autentica com token escopado por identidade, e a identidade — não o nome da tool — é gravada como autor no audit (FR-21, AD-9).

**Given** um cliente excedendo o limite de chamadas
**When** o rate limit é atingido
**Then** novas chamadas são recusadas até a janela reabrir.

**Given** uma ação via token
**When** ela é auditada
**Then** o registro distingue "humano via IA" de agente autônomo pela identidade (AD-9).

### Story 1.6: E-mail de abertura

As a Solicitante,
I want receber um e-mail quando meu Chamado é aberto,
So that eu tenha o Número e o link para acompanhar.

**Acceptance Criteria:**

**Given** um port de notificação e um adapter de e-mail (SMTP/Resend)
**When** um Chamado é aberto
**Then** o Solicitante recebe e-mail com Número, Status e link (FR-18)
**And** o link também dá acesso no portal/consulta, mitigando spam.

### Story 1.7: Soft-delete base

As a construtor,
I want que exclusões sejam lógicas,
So that nada auditável seja perdido.

**Acceptance Criteria:**

**Given** a coluna de soft-delete nas entidades já existentes
**When** um Chamado/Comentário é "excluído"
**Then** ele é marcado como removido, nunca apagado fisicamente (FR-23 base, AD-3).

### Story 1.8: Revisão do Log de auditoria / ações MCP

As a Agente/Gestor,
I want ver o histórico de ações de um Chamado, distinguindo origem e identidade,
So that eu enxergue o que a IA fez e detecte erro antes que vire incêndio.

**Acceptance Criteria:**

**Given** um Chamado com mudanças registradas no Log de auditoria (AD-3, AD-9)
**When** um Agente/Gestor consulta o histórico do Chamado
**Then** vê cada ação com autor, timestamp e `origin` (api|mcp), distinguindo "humano via IA" de ação nativa
**And** consegue filtrar por ações de `origin=mcp` para revisar o que a IA executou (mitiga ação destrutiva invisível).

### Story 1.9: Abrir Chamado por e-mail (intake do Solicitante)

As a Solicitante sem interface própria no MVP,
I want abrir um Chamado enviando um e-mail para o endereço de suporte,
So that eu tenha uma porta de entrada própria antes da UI da Fase 1.5.

**Acceptance Criteria:**

**Given** um endereço de suporte (ex.: suporte@) monitorado pelo adapter de e-mail (direção de entrada)
**When** um Solicitante com e-mail corporativo reconhecido envia uma mensagem
**Then** um Chamado é aberto com Solicitante = remetente, Título = assunto e Descrição = corpo (passa pelo mesmo command de FR-1 e AD-2)
**And** o Solicitante recebe o e-mail de abertura com Número e link (reusa Story 1.6).

**Given** um remetente não reconhecido (fora da empresa)
**When** o e-mail chega
**Then** o Chamado não é criado e a origem é tratada com segurança (sem abrir porta a spam externo).

> **Nota de escopo:** esta capacidade de intake por e-mail foi adicionada ao MVP por decisão de produto (pré-mortem, "Morte 1" — risco de adoção). Antecipa o quick-win de e-mail que o PRD previa para depois; a UI do Solicitante permanece na Fase 1.5.

---

## Epic 2: Ciclo de vida do Chamado

O Agente conduz um Chamado do início ao fim via IA, com guardrails nas ações irreversíveis. Herdam Epic 1.

### Story 2.1: Comentar Chamado (público/interno)

As a Agente operando via IA,
I want adicionar Comentário Público ou Interno via `comentar_chamado`,
So that o andamento fique registrado e comunicável.

**Acceptance Criteria:**

**Given** um Chamado existente
**When** a IA chama `comentar_chamado(numero, texto, interno?)`
**Then** o Comentário é anexado com autor e timestamp (FR-3, FR-14)
**And** Comentário Interno nunca aparece para o Solicitante (AD-8).

**Given** um Solicitante
**When** ele comenta o próprio Chamado
**Then** só pode criar Comentário Público.

### Story 2.2: Mudar Status (máquina de estados)

As a Agente,
I want mudar o Status de um Chamado via `mudar_status`,
So that o estado reflita a realidade como fonte da verdade.

**Acceptance Criteria:**

**Given** a máquina de estados fechada definida no domínio (AD-5)
**When** a IA chama `mudar_status(numero, novo_status)`
**Then** só transições válidas são aceitas; inválidas são rejeitadas pelo domínio (FR-4)
**And** a mudança registra autor e origem no audit.

**Given** dois Agentes editando o mesmo Chamado
**When** o segundo salva com versão desatualizada
**Then** o command rejeita com `Conflict` (concorrência otimista, AD-10).

### Story 2.3: Atribuir Dono / self-assign

As a Agente,
I want atribuir um Chamado a mim ou a outro Agente via `atribuir_chamado`,
So that todo Chamado tenha um Dono claro.

**Acceptance Criteria:**

**Given** um Chamado sem Dono
**When** a IA chama `atribuir_chamado(numero, agente)` ou self-assign
**Then** o Dono é definido e a reatribuição registra Dono anterior e novo no audit (FR-5).

### Story 2.4: Mudar Prioridade

As a Agente,
I want ajustar a Prioridade via `mudar_prioridade`,
So that a urgência do Chamado fique correta.

**Acceptance Criteria:**

**Given** o conjunto fechado Baixa..Crítica
**When** a IA chama `mudar_prioridade(numero, prioridade)`
**Then** só valores válidos são aceitos (FR-6).

### Story 2.5: Resolver Chamado + e-mail de resolução

As a Agente,
I want marcar um Chamado como Resolvido,
So that o Solicitante saiba que foi atendido.

**Acceptance Criteria:**

**Given** um Chamado em andamento
**When** o Agente o Resolve
**Then** o Status vai para "Resolvido" e um e-mail de resolução é enviado ao Solicitante (FR-7, FR-18)
**And** o e-mail traz quem resolveu e o tempo total.

**Given** um Chamado que foi Reaberto e depois Resolvido novamente
**When** a nova resolução ocorre
**Then** um novo e-mail de resolução é disparado (a re-resolução re-notifica).

### Story 2.6: Ações irreversíveis com confirmação

As a Agente operando via IA,
I want que Fechar/Cancelar/Reabrir exijam confirmação explícita,
So that a IA não execute ações destrutivas sozinha.

**Acceptance Criteria:**

**Given** as tools `fechar_chamado`/`cancelar_chamado`/`reabrir_chamado` (Ações irreversíveis)
**When** a IA chama uma delas sem confirmação
**Then** o domínio retorna `ConfirmationRequired` e nada muda (FR-15, FR-17, AD-7).

**Given** a confirmação humana explícita
**When** a tool é chamada de novo com o sinal de confirmação
**Then** a ação executa e é auditada
**And** Reabrir volta o Status para "Em andamento" registrando o motivo.

---

## Epic 3: Fila, triagem e busca

Agente e Gestor enxergam e priorizam o trabalho. Inclui Resources/Prompts do MCP.

### Story 3.1: Filtrar a Fila

As a Agente,
I want listar a Fila filtrando por Status, Dono, Categoria/Time e texto via `buscar_chamados`,
So that eu foque no que importa.

**Acceptance Criteria:**

**Given** vários Chamados
**When** a IA chama `buscar_chamados` com filtros combinados
**Then** retorna a lista filtrada, ordenável por data de abertura (FR-8, FR-13)
**And** respeita a autorização do papel (AD-8).

### Story 3.2: Recortes "meus" e "sem Dono"

As a Agente,
I want recortes rápidos dos meus Chamados e dos sem Dono,
So that eu pegue trabalho sem garimpar.

**Acceptance Criteria:**

**Given** a Fila
**When** a IA pede o recorte "sem Dono" ou "meus"
**Then** cada recorte é de primeira classe, não um filtro escondido (FR-9).

### Story 3.3: Resumo da Fila

As a Gestor,
I want um resumo com contadores via `resumo_fila`,
So that eu enxergue carga e gargalos sob demanda.

**Acceptance Criteria:**

**Given** a Fila
**When** a IA chama `resumo_fila()`
**Then** retorna abertos por Status, por Time/Categoria e por Agente, sem navegar Chamado a Chamado (FR-10, FR-13).

### Story 3.4: Busca simples

As a Agente,
I want buscar Chamados por texto e Status via `buscar_chamados`,
So that eu não reabra um problema já resolvido.

**Acceptance Criteria:**

**Given** Chamados Resolvidos/Fechados
**When** a IA busca por texto
**Then** a busca cobre Título, Descrição e Comentários, incluindo Chamados encerrados (FR-11).

**Given** um Chamado migrado com `numero_legado`
**When** a IA busca pelo número antigo do sistema anterior
**Then** o Chamado é encontrado pelo `numero_legado` (suporta a migração do Epic 4).

### Story 3.5: Sugerir Chamados parecidos

As a Solicitante/Agente,
I want ver Chamados parecidos ao abrir via `chamados_parecidos`,
So that duplicados sejam evitados.

**Acceptance Criteria:**

**Given** um texto de abertura
**When** a IA chama `chamados_parecidos(texto)`
**Then** retorna sugestões por busca textual simples (FR-12)
**And** a sugestão não bloqueia a abertura.

### Story 3.6: MCP Resources e Prompt de triagem

As a Agente operando via IA,
I want Resources "chamado"/"fila" e um Prompt "triagem de chamado",
So that a IA tenha contexto barato e um fluxo de triagem pronto.

**Acceptance Criteria:**

**Given** o servidor MCP
**When** a IA lê o Resource "chamado"
**Then** retorna o mesmo conteúdo de `ver_chamado`, respeitando autorização (FR-16, AD-8).

**Given** o Prompt "triagem de chamado"
**When** a IA o invoca
**Then** recebe um template de triagem utilizável.

---

## Epic 4: Portabilidade & Migração de dados

O épico do corte do contrato: entrar e sair dos dados sem lock-in. Ataca cedo o risco do formato de import.

### Story 4.1: Export CSV

As a Agente/Gestor,
I want exportar Chamados em CSV,
So that os dados sejam da empresa e sem lock-in.

**Acceptance Criteria:**

**Given** a Fila com filtros aplicados
**When** o usuário exporta
**Then** o CSV cobre os Chamados dos filtros aplicados (FR-24).

### Story 4.2: Import CSV de migração

As a construtor,
I want importar o histórico do software atual via CSV,
So that o sistema tenha paridade de dados antes do corte.

**Acceptance Criteria:**

**Given** um CSV no formato de export do contratado (a confirmar)
**When** o import roda
**Then** cada Chamado importado recebe um Número nativo novo da sequence (AD-4 intacto) e o número do sistema antigo é preservado no campo `numero_legado` (referência, não identidade), evitando colisão de Número (FR-25)
**And** o histórico disponível é preservado, e linhas inválidas geram um relatório de erros sem abortar o lote inteiro.

**Given** o formato real do fornecedor ainda desconhecido
**When** esta story começar
**Then** o formato é levantado primeiro (risco atacado cedo, não na véspera do corte).

> **Sequência (ajuste do pré-mortem):** o *spike de descoberta do formato de export do contratado* é uma investigação **antecipada** — rodada cedo (em paralelo ao Epic 1), fora do caminho crítico do Epic 4 — para que o pesadelo do CSV apareça no início, não no fim.

### Story 4.4: Corte — baseline & validação de paridade

As a construtor,
I want medir o baseline atual e validar paridade rodando em paralelo antes de desligar,
So that o corte do contrato seja seguro e comprovado, não um salto no escuro.

**Acceptance Criteria:**

**Given** o software contratado ainda ativo
**When** o período de validação começa
**Then** o baseline de tempo médio de resolução atual é medido (SM-3) para provar "sem regressão".

**Given** o ServiceDesk rodando em paralelo ao contratado por ~1 mês
**When** a checklist de paridade é avaliada
**Then** confirma que 100% dos tipos de Chamado usados hoje funcionam no ServiceDesk, os 8 Agentes operam 100% dos novos Chamados nele e há zero Chamados perdidos fora dele (SM-1, SM-5)
**And** só com a checklist verde o contrato é recomendado para corte.

### Story 4.3: Soft-delete completo

As a construtor,
I want soft-delete garantido em todas as entidades,
So that nada seja perdido e tudo permaneça auditável.

**Acceptance Criteria:**

**Given** todas as entidades (Chamado, Comentário, Usuário)
**When** qualquer exclusão ocorre
**Then** é lógica, nunca física, e permanece no Log de auditoria (FR-23 completo, AD-3).
