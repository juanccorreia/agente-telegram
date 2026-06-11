# Sistema de Agendamento via Telegram

Sistema de agendamento pessoal com bot Telegram (Claude Haiku), API REST e painel admin React.

## Servicos

| Servico | Diretorio | Descricao |
|---|---|---|
| API | `api/` | REST API + SQLite + Google Sheets |
| Bot | `bot/` | Bot Telegram com IA |
| Admin | `admin/` | Painel de administracao React |

## Deploy no Railway

1. Faca push do repositorio para o GitHub
2. No Railway, crie um novo projeto
3. Adicione 3 servicos apontando para os diretorios `api/`, `bot/`, `admin/`
4. Configure as variaveis de ambiente (veja `.env.example` de cada servico)
5. Adicione um Volume ao servico `api` montado em `/data`

## Variaveis de Ambiente

### api/
| Variavel | Descricao |
|---|---|
| `ADMIN_PASSWORD` | Senha do painel admin |
| `JWT_SECRET` | Segredo JWT (minimo 32 chars aleatorios) |
| `API_SECRET` | Segredo compartilhado com o bot |
| `DATABASE_PATH` | `/data/db.sqlite` |
| `PORT` | Definido automaticamente pelo Railway |

### bot/
| Variavel | Descricao |
|---|---|
| `TELEGRAM_TOKEN` | Token obtido via @BotFather |
| `API_URL` | URL interna do servico api no Railway |
| `API_SECRET` | Mesmo valor que na api |

### admin/
| Variavel | Descricao |
|---|---|
| `VITE_API_URL` | URL publica do servico api |

## Desenvolvimento Local

```bash
# API
cd api && cp .env.example .env
# edite .env com suas configuracoes
npm install && npm run dev

# Bot (em outro terminal)
cd bot && cp .env.example .env
# edite .env com token do Telegram e URL da API
npm install && npm run dev

# Admin (em outro terminal)
cd admin && cp .env.example .env
# edite .env com VITE_API_URL=http://localhost:3000
npm install && npm run dev
```
