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

**Decidido em 2026-08-10 (Story 1.9, intake por e-mail — seis decisões por delegação):**

1. **Autenticidade do remetente é exigida, e quem a verifica é o servidor de recepção.** O ServiceDesk lê o veredito de `Authentication-Results` (RFC 8601) e só aceita `dmarc=pass` ou `dkim=pass`. **`spf=pass` sozinho não basta** — SPF valida o envelope (`MAIL FROM`), e a identidade usada é o cabeçalho `From`; são campos diferentes e nada obriga que combinem. **Ausência de cabeçalho é recusa, não permissão.** Só o **primeiro** `Authentication-Results` vale: qualquer remetente pode escrever um, e o servidor de recepção adiciona o dele no topo.
2. **`origin` ganhou o valor `email`**, ao lado de `api` e `mcp`. Reaproveitar `api` faria o Log afirmar algo falso e cegaria a revisão da Story 1.8, que filtra por esse campo.
3. **Categoria `nao_classificado` entrou na lista fixa.** Quem manda e-mail não escolhe categoria e não há formulário para perguntar. Não é sinônimo de "outros": "outros" afirma que alguém avaliou e não era nenhuma das anteriores; `nao_classificado` afirma que ninguém avaliou — só a segunda é verdade num intake automático, e é ela que a triagem do Epic 3 vai querer filtrar.
4. **Deduplicação por `Message-ID`, garantida por `UNIQUE` no banco**, gravada na mesma transação da abertura (AD-3). Reentrega é comportamento normal de SMTP; a leitura prévia cobre o caso comum e a restrição cobre a corrida. Mensagem **sem** `Message-ID` é recusada — sem ele não há como deduplicar.
5. **Direção de entrada: IMAP com polling.** Webhook exigiria endpoint público, e a topologia de deploy segue `Deferred`. Bibliotecas: `imapflow` e `mailparser`, do mesmo autor do Nodemailer (Story 1.6).
6. **Remetente não reconhecido: recusa silenciosa.** Nada volta para o remetente — nem "você não está cadastrado". Bounce automático para endereço forjado transforma o suporte em amplificador de spam e confirma a quem sonda que o endereço existe (mesmo raciocínio da resposta cega do FR-19). Para dentro, toda recusa vira registro estruturado, **sem** assunto nem corpo.

**Campos ausentes na mensagem:** assunto vazio vira `(sem assunto)`; corpo vazio faz a Descrição receber o assunto; **ambos** vazios é recusa.

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

**Decidido em 2026-08-11 (Story 2.1):**

- **A capacidade é `comentaInterno`, não "comentar".** O Solicitante comenta o próprio Chamado — é a única escrita que ele tem no sistema; o que ele não pode é criar Comentário **Interno**. Posse quem resolve é `visivelPara`; a matriz de papéis decide só o "interno".
- **Pedido de Comentário Interno por quem não pode é recusado com `SemPermissao`**, e não rebaixado em silêncio para público: quem escreveu achando que era interno veria o texto aparecer para quem quis esconder.
- **O default de `interno` é `false`** no contrato Zod — quem não pediu conversa do time não cria uma por acidente.
- **A ação auditada distingue** `comentar_chamado` de `comentar_chamado_interno`: quem revisa o que a IA fez (FR-22, Story 1.8) precisa saber se ela criou conversa interna. **O corpo do Comentário não vai para o Log** — `audit_entries` é append-only e não tem soft-delete, então o texto viraria uma cópia que sobreviveria à exclusão do Comentário.
- **Comentar não usa concorrência otimista** (refinamento do AD-10, registrado na spine): é escrita aditiva, e não há update a perder.

#### FR-4: Mudar status
Um Agente pode alterar o Status de um Chamado entre os valores do conjunto fechado. Realiza UJ-1.
**Consequências (testáveis):**
- Só transições para valores válidos do Glossário são aceitas.
- Mudança registra autor e origem no Log de auditoria.

**Decidido em 2026-08-11 (Story 2.2):**

