process.env.ADMIN_PASSWORD = 'testpass123';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.API_SECRET = 'test_api_secret';

const request = require('supertest');
const { createTestApp } = require('./helpers');

let app, token;

beforeAll(async () => {
  ({ app } = createTestApp());
  const res = await request(app)
    .post('/auth/login')
    .send({ password: 'testpass123' });
  token = res.body.token;
});

function authHeader() {
  return { Authorization: `Bearer ${token}` };
}

test('PUT /config saves a value', async () => {
  const res = await request(app)
    .put('/config')
    .set(authHeader())
    .send({ system_prompt: 'Você é um assistente.' });
  expect(res.status).toBe(200);
});

test('GET /config returns saved value (non-sensitive)', async () => {
  const res = await request(app).get('/config').set(authHeader());
  expect(res.status).toBe(200);
  expect(res.body.system_prompt).toBe('Você é um assistente.');
});

test('GET /config masks anthropic_api_key', async () => {
  await request(app)
    .put('/config')
    .set(authHeader())
    .send({ anthropic_api_key: 'sk-ant-abc12345' });
  const res = await request(app).get('/config').set(authHeader());
  expect(res.body.anthropic_api_key).not.toBe('sk-ant-abc12345');
  expect(res.body.anthropic_api_key).toMatch(/\*\*\*/);
});

test('GET /config/bot returns anthropic_api_key in plain text', async () => {
  const res = await request(app)
    .get('/config/bot')
    .set({ Authorization: `Bearer ${process.env.API_SECRET}` });
  expect(res.status).toBe(200);
  expect(res.body.anthropic_api_key).toBe('sk-ant-abc12345');
});
