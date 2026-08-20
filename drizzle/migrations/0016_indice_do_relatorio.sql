-- Story 4.4 (achado do review no PR #83) — o Log passa a ser consultado por
-- PERIODO, e nao so por Chamado.
--
-- Ate agora `audit_entries` tinha um indice so: `ticket_number` (migration
-- 0001), que serve o historico de um Chamado (1.8). O relatorio de operacao faz
-- outra pergunta — "o que aconteceu ENTRE estas duas datas?" — e sem indice ela
-- e um scan da tabela inteira.
--
-- O detalhe que torna isto necessario, e nao apenas desejavel: `audit_entries` e
-- APPEND-ONLY (FR-22, e por isso nao tem `deleted_at`). Ela nunca encolhe. O
-- custo do relatorio cresceria com o historico total do sistema em vez de com o
-- periodo pedido — um relatorio do ultimo dia varreria o mesmo volume que um do
-- ano inteiro. E a checklist de paridade preve roda-lo repetidamente durante o
-- mes de validacao, ou seja: mais caro a cada semana, exatamente quando mais e
-- chamado.
CREATE INDEX IF NOT EXISTS audit_entries_periodo_idx
  ON audit_entries (registrado_em);

-- Indice PARCIAL para o caminho da resolucao. As entradas com `para =
-- 'resolvido'` sao uma fracao pequena do Log — a maioria e abertura, comentario
-- e mudanca de Status para outros valores —, e o indice parcial guarda so
-- elas, ficando muito menor que um indice completo sobre `para`.
--
-- Composto com `ticket_number` porque a consulta agrupa por ele: o indice
-- responde o `GROUP BY` sem voltar a tabela.
CREATE INDEX IF NOT EXISTS audit_entries_resolucoes_idx
  ON audit_entries (ticket_number, registrado_em) WHERE para = 'resolvido';