- **A máquina de estados tem duas tabelas.** `mudar_status` executa as transições comuns (`aberto→em_andamento`, `em_andamento→resolvido`, `em_andamento→aberto`, `resolvido→em_andamento`). Fechar, cancelar e reabrir ficam numa tabela separada e só a Story 2.6 as executa, com confirmação explícita (AD-7) — senão a tool genérica seria uma porta dos fundos para a IA encerrar Chamado sem human-in-the-loop.
- **`em_andamento→aberto` é comum, e não é reabertura:** devolver um Chamado à fila acontece quando o Agente percebe que não é com ele. Reabrir traz de volta algo já encerrado.
- **Concorrência otimista com coluna `version`** (AD-10), verificada no próprio `UPDATE`. A versão é obrigatória no contrato e sai em `ver_chamado`.
- **Mudar Status é atendimento:** capacidade `mudaStatus` só do Agente. O Solicitante acompanha e comenta o próprio Chamado, mas não declara que ele está resolvido.
- **A autorização vem antes da validação da transição:** um Solicitante pedindo transição inválida recebe `SemPermissao`, não `TransicaoInvalida` — o segundo lhe ensinaria como a máquina funciona sem que ele tenha direito de agir.
- **O Log passa a registrar o par `de`/`para`** em duas colunas de texto (nulas quando a ação não muda valor). Não `jsonb`: toda mudança do Epic 2 é de um valor escalar para outro, e forma livre aceitaria até o corpo de um Comentário, que a 2.1 manteve fora do Log de propósito.

#### FR-5: Atribuir responsável
Um Agente pode atribuir o Dono de um Chamado a si (self-assign) ou a outro Agente. Realiza UJ-1.
**Consequências (testáveis):**
- Chamado "sem Dono" é claramente identificável na Fila (FR-9).
- Reatribuição registra Dono anterior e novo no Log de auditoria.

**Decidido em 2026-08-11 (Story 2.3):**

- **O destinatário é verificado no cadastro, e precisa poder atender.** Atribuir a um Solicitante — ou a um e-mail que ninguém usa — produz um Chamado que *parece* ter Dono e não tem: a fila o mostraria como atendido e ninguém estaria atendendo.
- **"Não está cadastrado" e "não é Agente" devolvem a MESMA resposta.** Distingui-las transformaria a tool num verificador de quadro de funcionários (mesmo raciocínio da resposta cega do FR-19).
- **Capacidade `recebeAtribuicao`, separada de `atribuiChamado`:** "pode distribuir trabalho" e "pode receber trabalho" hoje coincidem porque só há um papel de atendimento, mas não são a mesma pergunta — um Gestor que distribui sem atender quebraria a coincidência.
- **Self-assign é a ausência do campo `agente`**, não um valor mágico. E também passa pelo cadastro: um Agente removido de `users` não pega Chamado para si.
- **Reatribuir ao mesmo Dono é recusado** — não é mudança, e gravaria no Log um evento que não aconteceu (mesmo raciocínio da auto-transição do FR-4). A comparação é sobre o e-mail **normalizado**.
- **O Log registra Dono anterior → novo** nas colunas `de`/`para` da Story 2.2, com `de` **nulo** na primeira atribuição.

**Dívida paga aqui:** a coluna `assignee` existia desde a Story 1.1, mas o adapter devolvia `null` **fixo** nas três leituras. Ninguém notou porque nada atribuía Dono; a partir desta story teria virado bug visível.

#### FR-6: Mudar prioridade
Um Agente pode alterar a Prioridade de um Chamado.
**Consequências (testáveis):**
- Aceita apenas valores do conjunto fechado (Baixa…Crítica).

**Decidido em 2026-08-11 (Story 2.4):**

- **Todo Chamado nasce com Prioridade** (`media`), e a coluna é `NOT NULL`. Prioridade nula seria um terceiro estado — "sem prioridade" — que a fila do Epic 3 teria que tratar em toda ordenação e que não significa nada para quem atende: um Chamado sem urgência declarada **tem** urgência, a normal.
- **`prioridade` entra em `NovoTicket`**, e isso é o oposto de `number`, `version` e `excluidoEm` — aqueles só existem depois de persistir; Prioridade existe antes, porque é escolha de quem abre, não efeito da gravação. O campo é **opcional** na abertura, então o intake por e-mail (FR-1) e a tool `abrir_chamado` não passaram a exigir nada novo.
- **Só o Agente muda a Prioridade.** Ela é **comparativa** — ordena um Chamado contra os outros — e quem enxerga a fila inteira é quem atende. Um campo de urgência preenchido por quem abre vira, na prática, uma coluna onde todo mundo escreve "crítica"; o Solicitante tem a Descrição e o Comentário (FR-3) para explicar a urgência dele.
- **Valores em minúsculas sem acento** (`baixa`, `media`, `alta`, `critica`), como todos os enums do projeto. A apresentação com acento é de quem exibe.
- **Pedir a prioridade que o Chamado já tem é recusado** (`PrioridadeInalterada`) — não é mudança, e gravaria no Log um evento que não aconteceu.

