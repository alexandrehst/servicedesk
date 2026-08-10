-- Story 1.6 — link de acesso ao Chamado enviado no e-mail de abertura.
--
-- FR-18 pede que o e-mail leve "Numero, Status e link", e que o link de acesso
-- ao Chamado. Decidido em 2026-08-10: magic link com escopo de UM Chamado,
-- valido por 7 dias e REUTILIZAVEL.
--
-- Reutilizavel e o oposto do link de login (Story 1.3), e de proposito: quem
-- pede login usa o link em seguida; quem recebe e-mail de abertura clica,
-- fecha a aba e volta no dia seguinte para ver se responderam. Uso unico aqui
-- geraria mais pedidos de acesso, nao menos.
CREATE TABLE IF NOT EXISTS ticket_access_links (
  id            bigserial   PRIMARY KEY,
  -- Escopo minimo: da acesso a ESTE Chamado. Um e-mail encaminhado por engano
  -- expoe um Chamado, nao a caixa inteira do Solicitante.
  ticket_number integer     NOT NULL,
  email         text        NOT NULL,
  -- Como todo token do projeto: o banco ve o hash, nunca o token.
  token_hash    text        NOT NULL UNIQUE,
  expira_em     timestamptz NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_access_links_ticket_idx
  ON ticket_access_links (ticket_number);
