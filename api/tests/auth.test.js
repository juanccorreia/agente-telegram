process.env.ADMIN_PASSWORD = 'testpass123';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.API_SECRET = 'test_api_secret';

const request = require('supertest');
const { createTestApp } = require('./helpers');

let app;
beforeAll(() => {
  ({ app } = createTestApp());
});

test('POST /auth/login with correct password returns token', async () => {
  const res = await request(app)
    .post('/auth/login')
    .send({ password: 'testpass123' });
  expect(res.status).toBe(200);
  expect(typeof res.body.token).toBe('string');
});

test('POST /auth/login with wrong password returns 401', async () => {
  const res = await request(app)
    .post('/auth/login')
    .send({ password: 'wrong' });
  expect(res.status).toBe(401);
});

test('GET /config without token returns 401', async () => {
  const res = await request(app).get('/config');
  expect(res.status).toBe(401);
});

test('GET /config/bot without API_SECRET returns 401', async () => {
  const res = await request(app).get('/config/bot');
  expect(res.status).toBe(401);
});