#### FR-7: Encerrar, cancelar e reabrir
Um Agente pode Resolver, Fechar, Cancelar ou Reabrir um Chamado. Fechar, Cancelar e Reabrir são Ações irreversíveis.
**Consequências (testáveis):**
- Chamado aberto por engano pode ir para "Cancelado".
- Reabrir um Chamado Resolvido/Fechado volta o Status para "Em andamento" e registra o motivo.
- Via MCP, estas ações exigem confirmação humana (FR-17).

**Decidido em 2026-08-18 (Story 2.5):**

- **Resolver NÃO ganhou ação dedicada.** `em_andamento → resolvido` já está em `TRANSICOES` desde a Story 2.2, e o e-mail de resolução é consequência da transição, dentro do command `mudarStatus`. Uma tool própria criaria uma **segunda porta** para o mesmo estado, e uma delas não avisaria ninguém; fechá-la exigiria uma terceira tabela de transições para não ganhar garantia nenhuma. Como o command é o único caminho de escrita (AD-2), MCP, HTTP e a UI da Fase 1.5 herdam a notificação sem poder pulá-la. Isso separa Resolver das três **irreversíveis** (FR-15, FR-17, AD-7), que continuam com ações dedicadas na Story 2.6.
- **Sem capacidade nova.** `mudaStatus` já responde à pergunta: declarar que o problema acabou é atendimento.
- **Sem rótulo novo no Log.** A resolução grava `mudar_status` com o par `em_andamento`/`resolvido` — a informação já está lá, e um rótulo próprio criaria duas formas de registrar o mesmo fato.
- **Sem coluna `resolved_at`.** O instante da resolução vive no Log (`audit_entries.registrado_em`, append-only, FR-22). Uma coluna seria segunda fonte da verdade sobre o mesmo fato.

**Decidido em 2026-08-18 (Story 2.6):**

- **As três irreversíveis ganharam ações dedicadas**, com um **único** command parametrizado por `ACOES_IRREVERSIVEIS` (domínio) e três tools finas. O que varia entre fechar, cancelar e reabrir — destino, capacidade, exigir motivo — é dado, não código.
- **Duas capacidades, não uma:** `fechaOuCancela` e `reabre`. "Encerrar" e "trazer de volta" são decisões diferentes que hoje coincidem só porque existe um único papel de atendimento — mesma separação de `atribuiChamado`/`recebeAtribuicao` (FR-5).
- **O motivo da reabertura vai para `audit_entries.motivo`**, não para um Comentário: o Log é append-only (FR-22) e o Comentário tem soft-delete, então o motivo viraria prova que alguém pode apagar. Consequência aceita: o Solicitante não vê o motivo, porque não vê o Log.
- **Motivo em branco é recusado** (`MotivoObrigatorio`), e a exigência vive no **domínio**, não no schema Zod — senão o adapter HTTP e a UI da Fase 1.5 dependeriam de lembrar dela (AD-7).
- **A confirmação é consumida ANTES do `UPDATE`:** se a versão divergiu, o token já queimou. O humano confirmou "fechar o Chamado **na versão N**", e a versão mudou.

**NFRs específicos:** edição concorrente de um mesmo Chamado por dois Agentes deve ser detectada (aviso ou trava otimista) para evitar sobrescrita silenciosa.

### 4.2 Fila e Triagem

**Descrição:** A visão operacional dos Chamados para o Agente e o resumo gerencial. Realiza UJ-1, UJ-3.

#### FR-8: Filtrar a fila
Um Agente pode listar/filtrar a Fila por Status, Dono, Categoria/Time e texto livre.
**Consequências (testáveis):**
- Filtros combináveis; resultado ordenável por data de abertura.

**Decidido em 2026-08-18 (Story 3.1):**

