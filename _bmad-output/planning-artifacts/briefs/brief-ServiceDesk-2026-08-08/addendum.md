# Addendum — ServiceDesk

Material de apoio que pertence a documentos aguas abaixo (PRD / arquitetura) ou registra alternativas consideradas. O brief permanece enxuto; a profundidade vive aqui e no `brainstorm-intent.md` companion.

## Decisão de escopo: posicionamento da camada MCP

Três opções foram consideradas para o papel do MCP no MVP:

| Opção | Descrição | Veredito |
|-------|-----------|----------|
| MCP já no dia 1 (com UI) | Servidor MCP + UI web juntos no MVP, ambos sobre a mesma API | Não escolhida — dobra o escopo de entrega inicial |
| API-first, MCP fast-follow | Dia 1: API + UI; MCP como Fase 1.5 | Não escolhida — adia o diferencial |
| **MCP como núcleo, UI depois** | **Dia 1: API + servidor MCP (operar via IA); UI web na Fase 1.5** | **✅ Escolhida** |

**Racional da escolha:** alinha diretamente com o objetivo declarado — "operar de dentro de uma IA". Entrega o diferencial (MCP) o mais cedo possível, mantém o MVP pequeno (sem construir UI e MCP ao mesmo tempo), e força desde o dia 1 a disciplina de API-first / camada de domínio limpa, que é a fundação de todo o resto. Custo assumido: solicitantes não-IA só ganham interface própria na Fase 1.5 (no intervalo, operam via e-mail/IA).

## Superfície de ferramentas MCP (detalhe para o PRD)

Separadas por risco:

- **Leitura (livres):** `buscar_chamados`, `ver_chamado`, `resumo_fila`, `chamados_parecidos`
- **Escrita (com guardrails):** `abrir_chamado`, `comentar_chamado`, `mudar_status`, `atribuir_chamado`, `mudar_prioridade`
- **Irreversíveis (confirmação humana obrigatória):** `fechar_chamado`, `cancelar_chamado`, `reabrir_chamado`
- **MCP Resources:** "chamado" e "fila" como leitura barata de contexto.
- **MCP Prompts:** template "triagem de chamado".

## Riscos & guardrails a carregar para o PRD

- Ação irreversível disparada por IA sem confirmação → human-in-the-loop obrigatório.
- Atribuição de autoria no log de auditoria quando a ação vem via MCP (humano-via-IA vs. agente autônomo).
- Token super-permissionado → escopo estreito por identidade + rate limit.
- Dessincronia entre schema das tools MCP e a API → gerar o schema da mesma spec.
- Formulário/fluxo pesado demais → mata adoção ("volta pro WhatsApp").

## Edge cases mapeados (para o PRD)

Chamado aberto por engano (→ Cancelado) · edição concorrente por dois agentes · solicitante desligado com chamado aberto · chamado que não é de TI (→ mudar time responsável) · limite de tamanho/tipo de anexo · notificação no spam (link também no portal) · timezone único da empresa.

## Lacunas a confirmar (marcadas [SUPOSIÇÃO] no brief)

- Volume mensal de chamados (estimado ~200–400/mês).
- Prazo-alvo do MVP (estimado ~4–8 semanas com IA).
- Baseline atual de tempo médio de resolução (precisa ser medido antes do corte para provar "sem regressão").
- Existência de multa/carência na rescisão do contrato atual.
- Meta de % de chamados operados via MCP no primeiro trimestre.
