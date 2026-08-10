-- Story 1.7 — soft-delete base (FR-23).
--
-- Exclusao vira marcacao: a linha permanece no banco e continua auditavel.

ALTER TABLE tickets  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- `audit_entries` NAO recebe a coluna, e isso e deliberado.
--
-- O Log de auditoria e append-only (FR-22). Dar a ele um `deleted_at` seria
-- oferecer um jeito de "excluir" a prova de que algo aconteceu — exatamente o
-- que o FR-23 existe para impedir. Quem apagasse o rastro teria o rastro do
-- apagamento apagado junto.

-- Indice parcial: as consultas do dia a dia so olham os NAO excluidos, entao o
-- indice cobre so eles. Um indice completo carregaria linhas que nenhuma
-- consulta comum alcanca.
CREATE INDEX IF NOT EXISTS tickets_vivos_idx
  ON tickets (number) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS comments_vivos_idx
  ON comments (ticket_number, criado_em) WHERE deleted_at IS NULL;
