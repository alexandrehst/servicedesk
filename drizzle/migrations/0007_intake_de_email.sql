-- Story 1.9 — intake por e-mail (FR-1).
--
-- Uma linha por mensagem que virou Chamado. A tabela existe por um motivo so:
-- reentrega e comportamento NORMAL de SMTP. Um servidor que nao recebe
-- confirmacao a tempo entrega de novo, e sem esta tabela cada reentrega abriria
-- um Chamado novo — o mesmo problema relatado duas, tres vezes.
--
-- O UNIQUE e a garantia de verdade. Ler antes de inserir resolve o caso comum,
-- mas duas entregas simultaneas passam pelas duas leituras antes de qualquer
-- insert; so uma restricao do banco fecha essa janela. Mesmo raciocinio do
-- `consumirLinkDeLogin` atomico da Story 1.3: a garantia e do banco, nao da
-- ordem em que o codigo roda.
CREATE TABLE IF NOT EXISTS email_intake (
  id            bigserial   PRIMARY KEY,
  -- O `Message-ID` do RFC 5322, como veio. E opcional no padrao: mensagem sem
  -- ele nao pode ser deduplicada e e recusada antes de chegar aqui.
  message_id    text        NOT NULL UNIQUE,
  -- Qual Chamado a mensagem virou. Permite responder a reentrega apontando o
  -- Chamado que ja existe, em vez de so ignorar em silencio.
  ticket_number integer     NOT NULL,
  recebido_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_intake_ticket_idx
  ON email_intake (ticket_number);
