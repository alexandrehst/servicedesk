-- Story 1.3 — identidade: usuarios, links de login (magic link) e sessoes.
--
-- FR-19: autenticacao por magic link, sem SSO/AD no MVP. A decisao entre
-- magic link e login corporativo estava aberta (PRD Q7) e foi tomada em
-- 2026-08-10 pelo dono do projeto: magic link, sessao em tabela, link de 15
-- minutos de uso unico, sessao de 8 horas.
--
-- NENHUMA coluna guarda credencial em texto claro. O que o banco ve e o
-- SHA-256 do token; o token cru existe uma vez, no e-mail e na resposta da
-- troca, e nunca e persistido, logado ou auditado (AD-9).

CREATE TABLE IF NOT EXISTS users (
  id        bigserial   PRIMARY KEY,
  -- Normalizado (trim + lowercase) na escrita e na busca: sem isso
  -- "Ana@empresa.com" e "ana@empresa.com" viram duas identidades distintas
  -- para o mesmo ser humano, e o UNIQUE nao impede.
  email     text        NOT NULL UNIQUE,
  -- 'solicitante' | 'agente' (FR-20). O papel vive AQUI, nunca na entrada do
  -- usuario — senao qualquer um se declararia agente ao autenticar.
  papel     text        NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_links (
  id         bigserial   PRIMARY KEY,
  email      text        NOT NULL,
  -- UNIQUE ja cria o indice usado na busca por token. Um indice adicional
  -- seria redundante.
  token_hash text        NOT NULL UNIQUE,
  expira_em  timestamptz NOT NULL,
  -- Uso unico: preenchido no consumo. A marcacao acontece em UPDATE ... WHERE
  -- usado_em IS NULL, atomico — ler-e-depois-marcar deixaria janela para dois
  -- usos simultaneos do mesmo link.
  usado_em   timestamptz,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         bigserial   PRIMARY KEY,
  -- A sessao guarda a IDENTIDADE, nao o papel. O papel e lido de `users` a
  -- cada resolucao: quem for rebaixado perde privilegio na hora, e quem for
  -- removido deixa de resolver principal. Papel congelado na sessao
  -- sobreviveria a ambos por ate 8 horas.
  email      text        NOT NULL,
  token_hash text        NOT NULL UNIQUE,
  expira_em  timestamptz NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
