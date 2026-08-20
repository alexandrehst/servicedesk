-- Story 4.3 — soft-delete completo (FR-23, AD-3, AD-7).
--
-- Tres mudancas, e cada uma destrava uma coisa que a story precisa.

-- =====================================================================
-- 1. O Usuario ganha soft-delete. E o buraco que a FR-23 tinha desde o
--    inicio: Chamado e Comentario tem `deleted_at` desde a 0006, `users`
--    nao tinha.
-- =====================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Indice parcial, no padrao da 0006: as consultas do dia a dia so olham os
-- vivos, e `users` e lida em TODO pedido autenticado (a sessao resolve o papel
-- por aqui) — e o caminho mais quente do sistema.
CREATE INDEX IF NOT EXISTS users_vivos_idx
  ON users (email) WHERE deleted_at IS NULL;

-- O UNIQUE de `email` NAO vira parcial, e isso e deliberado.
--
-- Torna-lo `UNIQUE ... WHERE deleted_at IS NULL` seria a saida obvia para
-- recadastrar quem saiu — e uma armadilha: o mesmo e-mail passaria a existir
-- duas vezes, e `buscarSessaoPorHash` casa `sessions.email` com `users.email`,
-- nao com um id. A sessao do usuario ANTIGO passaria a resolver para o NOVO,
-- herdando o papel dele. Recadastrar e problema de outra story; ate la, o
-- e-mail continua unico na tabela inteira.

-- =====================================================================
-- 2. O Log passa a registrar acao que NAO e sobre um Chamado.
--
--    Excluir um Usuario nao tem numero de Chamado a informar. Sem isto, ou a
--    acao nao seria auditada (violando o AD-3) ou inventariamos um numero
--    falso.
--
--    Uma SEGUNDA tabela de auditoria foi a alternativa recusada: o Log e UM
--    por decisao do projeto (FR-22) — "o que aconteceu neste sistema" e uma
--    pergunta so. Com duas, toda leitura futura teria de consultar as duas, e
--    a que fosse esquecida viraria o buraco.
--
--    O `audit_entries` continua SEM `deleted_at` (decisao da 1.7): e
--    append-only, e uma coluna de exclusao ali permitiria apagar a prova.
-- =====================================================================
ALTER TABLE audit_entries ALTER COLUMN ticket_number DROP NOT NULL;

-- O indice por `ticket_number` (0001) segue servindo: B-tree nao indexa NULL
-- por padrao, entao as entradas sem Chamado nao o incham — e as consultas do
-- historico, que filtram por igualdade, nunca as alcancam.

-- =====================================================================
-- 3. A confirmacao (AD-7) deixa de ser so sobre Chamado.
--
--    A 2.6 escopou o token por ticket_number + acao + identidade, e o
--    comentario da 0010 explica por que o escopo importa: "sem ela, uma
--    confirmacao de 'cancelar #1042' fecharia #1042".
--
--    Esta story expoe exclusao de Comentario e de Usuario, e nenhum dos dois e
--    um Chamado. O escopo vira um ALVO textual — `chamado:1042`,
--    `comentario:1042/7`, `usuario:x@empresa.com` — que amarra o OBJETO EXATO
--    da acao. Um token de "excluir usuario X" que servisse para o Y seria pior
--    que nao ter token.
-- =====================================================================
ALTER TABLE confirmacoes ADD COLUMN IF NOT EXISTS alvo text;

-- As confirmacoes que ja existem sao todas de Chamado (a 2.6 e a unica que as
-- emitia). Nenhuma sobrevive a migration na pratica — elas expiram em 5
-- minutos —, mas converter e mais barato que raciocinar sobre a janela.
UPDATE confirmacoes SET alvo = 'chamado:' || ticket_number WHERE alvo IS NULL;

ALTER TABLE confirmacoes ALTER COLUMN alvo SET NOT NULL;

-- `ticket_number` sai: duas fontes para a mesma pergunta e uma delas
-- desatualizada e questao de tempo. O Log do PEDIDO continua guardando o
-- numero quando ha um, porque quem le o historico de um Chamado precisa
-- encontra-lo la.
ALTER TABLE confirmacoes DROP COLUMN IF EXISTS ticket_number;