- **A autorização de lista acontece em DUAS camadas.** O domínio decide o que a pessoa alcança (`escopoDeLeitura`) e entrega isso como **dado**; o adapter traduz para `WHERE` sem decidir nada; e o domínio **reaplica** a decisão sobre o que voltou (`filaVisivelPara`). Filtrar só em memória leria a base para devolver 20 linhas; filtrar só no SQL faria a autorização descer para fora do domínio, e MCP e HTTP poderiam divergir (AD-8). Com as duas, se o `WHERE` errar o custo é consulta ineficiente, não vazamento.
- **A linha da Fila é um RESUMO** — Número, Título, Status, Prioridade, Dono e data. Sem Descrição e sem Comentários: cinquenta Chamados inteiros são ilegíveis para a IA e trafegam mais do que a lista precisa mostrar. Quem quer conteúdo chama `ver_chamado`, que passa por `visivelPara` e filtra Comentário Interno.
- **Limite padrão 20, teto 100 no schema.** A IA é o consumidor primário (FR-13) e uma lista sem teto estoura o contexto dela. Pedir acima do teto é **recusado**, não truncado: truncar em silêncio faria a IA concluir que viu tudo.
- **`temMais` em vez de `total`.** O adapter pede `limite + 1` linhas; um `COUNT(*)` custaria uma segunda varredura por um número que ninguém usa — quem quer números tem o `resumo_fila` (FR-10).
- **Ordenação por data de abertura com desempate por Número**, crescente por padrão (o mais antigo primeiro, como se atende uma fila). Sem o desempate, dois Chamados abertos no mesmo instante saem na ordem física e a paginação por deslocamento duplica e omite linhas entre páginas.
- **Ordenar por Prioridade ficou fora**, e é decisão registrada: a AC pede data de abertura, e ordenar por Prioridade exige mapear a ordem semântica de `PRIORIDADES` no SQL. O teste que trava a sequência `baixa→crítica` (FR-6) continua guardando a invariante até alguém pedir.
- **O filtro por TEXTO é da Story 3.4**, junto do índice textual e da decisão sobre o match em Comentário Interno. Esta story faz filtros estruturados: Status, Dono e Categoria. `buscar_chamados` **ganha** o parâmetro de texto lá — não vira outra tool.

#### FR-9: Recortes "meus" e "sem dono"
Um Agente pode ver rapidamente os Chamados que são seus e os que estão sem Dono.
**Consequências (testáveis):**
- "Sem Dono" é um recorte de primeira classe, não um filtro escondido.

**Decidido em 2026-08-18 (Story 3.2):**

- **O recorte é um campo próprio** (`recorte: 'meus' | 'sem_dono'`), e não um valor especial de `dono`. É isso que o torna de primeira classe: tem nome no protocolo e a IA o descobre lendo o schema da tool. `dono: null`, `dono: ''` ou uma string mágica seriam exatamente o filtro escondido que a FR proíbe — e a Story 3.1 tinha deixado `dono` com um único significado para a ausência ("não filtre").
- **`meus` = "sou o DONO", com a identidade vindo do principal autenticado**, nunca de um parâmetro. Se fosse açúcar para "preencha `dono` com a sua identidade", quem chama teria que saber e escrever a identidade — e escreveria errado em algum momento.
- **A definição de `meus` é única para todo papel.** Um recorte que significasse coisas diferentes conforme quem pergunta ("que eu atendo" para o Agente, "que eu abri" para o Solicitante) seria impossível de auditar: duas pessoas leriam o mesmo nome e receberiam regras distintas, e o resumo da fila (FR-10) teria que replicar a bifurcação. **Consequência aceita:** para o Solicitante, `meus` devolve vazio — ele nunca recebe atribuição (FR-5) —, e os Chamados que ele abriu já são o escopo padrão dele.
- **`recorte` + `dono` juntos são recusados** (`RecorteConflitante`), inclusive quando concordam: os dois filtram por Dono, e aceitar ambos exigiria escolher um vencedor em silêncio. A recusa vive **no domínio**, não num `.refine()` do schema, para que todo ponto de entrada a herde.
- **Recorte não amplia escopo.** Autorização (`escopoDeLeitura`) e consulta (`filtroDeDono`) entram no mesmo `WHERE` e se somam: um Solicitante pedindo "sem Dono" recebe *os dele* sem Dono.

#### FR-10: Resumo da fila
Um Agente ou Gestor pode obter contadores da Fila: abertos por Status, por Time/Categoria e por Agente. Realiza UJ-3.
**Consequências (testáveis):**
- Retorna números agregados sem exigir navegação por Chamados.

**Decidido em 2026-08-18 (Story 3.3):**

