-- Story 2.4 — Prioridade do Chamado (FR-6).
--
-- NOT NULL com DEFAULT, e nao nulavel: prioridade nula seria um terceiro
-- estado ("sem prioridade") que a fila do Epic 3 teria que tratar em toda
-- ordenacao e que nao significa nada para quem atende. Um Chamado sem urgencia
-- declarada TEM urgencia: a normal.
--
-- O DEFAULT tambem resolve as linhas que ja existem — elas nasceram antes de a
-- Prioridade existir, e 'media' e a leitura correta delas.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'media';
