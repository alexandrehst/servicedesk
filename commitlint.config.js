/**
 * Conventional commits — ServiceDesk (pilar Auditavel, QUALITY-GATE secao 2).
 *
 * ESM porque o package.json declara "type": "module".
 *
 * NAO desabilitar `defaultIgnores`. Entre os ignores padrao esta
 * `/^(R|r)evert (.*)/`, e o metodo de trabalho do Epic 0 gera commits de
 * revert a cada prova de gate ("commit que viola -> CI vermelho -> revert").
 * Sem esse ignore, o proprio metodo reprovaria no gate.
 *
 * Os tipos usados no projeto (feat, fix, chore, docs, test) ja estao no
 * conjunto padrao do config-conventional — nao ha type-enum customizado.
 */

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // O titulo do PR vira a mensagem do commit na main (merge squash).
    // 100 caracteres cabem numa linha de `git log --oneline` sem truncar.
    'header-max-length': [2, 'always', 100],
  },
}