- **Um contador é um oráculo**, e por isso a autorização vale para o agregado: contar Chamado que a pessoa não pode ver **é** vazar. O Solicitante recebe o resumo **dos Chamados dele**.
- **A segunda camada do AD-8 não existe aqui.** Nas leituras de lista (FR-8, FR-9) o domínio reaplica a regra sobre os itens que voltam; um resumo **não tem itens**. Se o `WHERE` errar, os números saem errados e nada os corrige — e `{ aberto: 47 }` parece igualmente certo para quem tem 47 e para quem deveria ver 3. **A substituição:** o repositório devolve, junto dos números, o **escopo que aplicou**, e o domínio **recusa** o resumo se ele não for o escopo de quem pergunta. O que se confere não são os dados, é a pergunta que os produziu.
- **O resumo mede CARGA:** `fechado` e `cancelado` ficam fora, e excluídos também. Contá-los faria o eixo por Dono virar o histórico de quem mais fechou Chamado no ano — ruído no lugar de sinal. **`resolvido` entra:** ainda pode ser reaberto (FR-7) e é trabalho aguardando confirmação.
- **"Sem Dono" é campo próprio** (`semDono`), não uma chave nula no eixo por Dono — em JSON `null` vira a string `"null"` e colidiria com uma identidade assim chamada, além de esconder justamente o gargalo que motiva o resumo (mesmo raciocínio do recorte de primeira classe, FR-9).
- **Zero é resposta; ausência não é.** Os eixos fechados (Status, Categoria) vêm completos, com zero onde não há Chamado: omitir obriga quem lê a saber a lista de cor e apaga a informação "não há nada aqui". O eixo por Dono é aberto, então só traz quem tem Chamado.
- **`resumo_fila()` não tem parâmetros.** Filtrar o resumo não foi pedido, e `buscar_chamados` já responde à pergunta recortada — duas superfícies para a mesma coisa é o que a FR-9 evitou.

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

**Decidido em 2026-08-18 (Story 2.6):**

- **A confirmação é um TOKEN emitido pelo servidor, não um booleano.** Um `confirmar: true` seria um campo que *quem chama preenche*: uma IA que lê "preciso de `confirmar: true`" preenche na tentativa seguinte, sozinha, e o guardrail nunca dispara — enquanto o AD-7 existe justamente para impedir que o caminho MCP pule o human-in-the-loop. A execução exige um valor que o **servidor emitiu**, para **aquele Chamado**, **aquela ação** e **aquela identidade**.
- **Uso único, 5 minutos.** Não os 15 do login nem os 7 dias do link de acesso: a janela é "quanto tempo é razoável entre a IA perguntar e o humano responder na mesma conversa". Consumo atômico no `UPDATE`, como o link de login (FR-19).
- **Resposta cega.** Não mandou confirmação, mandou de outra ação/Chamado/identidade, expirada ou já usada — todos recebem `ConfirmationRequired`. Distinguir "expirou" de "não existe" só ensina a sondar.
- **O pedido é auditado.** `solicitar_confirmacao` entra no Log com o par `de`/`para`. Sem isso não haveria como distinguir "o humano confirmou" de "a IA se auto-confirmou em 200 ms" — e como o servidor não pode impedir a segunda, registrar é o que resta.
- **Limite conhecido:** nenhum protocolo do lado do servidor prova que um humano confirmou. O que existe é que nada muda sem o sinal, o sinal é um fato no banco, e as duas etapas ficam no Log com seus instantes.

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

**Decidido em 2026-08-18 (Story 2.5):** o segundo e último e-mail do MVP.

- **O e-mail de resolução traz quem resolveu e o tempo total**, além de Número, Título e link. "Quem resolveu" é a identidade de **quem executou a ação** (AD-9), não o Dono — os dois podem ser pessoas diferentes. É uma exceção consciente à Story 1.8, que esconde o Log do Solicitante: o Log expõe **todas** as identidades e **todos** os tempos; o e-mail expõe **um** Agente, no **próprio** Chamado dele, e é o que ele precisa para saber a quem responder.
- **O "tempo total" é frase do domínio** (`duracaoLegivel`), com granularidade única arredondada para baixo — `"3 horas"`, `"2 dias"`. Se o adapter a montasse, a UI da Fase 1.5 escreveria a sua e o mesmo Chamado teria dois tempos diferentes. Duração nula ou negativa (relógio para trás) vira `"menos de um minuto"`, nunca um número negativo.
- **A re-resolução re-notifica.** Nada guarda "já avisei": um Chamado devolvido ao atendimento e resolvido de novo é evento novo para quem abriu.
- **Escrita que não aconteceu não notifica.** Conflito de versão (AD-10) ou Chamado excluído no meio do caminho não disparam e-mail — a mesma regra da auditoria na Story 1.7.
- **Nenhum outro evento notifica.** Comentário, atribuição e prioridade não geram e-mail: a caixa de entrada de quem abriu um Chamado não pode virar o log de tudo o que o time faz.

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
**Decidido em 2026-08-10 (Story 1.8):** o histórico de um Chamado é visível **só para Agente** — nem o Solicitante dono o vê, porque o Log expõe identidade de Agentes e o ritmo interno do time. Ações que **não** são de Chamado (login, emissão/revogação de token de máquina) seguem **fora** do Log: `audit_entries.ticket_number` é obrigatório, e alargá-lo misturaria log de negócio com log de segurança, que têm públicos e retenções diferentes. Se a necessidade aparecer, tabela separada.

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
