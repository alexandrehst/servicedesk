/**
 * Regras de fronteira arquitetural — ServiceDesk
 *
 * Codifica o AD-1 da ARCHITECTURE-SPINE: "dependencias cruzam para dentro
 * exclusivamente". O objetivo e que a arquitetura hexagonal seja cumprida
 * por maquina, nao por disciplina.
 *
 * Extensao .cjs e obrigatoria: o package.json declara "type": "module" e o
 * dependency-cruiser carrega a config como CommonJS.
 *
 * ATENCAO: toda regra usa severity 'error'. Regras com severity 'warn' sao
 * reportadas mas NAO alteram o exit code — o job passaria verde com violacao
 * presente.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-domain-to-outer',
      severity: 'error',
      comment:
        'AD-1: o dominio e o nucleo puro. Nao pode depender de application, ' +
        'adapters nem platform — se depender, a regra de negocio vaza para ' +
        'fora e os pontos de entrada divergem.',
      from: { path: '^src/domain/' },
      to: { path: '^src/(application|adapters|platform)/' },
    },
    {
      name: 'no-application-to-adapters',
      severity: 'error',
      comment:
        'AD-1: application orquestra dominio e ports. Depender de um adapter ' +
        'concreto inverte a direcao e amarra o caso de uso a uma tecnologia.',
      from: { path: '^src/application/' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'no-cross-adapter',
      severity: 'error',
      comment:
        'Adapters devem ser intercambiaveis. Um adapter que depende de outro ' +
        'deixa de ser substituivel. Nao esta escrito no AD-1, mas decorre do ' +
        'proposito de ports & adapters. [SUPOSICAO — revisar na retro do Epic 0]',
      from: { path: '^src/adapters/([^/]+)/' },
      to: {
        path: '^src/adapters/([^/]+)/',
        pathNot: '^src/adapters/$1/',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Dependencia circular impede raciocinar sobre uma camada isoladamente ' +
        'e costuma indicar fronteira mal colocada.',
      from: {},
      to: { circular: true },
    },
  ],

  options: {
    // Sem tsConfig o resolver nao entende os imports TypeScript e pode
    // reportar modulos como nao-resolvidos — ou nao segui-los e passar verde.
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,

    // Entra no modulo mas nao segue suas dependencias: o alvo aqui e a
    // arquitetura interna, nao a arvore de node_modules.
    doNotFollow: { path: 'node_modules' },

    // Arquivos de teste nao fazem parte da arquitetura de producao.
    exclude: { path: '\\.test\\.ts$' },

    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js'],
    },
  },
}
