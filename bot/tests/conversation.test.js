jest.useFakeTimers();
const { getHistory, addMessage, clearConversation, scheduleTimeout } = require('../src/conversation');

afterEach(() => {
  clearConversation('123');
  jest.clearAllTimers();
});

test('getHistory returns empty array for new chat', () => {
  expect(getHistory('123')).toEqual([]);
});

test('addMessage appends to history', () => {
  addMessage('123', 'user', 'Olá');
  addMessage('123', 'assistant', 'Oi!');
  const h = getHistory('123');
  expect(h).toHaveLength(2);
  expect(h[0]).toEqual({ role: 'user', content: 'Olá' });
});

test('clearConversation resets history', () => {
  addMessage('123', 'user', 'Olá');
  clearConversation('123');
  expect(getHistory('123')).toEqual([]);
});

test('scheduleTimeout clears conversation after 30 minutes', () => {
  addMessage('123', 'user', 'Olá');
  scheduleTimeout('123');
  jest.advanceTimersByTime(30 * 60 * 1000);
  expect(getHistory('123')).toEqual([]);
});
