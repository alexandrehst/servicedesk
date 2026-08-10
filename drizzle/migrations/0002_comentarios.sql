-- Story 1.2 — tabela de Comentarios.
-- A ESCRITA e a Story 2.1; aqui a estrutura existe para a leitura ter o que ler.

CREATE TABLE IF NOT EXISTS comments (
  id            bigserial   PRIMARY KEY,
  ticket_number integer     NOT NULL,
  autor         text        NOT NULL,
  corpo         text        NOT NULL,
  -- Publico (false) ou Interno (true). Solicitante so ve publicos (FR-2, AD-8).
  internal      boolean     NOT NULL DEFAULT false,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_ticket_number_idx
  ON comments (ticket_number, criado_em);
