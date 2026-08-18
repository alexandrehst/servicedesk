-- Story 2.6 — acoes irreversiveis com confirmacao (FR-7, FR-15, FR-17, AD-7).

-- O AD-7 existia so no papel desde o inicio do projeto: nenhuma tabela, nenhum
-- erro, nenhum sinal de confirmacao em contrato nenhum. A Story 2.2 declarou as
-- transicoes irreversiveis em `TRANSICOES_COM_CONFIRMACAO` e deliberadamente
-- NAO as executou, para que `mudar_status` nao virasse porta dos fundos. Esta
-- migration constroi o caminho que faltava.
--
-- Por que uma TABELA, e nao um booleano `confirmar` no input da tool:
--
-- Um booleano e um campo que QUEM CHAMA preenche. Uma IA que recebe "preciso de
-- confirmar: true" preenche na tentativa seguinte, sozinha, e o guardrail nunca
-- dispara — enquanto o AD-7 existe justamente para impedir que o caminho MCP
-- pule o human-in-the-loop. Com a tabela, executar exige um valor que o SERVIDOR
-- emitiu, para aquele Chamado, aquela acao e aquela identidade.
--
-- Mesmo desenho de `login_links` (Story 1.3): o banco guarda HASH, o token cru
-- existe uma vez na resposta, o consumo e atomico e o uso e unico.
CREATE TABLE IF NOT EXISTS confirmacoes (
  id            bigserial PRIMARY KEY,
  ticket_number integer     NOT NULL,
  -- A acao que este token autoriza. O escopo e a razao de existir da coluna:
  -- sem ela, uma confirmacao de "cancelar #1042" fecharia #1042.
  acao          text        NOT NULL,
  -- A identidade a quem o token foi emitido (AD-9). Confirmacao nao e
  -- transferivel: quem pediu e quem executa.
  identity      text        NOT NULL,
  token_hash    text        NOT NULL UNIQUE,
  expira_em     timestamptz NOT NULL,
  -- NULL = ainda nao usado. O consumo marca aqui, no proprio UPDATE.
  usado_em      timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

-- O consumo busca por hash e a coluna ja e UNIQUE, entao o indice do UNIQUE
-- basta. Nao ha indice por `ticket_number`: a tabela e consultada por token, e
-- indice que ninguem usa e custo de escrita em toda emissao.

-- O motivo da REABERTURA (FR-7: "reabrir volta o Status para Em andamento e
-- registra o motivo").
--
-- Vai para o Log, e nao para um Comentario, por duas razoes:
--
-- 1. `audit_entries` e append-only (FR-22) e por isso nao tem soft-delete
--    (decisao da Story 1.7). `comments` TEM — o motivo de uma reabertura
--    viraria prova que alguem pode apagar.
-- 2. Motivo e METADADO DA ACAO, nao conversa com o Solicitante: o par de/para
--    diz o que mudou, o motivo diz por que.
--
-- Coluna propria, e nao um `detalhe jsonb`, pelo mesmo motivo registrado na
-- migration 0008: jsonb aceitaria qualquer coisa, e o contrato de saida do
-- historico (1.8) teria que expor forma livre.
--
-- NULA porque so `reabrir_chamado` a preenche. Preencher as outras com ''
-- seria inventar um dado que ninguem informou.
ALTER TABLE audit_entries
  ADD COLUMN IF NOT EXISTS motivo text;
