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

const jwt = () => ({ Authorization: `Bearer ${token}` });
const api = () => ({ Authorization: `Bearer ${process.env.API_SECRET}` });

test('GET /slots returns empty list initially', async () => {
  const res = await request(app).get('/slots').set(jwt());
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('POST /slots creates a slot', async () => {
  const res = await request(app)
    .post('/slots')
    .set(jwt())
    .send({ datetime: '2026-07-01T14:00:00', recurrence: null });
  expect(res.status).toBe(201);
  expect(res.body.id).toBeDefined();
});

test('GET /slots returns created slot with occupied=false', async () => {
  const res = await request(app).get('/slots').set(jwt());
  expect(res.body).toHaveLength(1);
  expect(res.body[0].occupied).toBe(false);
});

test('GET /slots with API_SECRET also works', async () => {
  const res = await request(app).get('/slots').set(api());
  expect(res.status).toBe(200);
});

test('DELETE /slots/:id removes the slot', async () => {
  const list = await request(app).get('/slots').set(jwt());
  const id = list.body[0].id;
  const del = await request(app).delete(`/slots/${id}`).set(jwt());
  expect(del.status).toBe(200);
  const after = await request(app).get('/slots').set(jwt());
  expect(after.body).toHaveLength(0);
});
