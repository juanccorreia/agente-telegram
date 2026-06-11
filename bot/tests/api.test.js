global.fetch = jest.fn();

const { fetchConfig, fetchSlots, createAppointment } = require('../src/api');

afterEach(() => jest.clearAllMocks());

test('fetchConfig calls GET /config/bot with API_SECRET', async () => {
  process.env.API_URL = 'http://localhost:3000';
  process.env.API_SECRET = 'secret';
  fetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ system_prompt: 'prompt', anthropic_api_key: 'key' }),
  });
  const config = await fetchConfig();
  expect(fetch).toHaveBeenCalledWith(
    'http://localhost:3000/config/bot',
    expect.objectContaining({ headers: { Authorization: 'Bearer secret' } })
  );
  expect(config.system_prompt).toBe('prompt');
});

test('fetchSlots calls GET /slots', async () => {
  fetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([{ id: '1', datetime: '2026-07-01T14:00:00', occupied: false }]),
  });
  const slots = await fetchSlots();
  expect(slots).toHaveLength(1);
});

test('createAppointment calls POST /appointments', async () => {
  fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'abc' }) });
  await createAppointment({ slot_id: '1', name: 'João', telegram_id: '123' });
  expect(fetch).toHaveBeenCalledWith(
    'http://localhost:3000/appointments',
    expect.objectContaining({ method: 'POST' })
  );
});
