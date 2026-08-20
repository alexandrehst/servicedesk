# ServiceDesk

Service desk interno **MCP-first**: o núcleo é um servidor MCP operado de dentro
de uma IA. Existe para substituir um software de chamados contratado, com
paridade comprovada — não presumida.

**TypeScript, arquitetura hexagonal, Postgres.** 995 testes, incluindo ~250 de
integração contra um banco real.

---

## Rodar

### 1. Pré-requisitos

- **Node 24** (`nvm use 24`)
- **pnpm** (`corepack enable`)
- **Postgres 16+** com a extensão `pg_trgm` disponível

### 2. Banco

```bash
createdb servicedesk
export DATABASE_URL='postgres://usuario:senha@localhost:5432/servicedesk'
pnpm db:migrate
```

As migrations rodam **explicitamente**, nunca no boot. Migration que roda
sozinha em produção é como se perde uma base.

### 3. Um usuário e um token de máquina

O servidor MCP autentica com um **token de máquina** (não com sessão de pessoa).
Ele precisa existir em `users` — é dali que sai o papel:

```bash
# 1. o dono do token, como Agente
psql "$DATABASE_URL" -c \
  "INSERT INTO users (email, papel) VALUES ('bot@empresa.com', 'agente')"

# 2. o token — o banco guarda só o hash
TOKEN=$(openssl rand -hex 32)
HASH=$(node -e "console.log(require('node:crypto').createHash('sha256').update('$TOKEN').digest('hex'))")
psql "$DATABASE_URL" -c \
  "INSERT INTO mcp_tokens (identity, token_hash, descricao)
   VALUES ('bot@empresa.com', '$HASH', 'meu cliente MCP')"

echo "Guarde este token: $TOKEN"
```

O token cru existe **uma vez**. Perdeu, gere outro — o banco só tem o hash.

### 4. Subir

```bash
pnpm build
DATABASE_URL='...' SERVICEDESK_MCP_TOKEN='...' pnpm start
```

O servidor fala **stdio**. Ele não imprime nada em `stdout` além do protocolo —
o log vai para `stderr`.

### 5. Conectar num cliente MCP

Em `claude_desktop_config.json` (ou equivalente):

```json
{
  "mcpServers": {
    "servicedesk": {
      "command": "node",
      "args": ["/caminho/para/ServiceDesk/dist/src/bootstrap/servidor-mcp.js"],
      "env": {
        "DATABASE_URL": "postgres://usuario:senha@localhost:5432/servicedesk",
        "SERVICEDESK_MCP_TOKEN": "o-token-do-passo-3"
      }
    }
  }
}
```

Reinicie o cliente. As 18 tools aparecem — `abrir_chamado`, `buscar_chamados`,
`resumo_fila`, `fechar_chamado`, e as demais.

---

## Configuração

| Variável | Obrigatória | Ausente significa |
| --- | :---: | --- |
| `DATABASE_URL` | ✅ | **não sobe** |
| `SERVICEDESK_MCP_TOKEN` | ✅ | **não sobe** |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_REMETENTE`, `BASE_URL` | — | e-mails de abertura e resolução **desligados** |
| `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASS`, `IMAP_CAIXA` | — | intake por e-mail **desligado** |
| `INTAKE_INTERVALO_MS` | — | 60 s |

**Bloco opcional vem inteiro ou não vem.** `SMTP_HOST` sem `SMTP_PASS` é erro
fatal, não "desligado": ninguém preenche metade das credenciais de propósito, e
tratar isso como desligado esconderia o erro de digitação.

**O que fica desligado aparece no log do boot.** Um intake desligado e um intake
quebrado se parecem de fora — o silêncio faria o segundo passar por sazonalidade.

---

## Comandos

| | |
| --- | --- |
| `pnpm start` | sobe o servidor MCP (stdio) |
| `pnpm build` | compila para `dist/` |
| `pnpm test` | os 995 testes (precisa de `DATABASE_URL`) |
| `pnpm typecheck` · `pnpm lint` · `pnpm arch` | os gates de qualidade |
| `pnpm db:migrate` | aplica as migrations |

---

## O que este sistema faz

**Chamado**: abrir (por MCP ou e-mail), comentar (público ou interno), mudar
Status por máquina de estados, atribuir Dono, priorizar, fechar/cancelar/reabrir
com **confirmação humana explícita**.

**Ver o trabalho**: fila com filtros e paginação, resumo por Status/Categoria/
Dono, busca textual, sugestão de Chamados parecidos.

**Dados são seus**: export e import CSV, soft-delete em tudo (nada é apagado de
verdade), Log de auditoria append-only com autor e origem de cada ação.

**Medir**: `relatorio_de_operacao` — tempo de resolução (mediana e média),
percentual de ações via MCP, pessoas operando.

---

## O que ele ainda NÃO faz

- **Não há interface web.** É MCP-first; a UI é Fase 1.5.
- **Não há API HTTP.** A origem `api` existe no Log e nada a produz ainda.
- **Um processo = uma identidade.** O transporte stdio não tem sessão, então
  todas as ações são do dono do token. Identidade por pessoa exige transporte
  HTTP, que depende da topologia de deploy.
- **Não há restauração** do que foi excluído, nem política de retenção. As duas
  estão registradas no PRD como decisões conscientes.

---

## Documentação

- `_bmad-output/RESUME.md` — onde o projeto está e o que falta
- `_bmad-output/planning-artifacts/checklist-de-paridade.md` — o que verificar
  antes de desligar o software anterior
- `_bmad-output/planning-artifacts/architecture/` — a spine, com os 11 ADs
- `_bmad-output/implementation-artifacts/` — uma story por entrega, com as
  decisões e o que foi medido
