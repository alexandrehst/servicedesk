-- Story 1.1 — esquema inicial do Chamado e do Log de auditoria.

-- AD-4: o Numero legivel vem desta sequence, nunca de codigo de aplicacao.
-- Comeca em 1000 para que o primeiro Chamado seja #1000 — numero de ticket
-- de quatro digitos e o formato que o PRD usa nos exemplos (#1042).
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START WITH 1000 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS tickets (
  id          bigserial PRIMARY KEY,
  number      integer     NOT NULL UNIQUE DEFAULT nextval('ticket_number_seq'),
  titulo      text        NOT NULL,
  descricao   text        NOT NULL,
  categoria   text        NOT NULL,
  status      text        NOT NULL,
  requester   text        NOT NULL,
  assignee    text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_entries (
  id            bigserial   PRIMARY KEY,
  ticket_number integer     NOT NULL,
  acao          text        NOT NULL,
  autor         text        NOT NULL,
  origin        text        NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_entries_ticket_number_idx
  ON audit_entries (ticket_number);
