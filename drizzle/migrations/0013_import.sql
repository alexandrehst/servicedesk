-- Story 4.2 — import CSV de migracao (FR-25).

-- Uma migracao real roda, falha no meio, e roda de novo. Sem restricao, o
-- segundo import cria a base inteira duplicada — com Numeros nativos NOVOS, o
-- que torna impossivel distinguir o original da copia depois.
--
-- A garantia e do BANCO, e nao da consulta que o import faz antes: entre
-- "verificar se ja existe" e "inserir" cabe outra execucao. E o mesmo raciocinio
-- do UNIQUE de `email_intake` (Story 1.9), onde a reentrega da mesma mensagem
-- disputava com ela mesma.
--
-- PARCIAL porque `numero_legado` e NULA para todo Chamado nativo (a coluna
-- nasceu vazia na 3.4): um UNIQUE completo trataria os nulos como distintos e
-- funcionaria, mas carregaria no indice todas as linhas que nenhuma consulta de
-- import alcanca.
CREATE UNIQUE INDEX IF NOT EXISTS tickets_numero_legado_unico_idx
  ON tickets (numero_legado) WHERE numero_legado IS NOT NULL;

-- O indice nao-unico criado na 0012 vira redundante: o UNIQUE acima serve as
-- mesmas consultas (busca por igualdade) e ainda garante a unicidade.
DROP INDEX IF EXISTS tickets_numero_legado_idx;
