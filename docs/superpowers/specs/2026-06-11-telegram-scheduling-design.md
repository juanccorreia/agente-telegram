# Sistema de Agendamento via Telegram — Design Spec

**Data:** 2026-06-11
**Status:** Aprovado

---

## Visão Geral

Sistema de agendamento pessoal composto por três serviços independentes: um bot Telegram com conversa natural (Claude Haiku), uma API REST central, e um painel admin em React. Clientes agendam horários pelo Telegram; o admin configura tudo e visualiza os dados em um painel web.

---

## Arquitetura

Três serviços independentes, cada um com seu próprio repositório e deploy no Railway:

```
bot/     → Telegram bot (Node.js + Telegraf + Anthropic SDK)
api/     → Backend REST (Node.js + Express + SQLite + Google Sheets)
admin/   → Painel admin (React + Vite, deploy estático)
```

### Fluxo de Dados

1. Cliente envia mensagem no Telegram → `bot` recebe via long polling
2. `bot` busca configurações (system prompt, chave Anthropic, slots livres) na `api`
3. `bot` envia histórico + mensagem atual para Claude Haiku → recebe resposta em linguagem natural
4. Quando agendamento é confirmado, `bot` chama `api` (`POST /appointments`)
5. `api` salva no SQLite e espelha uma linha no Google Sheets
6. `admin` consome a `api` via REST para exibir dados e salvar configurações

### Comunicação entre Serviços

- `bot` → `api`: chamadas REST autenticadas com `Authorization: Bearer <API_SECRET>`
- `admin` → `api`: JWT obtido via `POST /auth/login` com a senha do admin

---

## Serviço `bot`

**Stack:** Node.js + Telegraf + `@anthropic-ai/sdk`

### Responsabilidades

- Receber mensagens Telegram via long polling (sem necessidade de URL pública)
- Manter histórico de conversa por `chatId` em `Map<chatId, Message[]>` em memória
- Chamar Claude Haiku com system prompt configurável + histórico + mensagem atual
- Detectar agendamento concluído via JSON estruturado retornado pelo modelo
- Chamar `POST /appointments` na API ao confirmar agendamento
- Reiniciar conversa após conclusão ou timeout de inatividade (30 minutos)

### Fluxo da Conversa

```
Usuário: "Oi"
Bot:     "Olá! Sou o assistente de agendamentos. Qual é o seu nome?"
Usuário: "João"
Bot:     "Olá, João! Temos os seguintes horários disponíveis:
          - Quinta, 12/06 às 14h
          - Sexta, 13/06 às 10h
          Qual prefere?"
Usuário: "Quinta às 14h"
Bot:     "Ótimo! Confirmo: João na quinta-feira, 12/06 às 14h. Posso agendar?"
Usuário: "Sim"
Bot:     "Agendado com sucesso! Até lá, João. 👍"
         → POST /appointments { name, slot_id, telegram_id }
```

### System Prompt (padrão editável pelo admin)

O system prompt instrui Claude a:
- Coletar o nome do cliente educadamente
- Apresentar apenas os slots disponíveis (injetados dinamicamente no prompt a cada turno)
- Confirmar dados antes de registrar
- Retornar `{"action": "book", "slot_id": "<id>", "name": "<nome>"}` quando o usuário confirmar — este JSON é detectado pelo bot e não exibido ao usuário
- Responder sempre em português, de forma cordial e concisa

### Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `TELEGRAM_TOKEN` | Token do bot Telegram |
| `API_URL` | URL base da API (ex: `https://api-xxx.railway.app`) |
| `API_SECRET` | Segredo compartilhado para autenticação bot→api |

---

## Serviço `api`

**Stack:** Node.js + Express + `better-sqlite3` + `googleapis`

### Responsabilidades

- CRUD de configurações (tokens, system prompt, credenciais Google)
- Gerenciar slots de horário disponíveis
- Receber e persistir agendamentos do bot
- Espelhar agendamentos no Google Sheets
- Servir dados para o painel admin
- Autenticação JWT para o admin

### Banco de Dados (SQLite)

**Tabela `config`**
```sql
key   TEXT PRIMARY KEY,
value TEXT NOT NULL
```
Chaves: `telegram_token`, `anthropic_api_key`, `system_prompt`, `google_credentials_json`, `google_sheet_id`

