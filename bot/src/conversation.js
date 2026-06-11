const TIMEOUT_MS = 30 * 60 * 1000;

const store = new Map(); // chatId → { messages: [], timer: Timeout }

function getHistory(chatId) {
  return store.get(chatId)?.messages ?? [];
}

function addMessage(chatId, role, content) {
  if (!store.has(chatId)) store.set(chatId, { messages: [], timer: null });
  store.get(chatId).messages.push({ role, content });
}

function clearConversation(chatId) {
  const entry = store.get(chatId);
  if (entry?.timer) clearTimeout(entry.timer);
  store.delete(chatId);
}

function scheduleTimeout(chatId) {
  const entry = store.get(chatId);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => clearConversation(chatId), TIMEOUT_MS);
}

module.exports = { getHistory, addMessage, clearConversation, scheduleTimeout };
