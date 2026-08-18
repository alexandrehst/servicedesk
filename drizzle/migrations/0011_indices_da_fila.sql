-- Story 3.1 — indices da Fila (FR-8).

-- Ate aqui `tickets` tinha UM indice util: `tickets_vivos_idx (number) WHERE
-- deleted_at IS NULL`, que serve `ver_chamado`. Nada cobria `requester`,
-- `status` ou `assignee` — e o Epic 1 e o Epic 2 nunca precisaram, porque toda
-- leitura era por Numero. A Fila varre.
--
-- Todos PARCIAIS (`WHERE deleted_at IS NULL`), no padrao da migration 0006: a
-- consulta de lista nunca alcanca Chamado excluido, entao o indice nao precisa
-- carrega-lo. Indice menor cabe em memoria e a escrita paga menos.

-- O ESCOPO do Solicitante (AD-8): entra em TODA consulta de lista feita por
-- quem nao ve Chamado de terceiro. E o filtro mais seletivo que existe aqui —
-- ~100 funcionarios, entao cada um alcanca uma fatia pequena.
CREATE INDEX IF NOT EXISTS tickets_fila_requester_idx
  ON tickets (requester, criado_em, number) WHERE deleted_at IS NULL;

-- A fila por Status, ja na ordem em que ela e lida. O `criado_em, number` no
-- indice evita ordenar depois de filtrar: o plano sai do indice ordenado.
CREATE INDEX IF NOT EXISTS tickets_fila_status_idx
  ON tickets (status, criado_em, number) WHERE deleted_at IS NULL;

-- "Meus" e "sem Dono" (Story 3.2, logo em seguida). Entra agora porque o
-- filtro por Dono ja existe nesta story, e um indice criado junto do filtro
-- que o exige e mais facil de justificar do que um criado "por precaucao".
CREATE INDEX IF NOT EXISTS tickets_fila_assignee_idx
  ON tickets (assignee, criado_em, number) WHERE deleted_at IS NULL;

-- Sem indice para `categoria`: ela quase nunca vem sozinha — o uso real e
-- "abertos de rede", combinado com Status, e o indice de Status ja reduz o
-- conjunto. Indice que ninguem usa custa escrita em toda mutacao do Epic 2.
