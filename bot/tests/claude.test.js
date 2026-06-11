jest.mock('@anthropic-ai/sdk', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Olá! Qual é o seu nome?' }],
          stop_reason: 'end_turn',
        }),
      },
    })),
  };
});

const { askClaude } = require('../src/claude');

test('askClaude returns text response', async () => {
  const result = await askClaude({
    apiKey: 'test-key',
    systemPrompt: 'Você é um assistente.',
    messages: [{ role: 'user', content: 'Olá' }],
  });
  expect(result.type).toBe('text');
  expect(result.text).toBe('Olá! Qual é o seu nome?');
});
