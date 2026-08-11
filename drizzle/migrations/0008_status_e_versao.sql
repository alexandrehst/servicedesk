-- Story 2.2 — maquina de estados e concorrencia otimista (FR-4, AD-5, AD-10).

-- O AD-10 existia so no papel desde o inicio do projeto: nenhuma coluna, nenhum
-- erro, nenhuma checagem. O Epic 1 nao precisou porque so criava e lia.
--
-- `version` em vez de `updated_at` por uma razao medida: a mutacao e sua
-- auditoria saem na MESMA transacao (licao da Story 1.8), entao dois registros
-- com o mesmo instante sao o caso comum aqui. Um relogio usado como versao
-- perderia exatamente onde precisaria distinguir.
--
-- DEFAULT 1 para as linhas que ja existem: elas nunca foram mutadas, entao
-- comecam na primeira versao.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- O par de/para no Log de auditoria.
--
-- Duas colunas de texto, e nao um `detalhe jsonb`: TODA mudanca do Epic 2 e de
-- um valor escalar para outro — Status (2.2), Dono (2.3), Prioridade (2.4).
-- Um jsonb aceitaria qualquer coisa, inclusive o corpo de um Comentario, que a
-- Story 2.1 deliberadamente manteve fora do Log; e o contrato de saida do
-- historico (1.8) teria que expor forma livre.
--
-- NULOS porque nem toda acao tem par: `abrir_chamado` e `comentar_chamado` nao
-- mudam valor nenhum. Preencher com 'nenhum' seria inventar um evento.
ALTER TABLE audit_entries
  ADD COLUMN IF NOT EXISTS de   text;

ALTER TABLE audit_entries
  ADD COLUMN IF NOT EXISTS para text;
