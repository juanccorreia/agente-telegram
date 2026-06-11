process.env.ADMIN_PASSWORD = 'testpass123';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.API_SECRET = 'test_api_secret';

const request = require('supertest');
const { createTestApp } = require('./helpers');

let app, token, slotId;

beforeAll(async () => {
  ({ app } = createTestApp());
  const loginRes = await request(app)
    .post('/auth/login')
    .send({ password: 'testpass123' });
  token = loginRes.body.token;

  const slotRes = await request(app)
    .post('/slots')
    .set({ Authorization: `Bearer ${token}` })
    .send({ datetime: '2026-07-01T14:00:00' });
  slotId = slotRes.body.id;
});

const api = () => ({ Authorization: `Bearer ${process.env.API_SECRET}` });
const jwt = () => ({ Authorization: `Bearer ${token}` });

test('POST /appointments creates appointment and contact', async () => {
  const res = await request(app)
    .post('/appointments')
    .set(api())
    .send({ slot_id: slotId, name: 'João Silva', telegram_id: '12345' });
  expect(res.status).toBe(201);
  expect(res.body.id).toBeDefined();
});

test('GET /appointments returns the created appointment', async () => {
  const res = await request(app).get('/appointments').set(jwt());
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].name).toBe('João Silva');
});

test('GET /contacts returns the contact', async () => {
  const res = await request(app).get('/contacts').set(jwt());
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].telegram_id).toBe('12345');
});

test('GET /slots shows slot as occupied after booking', async () => {
  const res = await request(app).get('/slots').set(jwt());
  expect(res.body[0].occupied).toBe(true);
});
