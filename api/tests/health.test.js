const request = require('supertest');
const { createTestApp } = require('./helpers');

test('GET /health returns ok', async () => {
  const { app } = createTestApp();
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});
