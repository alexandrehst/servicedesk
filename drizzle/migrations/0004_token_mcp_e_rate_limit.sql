-- Story 1.5 — seguranca do adapter MCP: token de maquina e rate limit.
--
-- FR-21 pedia "token escopado por identidade e rate limit" sem dizer o que era
-- o token nem qual o limite. Decidido em 2026-08-10 pelo dono do projeto:
-- credencial de maquina separada e revogavel, 60 chamadas por minuto por
-- identidade, contador no Postgres.

-- Credencial de cliente MCP. Separada da sessao humana (Story 1.3) por causa do
-- AD-9: se o agente autonomo usasse a sessao da pessoa, as acoes dele ficariam
-- auditadas como se fossem dela, e "distingue humano via IA de agente
-- autonomo" viraria impossivel.
--
-- A identidade referencia o mesmo cadastro de `users`: o bot e um usuario com
-- papel, entao toda a autorizacao da Story 1.4 vale para ele sem codigo novo.
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id          bigserial   PRIMARY KEY,
  identity    text        NOT NULL,
  -- Como em `sessions` e `login_links`: o banco ve o hash, nunca o token.
  token_hash  text        NOT NULL UNIQUE,
  -- Para quem olha a tabela depois saber a quem este token foi entregue.
  descricao   text        NOT NULL,
  -- NULL = nao expira. O prazo NAO foi decidido, e inventar um padrao aqui
  -- seria politica de seguranca fabricada. Quem emitir decide.
  expira_em   timestamptz,
  -- Revogacao e um UPDATE, nao um DELETE: a linha permanece para quem for
  -- auditar quem tinha acesso e ate quando.
  revogado_em timestamptz,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- Contador de chamadas por identidade e janela de um minuto.
--
-- A chave primaria composta e o que torna o incremento atomico: o
-- `INSERT ... ON CONFLICT (identity, janela) DO UPDATE ... RETURNING` resolve
-- ler-e-somar em UMA operacao, sob o lock da propria linha. Ler o contador e
-- depois gravar deixaria duas chamadas simultaneas lerem o mesmo valor e
-- gravarem o mesmo incremento — uma delas some, e o limite passa a ser maior
-- do que o configurado justamente sob carga, que e quando ele importa.
--
-- Janela FIXA (o minuto truncado), nao deslizante: uma rajada na virada do
-- minuto pode chegar a 120 chamadas em poucos segundos. Limitacao conhecida do
-- modelo simples; o alvo — IA em loop, que faz centenas por minuto — segue
-- coberto.
CREATE TABLE IF NOT EXISTS rate_limit (
  identity  text        NOT NULL,
  janela    timestamptz NOT NULL,
  chamadas  integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (identity, janela)
);
