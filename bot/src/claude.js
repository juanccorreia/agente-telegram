const Anthropic = require('@anthropic-ai/sdk').default;

const BOOK_TOOL = {
  name: 'book_appointment',
  description: 'Registra o agendamento quando o cliente confirmar nome e horário.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome completo do cliente' },
      slot_id: { type: 'string', description: 'ID do slot escolhido' },
    },
    required: ['name', 'slot_id'],
  },
};

async function askClaude({ apiKey, systemPrompt, messages }) {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    messages,
    tools: [BOOK_TOOL],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (toolUse && toolUse.name === 'book_appointment') {
    return { type: 'tool_use', toolUseId: toolUse.id, input: toolUse.input };
  }

  const text = response.content.find(b => b.type === 'text');
  return { type: 'text', text: text?.text ?? '' };
}

module.exports = { askClaude, BOOK_TOOL };
