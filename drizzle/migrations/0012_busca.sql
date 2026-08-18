-- Story 3.4 — busca simples (FR-11).

-- `ILIKE '%termo%'` NAO usa indice B-tree: sem trigramas, toda busca vira
-- varredura com comparacao linha a linha. E o pilar Performatico de novo, desta
-- vez sobre texto.
--
-- `pg_trgm` em vez de `tsvector` (busca full-text) e decisao registrada: o
-- full-text exigiria escolher dicionario e stemming em portugues, e passaria a
-- NAO achar substring — quem procura "VPN" num titulo "VPNs corporativas", ou o
-- pedaco de um codigo de erro, nao encontraria. O PRD pede busca textual
-- SIMPLES, e previsibilidade vale mais aqui do que relevancia ordenada.
--
-- ATENCAO ao deploy: `CREATE EXTENSION` exige privilegio elevado. No ambiente
-- local o usuario e superuser e a extensao esta disponivel (verificado em
-- 2026-08-18); num Postgres gerenciado pode ser preciso pedir ao provedor. O
-- `IF NOT EXISTS` deixa a migration reentrante, mas nao dispensa o privilegio.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN com `gin_trgm_ops` e o que faz `ILIKE '%x%'` ser indexavel.
--
-- Sem indice parcial aqui, e isso e diferente da 0011: a busca cobre Chamado
-- ENCERRADO de proposito (FR-11 — ela existe para evitar reabrir problema ja
-- resolvido), entao o indice precisa alcancar linha que a Fila do dia a dia
-- ignora. O `deleted_at IS NULL` continua no WHERE da consulta.
CREATE INDEX IF NOT EXISTS tickets_busca_titulo_idx
  ON tickets USING gin (titulo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tickets_busca_descricao_idx
  ON tickets USING gin (descricao gin_trgm_ops);

-- O corpo do Comentario tambem entra na busca (FR-11). QUEM pode fazer um
-- Chamado aparecer por causa de um Comentario e decidido no WHERE, pelo alcance
-- que o dominio calcula (`alcanceDaBusca`): Comentario Interno so casa para
-- quem ja pode le-lo.
CREATE INDEX IF NOT EXISTS comments_busca_corpo_idx
  ON comments USING gin (corpo gin_trgm_ops);

-- O Numero do sistema ANTERIOR (Story 3.4, AC #4).
--
-- Nasce vazia: quem a preenche e o import do Epic 4. Cria-la agora custa uma
-- coluna nula e faz a busca ja cobri-la — a alternativa seria a Story 4.2 ter
-- que voltar e mexer na busca, que e justamente onde mora o vazamento delicado
-- desta story.
--
-- TEXT, e nao integer: numero legado de sistema antigo costuma vir com prefixo
-- ("INC-4711"), zero a esquerda ou letra. Converter perderia informacao que so
-- serve para reencontrar o Chamado.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS numero_legado text;

-- Igualdade, nao trigrama: numero legado e IDENTIFICADOR, e buscar "123" nao
-- deve trazer o Chamado "1234". Indice parcial porque a coluna e majoritariamente
-- nula ate a migracao do Epic 4 acontecer.
CREATE INDEX IF NOT EXISTS tickets_numero_legado_idx
  ON tickets (numero_legado) WHERE numero_legado IS NOT NULL;