**Tabela `slots`**
```sql
id         TEXT PRIMARY KEY,
datetime   TEXT NOT NULL,       -- ISO 8601
active     INTEGER DEFAULT 1,
recurrence TEXT                 -- null | 'weekly'
```

**Tabela `appointments`**
```sql
id          TEXT PRIMARY KEY,
slot_id     TEXT NOT NULL,
name        TEXT NOT NULL,
telegram_id TEXT NOT NULL,
created_at  TEXT NOT NULL
```

**Tabela `contacts`**
```sql
telegram_id TEXT PRIMARY KEY,
name        TEXT NOT NULL,
first_seen  TEXT NOT NULL,
last_seen   TEXT NOT NULL
```

### Endpoints REST

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/auth/login` | — | Valida senha, retorna JWT |
| GET | `/config` | JWT | Retorna config com chaves sensíveis mascaradas (últimos 4 chars) |
| GET | `/config/bot` | API_SECRET | Retorna config completa para o bot (chaves em texto puro) |
| PUT | `/config` | JWT | Salva configurações |
| GET | `/slots` | JWT ou API_SECRET | Lista slots com status livre/ocupado |
| POST | `/slots` | JWT | Cria novo slot |
| DELETE | `/slots/:id` | JWT | Remove slot |
| POST | `/appointments` | API_SECRET | Cria agendamento (chamado pelo bot) |
| GET | `/appointments` | JWT | Lista agendamentos com filtro de período |
| GET | `/contacts` | JWT | Lista contatos atendidos |

### Integração Google Sheets

- Autenticação via Service Account (JSON de credenciais feito upload pelo admin)
- Ao criar agendamento: `sheets.spreadsheets.values.append` adiciona linha com `[nome, datetime, telegram_id, created_at]`
- A planilha deve ter uma aba chamada `Agendamentos` com cabeçalho na linha 1

### Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `ADMIN_PASSWORD` | Senha do painel admin |
| `JWT_SECRET` | Segredo para assinar JWTs |
| `API_SECRET` | Segredo compartilhado com o bot |
| `DATABASE_PATH` | Caminho do arquivo SQLite (ex: `/data/db.sqlite`) |

---

## Serviço `admin`

**Stack:** React + Vite + React Router + TanStack Query + shadcn/ui

### Páginas

#### `/login`
Formulário simples de senha. Ao autenticar, armazena JWT em `localStorage` e redireciona para `/config`.

#### `/config` — Configurações
- Token do bot Telegram
- Chave da API Anthropic (campo tipo password)
- System prompt do atendente (textarea grande)
- Upload ou cole do JSON de credenciais Google Service Account
- ID da planilha Google Sheets
- Botão "Salvar"

#### `/slots` — Horários Disponíveis
- Lista de slots com status visual (livre / ocupado)
- Formulário para criar slot: data, hora, recorrência semanal (opcional)
- Toggle ativar/desativar slot
- Botão excluir (apenas slots livres)

#### `/appointments` — Agendamentos
- Tabela: nome, data/hora, Telegram ID, criado em
- Filtro por período (data início / data fim)
- Link para linha no Google Sheets

#### `/contacts` — Contatos Atendidos
- Tabela: nome, Telegram ID, primeiro contato, último contato

### Autenticação
Interceptor do TanStack Query adiciona `Authorization: Bearer <jwt>` em todas as requisições. Rota protegida redireciona para `/login` se JWT ausente ou expirado.

### Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `VITE_API_URL` | URL base da API |

### Deploy
Build estático (`npm run build`) servido pelo Railway como serviço web estático. Alternativa: Netlify ou Vercel (gratuito).

---

## Deploy no Railway

Três serviços independentes no mesmo projeto Railway:

| Serviço | Tipo | Root Dir |
|---|---|---|
| `bot` | Node.js worker | `bot/` |
| `api` | Node.js web | `api/` |
| `admin` | Static site | `admin/` |

- `api` recebe um volume Railway montado em `/data` para persistir o SQLite
- Variáveis de ambiente configuradas no dashboard do Railway por serviço
- `bot` e `api` se comunicam via variável `API_URL` apontando para a URL interna do Railway

---

## Fora do Escopo (v1)

- Integração WhatsApp
- Notificações de lembrete (ex: enviar mensagem 1h antes do horário)
- Múltiplos usuários admin
- Cancelamento de agendamentos pelo cliente
- Pagamentos
