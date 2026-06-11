const { fetchConfig, fetchSlots, createAppointment } = require('./api');
const { getHistory, addMessage, clearConversation, scheduleTimeout } = require('./conversation');
const { askClaude } = require('./claude');

async function onMessage(ctx) {
  const chatId = String(ctx.chat.id);
  const userText = ctx.message.text;

  let config, slots;
  try {
    [config, slots] = await Promise.all([fetchConfig(), fetchSlots()]);
  } catch (err) {
    console.error('API unreachable:', err.message);
    return ctx.reply('Desculpe, o serviço está temporariamente indisponível. Tente novamente em instantes.');
  }

  const freeSlots = slots.filter(s => !s.occupied);
  const slotsList = freeSlots.length
    ? freeSlots.map((s, i) => {
        const d = new Date(s.datetime);
        return `${i + 1}. ${d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} (ID: ${s.id})`;
      }).join('\n')
    : 'Nenhum horário disponível no momento.';

  const systemPrompt = (config.system_prompt || '').replace('{{SLOTS}}', slotsList);

  addMessage(chatId, 'user', userText);
  scheduleTimeout(chatId);

  const messages = getHistory(chatId);

  const result = await askClaude({
    apiKey: config.anthropic_api_key,
    systemPrompt,
    messages,
  });

  if (result.type === 'tool_use') {
    const { name, slot_id } = result.input;
    try {
      await createAppointment({ slot_id, name, telegram_id: chatId });

      addMessage(chatId, 'assistant', [
        { type: 'tool_use', id: result.toolUseId, name: 'book_appointment', input: result.input },
      ]);
      addMessage(chatId, 'user', [
        { type: 'tool_result', tool_use_id: result.toolUseId, content: 'Agendamento criado com sucesso.' },
      ]);

      const confirmation = await askClaude({
        apiKey: config.anthropic_api_key,
        systemPrompt,
        messages: getHistory(chatId),
      });
      const confirmText = confirmation.type === 'text' ? confirmation.text : `Agendamento confirmado para ${name}!`;
      await ctx.reply(confirmText);
      clearConversation(chatId);
    } catch (err) {
      console.error('Booking failed:', err.message);
      await ctx.reply('Ocorreu um erro ao registrar o agendamento. Tente novamente.');
    }
    return;
  }

  addMessage(chatId, 'assistant', result.text);
  await ctx.reply(result.text);
}

module.exports = { onMessage };
