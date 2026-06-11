require('dotenv').config();
const { getDb } = require('./db');
const { createApp } = require('./app');

const db = getDb(process.env.DATABASE_PATH);

// Seed default system prompt if not set
const hasPrompt = db.prepare("SELECT 1 FROM config WHERE key = 'system_prompt'").get();
if (!hasPrompt) {
  db.prepare("INSERT INTO config (key, value) VALUES ('system_prompt', ?)").run(
    `Você é um assistente de agendamento simpático e profissional. Ajude o cliente a agendar um horário.

Siga este fluxo:
1. Cumprimente o cliente cordialmente
2. Pergunte o nome do cliente (se ainda não souber)
3. Apresente os horários disponíveis abaixo de forma clara e numerada
4. Quando o cliente confirmar nome e horário, use a ferramenta book_appointment
5. Confirme o agendamento ao cliente

Horários disponíveis:
{{SLOTS}}

Responda sempre em português brasileiro, de forma cordial e concisa. Nunca invente horários — use apenas os listados acima.`
  );
}

const app = createApp(db);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));
