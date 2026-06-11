# Sistema de Agendamento Telegram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3-service Telegram scheduling system: a REST API (Node.js/Express/SQLite/Google Sheets), a Telegram bot with natural conversation (Telegraf/Claude Haiku), and a React admin panel.

**Architecture:** Three independent service directories (`api/`, `bot/`, `admin/`). The API is the core — bot and admin both consume it. SQLite persists data in the API service. Google Sheets mirrors appointments. Build order: api → bot → admin → deploy.

**Tech Stack:** Node.js 18 + Express + better-sqlite3 + googleapis + jsonwebtoken | Telegraf + @anthropic-ai/sdk | React + Vite + TanStack Query + shadcn/ui + Tailwind | Jest + supertest | Railway

---

## File Map

```
api/
├── package.json
├── .env.example
├── src/
│   ├── index.js          ← entry point: creates db, starts server
│   ├── app.js            ← createApp(db) factory — testable, no side effects
│   ├── db.js             ← getDb(), runMigrations(), closeDb()
│   ├── auth.js           ← POST /auth/login, requireJwt, requireApiSecret
│   └── routes/
│       ├── config.js     ← GET /config, GET /config/bot, PUT /config
│       ├── slots.js      ← GET/POST/DELETE /slots
│       ├── appointments.js ← POST/GET /appointments
│       ├── contacts.js   ← GET /contacts
│       └── sheets.js     ← appendAppointmentToSheet(db, appointment)
└── tests/
    ├── helpers.js        ← createTestApp() with in-memory db
    ├── auth.test.js
    ├── config.test.js
    ├── slots.test.js
    └── appointments.test.js

bot/
├── package.json
├── .env.example
└── src/
    ├── index.js          ← Telegraf setup, long polling
    ├── api.js            ← HTTP client for the API service
    ├── conversation.js   ← Map<chatId, {messages, timeout}>
    ├── claude.js         ← Anthropic SDK wrapper with tool use
    └── handler.js        ← onMessage(ctx) orchestrator

admin/
├── package.json
├── vite.config.js
├── index.html
└── src/
    ├── main.jsx
    ├── App.jsx           ← Router setup
    ├── lib/
    │   └── api.js        ← fetch wrapper with JWT
    ├── context/
    │   └── AuthContext.jsx
    ├── components/
    │   ├── Layout.jsx
    │   └── ProtectedRoute.jsx
    └── pages/
        ├── Login.jsx
        ├── Config.jsx
        ├── Slots.jsx
        ├── Appointments.jsx
        └── Contacts.jsx
```

---

## Phase 1: API Service

### Task 1: API — Project Setup

**Files:**
- Create: `api/package.json`
- Create: `api/.env.example`
- Create: `api/src/index.js`
- Create: `api/src/app.js`
- Create: `api/tests/helpers.js`

- [ ] **Step 1: Initialize the api project**

```bash
mkdir -p api/src/routes api/tests
cd api
npm init -y
npm install express better-sqlite3 googleapis jsonwebtoken cors dotenv
npm install --save-dev jest supertest
```

- [ ] **Step 2: Update api/package.json scripts and jest config**

Replace the `scripts` and add `jest` in `api/package.json`:
```json
{
  "name": "agente-telegram-api",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "jest --runInBand --forceExit"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 3: Create `api/.env.example`**

```
ADMIN_PASSWORD=change_me
JWT_SECRET=change_me_to_random_32_chars
API_SECRET=change_me_to_random_32_chars
DATABASE_PATH=./data/db.sqlite
PORT=3000
```

- [ ] **Step 4: Create `api/src/app.js`**

```js
const express = require('express');
const cors = require('cors');

function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.set('db', db);

  app.get('/health', (_req, res) => res.json({ ok: true }));

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 5: Create `api/src/index.js`**

```js
require('dotenv').config();
const { getDb } = require('./db');
const { createApp } = require('./app');

const db = getDb(process.env.DATABASE_PATH);
const app = createApp(db);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));
```

- [ ] **Step 6: Create `api/tests/helpers.js`**

```js
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/db');
const { createApp } = require('../src/app');

function createTestApp() {
  const db = new Database(':memory:');
  runMigrations(db);
  const app = createApp(db);
  return { app, db };
}

module.exports = { createTestApp };
```

- [ ] **Step 7: Write health check test**

Create `api/tests/health.test.js`:
```js
const request = require('supertest');
const { createTestApp } = require('./helpers');

test('GET /health returns ok', async () => {
  const { app } = createTestApp();
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});
```

- [ ] **Step 8: Run tests — expect FAIL (db module missing)**

```bash
cd api && npm test tests/health.test.js
```
Expected: FAIL — `Cannot find module '../src/db'`

- [ ] **Step 9: Commit scaffolding**

```bash
cd api
git add .
git commit -m "feat(api): project scaffold"
```

---

### Task 2: API — Database & Migrations

**Files:**
- Create: `api/src/db.js`

- [ ] **Step 1: Create `api/src/db.js`**

```js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let instance = null;

function getDb(dbPath) {
  if (instance) return instance;
  const resolved = dbPath || './data/db.sqlite';
  if (resolved !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(resolved)), { recursive: true });
  }
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  instance = db;
  return db;
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS slots (
      id         TEXT PRIMARY KEY,
      datetime   TEXT NOT NULL,
      active     INTEGER NOT NULL DEFAULT 1,
      recurrence TEXT
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id          TEXT PRIMARY KEY,
      slot_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      telegram_id TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contacts (
      telegram_id TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      first_seen  TEXT NOT NULL,
      last_seen   TEXT NOT NULL
    );
  `);
}

function closeDb() {
  if (instance) { instance.close(); instance = null; }
}

module.exports = { getDb, runMigrations, closeDb };
```

- [ ] **Step 2: Run health check test — expect PASS**

```bash
cd api && npm test tests/health.test.js
```
Expected: PASS

- [ ] **Step 3: Write db migration test**

Create `api/tests/db.test.js`:
```js
const Database = require('better-sqlite3');
const { runMigrations } = require('../src/db');

test('creates all four tables', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all().map(r => r.name);
  expect(tables).toContain('config');
  expect(tables).toContain('slots');
  expect(tables).toContain('appointments');
  expect(tables).toContain('contacts');
  db.close();
});
```

- [ ] **Step 4: Run db test — expect PASS**

```bash
cd api && npm test tests/db.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd api
git add src/db.js tests/db.test.js tests/health.test.js
git commit -m "feat(api): SQLite db with migrations"
```

---

### Task 3: API — Authentication

**Files:**
- Create: `api/src/auth.js`
- Modify: `api/src/app.js`

- [ ] **Step 1: Write failing auth tests**

Create `api/tests/auth.test.js`:
```js
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
```

- [ ] **Step 2: Run — expect FAIL (routes not registered)**

```bash
cd api && npm test tests/auth.test.js
```
Expected: FAIL

- [ ] **Step 3: Create `api/src/auth.js`**

```js
const jwt = require('jsonwebtoken');
const { Router } = require('express');

const router = Router();

router.post('/login', (req, res) => {
  if (req.body.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
  res.json({ token });
});

function requireJwt(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireApiSecret(req, res, next) {
  if (req.headers.authorization !== `Bearer ${process.env.API_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireJwtOrApiSecret(req, res, next) {
  const header = req.headers.authorization;
  if (header === `Bearer ${process.env.API_SECRET}`) return next();
  return requireJwt(req, res, next);
}

module.exports = { router, requireJwt, requireApiSecret, requireJwtOrApiSecret };
```

- [ ] **Step 4: Register auth in `api/src/app.js` and add placeholder protected routes**

```js
const express = require('express');
const cors = require('cors');
const { router: authRouter, requireJwt, requireApiSecret, requireJwtOrApiSecret } = require('./auth');

function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.set('db', db);

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);

  // Placeholder routes for auth tests — replaced in later tasks
  app.get('/config', requireJwt, (_req, res) => res.json({}));
  app.get('/config/bot', requireApiSecret, (_req, res) => res.json({}));

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 5: Run auth tests — expect PASS**

```bash
cd api && npm test tests/auth.test.js
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd api
git add src/auth.js src/app.js tests/auth.test.js
git commit -m "feat(api): JWT auth and API secret middleware"
```

---

### Task 4: API — Config Routes

**Files:**
- Create: `api/src/routes/config.js`
- Modify: `api/src/app.js`

- [ ] **Step 1: Write failing config tests**

Create `api/tests/config.test.js`:
```js
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd api && npm test tests/config.test.js
```
Expected: FAIL

- [ ] **Step 3: Create `api/src/routes/config.js`**

```js
const { Router } = require('express');

const SENSITIVE_KEYS = ['anthropic_api_key', 'google_credentials_json'];

function createConfigRouter(db, { requireJwt, requireApiSecret }) {
  const router = Router();

  router.get('/', requireJwt, (req, res) => {
    const rows = db.prepare('SELECT key, value FROM config').all();
    const config = Object.fromEntries(rows.map(r => [r.key, r.value]));
    SENSITIVE_KEYS.forEach(k => {
      if (config[k]) config[k] = '***' + config[k].slice(-4);
    });
    res.json(config);
  });

  router.get('/bot', requireApiSecret, (req, res) => {
    const rows = db.prepare('SELECT key, value FROM config').all();
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  });

  router.put('/', requireJwt, (req, res) => {
    const upsert = db.prepare(
      'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    );
    const insertMany = db.transaction(entries => {
      for (const [key, value] of entries) upsert.run(key, String(value));
    });
    insertMany(Object.entries(req.body));
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createConfigRouter };
```

- [ ] **Step 4: Update `api/src/app.js` to replace placeholder config routes**

```js
const express = require('express');
const cors = require('cors');
const { router: authRouter, requireJwt, requireApiSecret, requireJwtOrApiSecret } = require('./auth');
const { createConfigRouter } = require('./routes/config');

function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.set('db', db);

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);
  app.use('/config', createConfigRouter(db, { requireJwt, requireApiSecret }));

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 5: Run config tests — expect PASS**

```bash
cd api && npm test tests/config.test.js
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd api
git add src/routes/config.js src/app.js tests/config.test.js
git commit -m "feat(api): config routes with key masking"
```

---

### Task 5: API — Slots Routes

**Files:**
- Create: `api/src/routes/slots.js`
- Modify: `api/src/app.js`

- [ ] **Step 1: Write failing slots tests**

Create `api/tests/slots.test.js`:
```js
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd api && npm test tests/slots.test.js
```
Expected: FAIL

- [ ] **Step 3: Create `api/src/routes/slots.js`**

```js
const { Router } = require('express');
const { randomUUID } = require('crypto');

function createSlotsRouter(db, { requireJwt, requireJwtOrApiSecret }) {
  const router = Router();

  router.get('/', requireJwtOrApiSecret, (req, res) => {
    const slots = db.prepare('SELECT * FROM slots WHERE active = 1 ORDER BY datetime').all();
    const booked = new Set(
      db.prepare('SELECT slot_id FROM appointments').all().map(r => r.slot_id)
    );
    res.json(slots.map(s => ({ ...s, occupied: booked.has(s.id) })));
  });

  router.post('/', requireJwt, (req, res) => {
    const { datetime, recurrence = null } = req.body;
    const id = randomUUID();
    db.prepare(
      'INSERT INTO slots (id, datetime, active, recurrence) VALUES (?, ?, 1, ?)'
    ).run(id, datetime, recurrence);
    res.status(201).json({ id, datetime, active: 1, recurrence, occupied: false });
  });

  router.delete('/:id', requireJwt, (req, res) => {
    db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createSlotsRouter };
```

- [ ] **Step 4: Update `api/src/app.js`**

```js
const express = require('express');
const cors = require('cors');
const { router: authRouter, requireJwt, requireApiSecret, requireJwtOrApiSecret } = require('./auth');
const { createConfigRouter } = require('./routes/config');
const { createSlotsRouter } = require('./routes/slots');

function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.set('db', db);

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);
  app.use('/config', createConfigRouter(db, { requireJwt, requireApiSecret }));
  app.use('/slots', createSlotsRouter(db, { requireJwt, requireJwtOrApiSecret }));

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 5: Run slots tests — expect PASS**

```bash
cd api && npm test tests/slots.test.js
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd api
git add src/routes/slots.js src/app.js tests/slots.test.js
git commit -m "feat(api): slots routes"
```

---

### Task 6: API — Appointments & Contacts Routes

**Files:**
- Create: `api/src/routes/appointments.js`
- Create: `api/src/routes/contacts.js`
- Modify: `api/src/app.js`

- [ ] **Step 1: Write failing tests**

Create `api/tests/appointments.test.js`:
```js
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd api && npm test tests/appointments.test.js
```
Expected: FAIL

- [ ] **Step 3: Create `api/src/routes/appointments.js`**

```js
const { Router } = require('express');
const { randomUUID } = require('crypto');
const { appendAppointmentToSheet } = require('./sheets');

function createAppointmentsRouter(db, { requireJwt, requireApiSecret }) {
  const router = Router();

  router.post('/', requireApiSecret, async (req, res) => {
    const { slot_id, name, telegram_id } = req.body;
    const id = randomUUID();
    const created_at = new Date().toISOString();

    db.prepare(
      'INSERT INTO appointments (id, slot_id, name, telegram_id, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, slot_id, name, telegram_id, created_at);

    // Upsert contact
    db.prepare(`
      INSERT INTO contacts (telegram_id, name, first_seen, last_seen)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET name=excluded.name, last_seen=excluded.last_seen
    `).run(telegram_id, name, created_at, created_at);

    // Mirror to Google Sheets (non-blocking — failure doesn't break booking)
    const slot = db.prepare('SELECT datetime FROM slots WHERE id = ?').get(slot_id);
    appendAppointmentToSheet(db, { name, datetime: slot?.datetime, telegram_id, created_at }).catch(
      err => console.error('Sheets sync error:', err.message)
    );

    res.status(201).json({ id, slot_id, name, telegram_id, created_at });
  });

  router.get('/', requireJwt, (req, res) => {
    const { from, to } = req.query;
    let query = 'SELECT * FROM appointments ORDER BY created_at DESC';
    const params = [];
    if (from && to) {
      query = 'SELECT * FROM appointments WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC';
      params.push(from, to);
    }
    res.json(db.prepare(query).all(...params));
  });

  return router;
}

module.exports = { createAppointmentsRouter };
```

- [ ] **Step 4: Create `api/src/routes/contacts.js`**

```js
const { Router } = require('express');

function createContactsRouter(db, { requireJwt }) {
  const router = Router();

  router.get('/', requireJwt, (req, res) => {
    res.json(db.prepare('SELECT * FROM contacts ORDER BY last_seen DESC').all());
  });

  return router;
}

module.exports = { createContactsRouter };
```

- [ ] **Step 5: Create `api/src/routes/sheets.js` (stub — Google Sheets in Task 7)**

```js
async function appendAppointmentToSheet(db, appointment) {
  const credentialsRow = db.prepare("SELECT value FROM config WHERE key = 'google_credentials_json'").get();
  const sheetIdRow = db.prepare("SELECT value FROM config WHERE key = 'google_sheet_id'").get();

  if (!credentialsRow || !sheetIdRow) return; // not configured, skip silently

  const credentials = JSON.parse(credentialsRow.value);
  const spreadsheetId = sheetIdRow.value;

  const { google } = require('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Agendamentos!A:D',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[appointment.name, appointment.datetime, appointment.telegram_id, appointment.created_at]],
    },
  });
}

module.exports = { appendAppointmentToSheet };
```

- [ ] **Step 6: Update `api/src/app.js` with all routes**

```js
const express = require('express');
const cors = require('cors');
const { router: authRouter, requireJwt, requireApiSecret, requireJwtOrApiSecret } = require('./auth');
const { createConfigRouter } = require('./routes/config');
const { createSlotsRouter } = require('./routes/slots');
const { createAppointmentsRouter } = require('./routes/appointments');
const { createContactsRouter } = require('./routes/contacts');

function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.set('db', db);

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);
  app.use('/config', createConfigRouter(db, { requireJwt, requireApiSecret }));
  app.use('/slots', createSlotsRouter(db, { requireJwt, requireJwtOrApiSecret }));
  app.use('/appointments', createAppointmentsRouter(db, { requireJwt, requireApiSecret }));
  app.use('/contacts', createContactsRouter(db, { requireJwt }));

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 7: Run all API tests — expect PASS**

```bash
cd api && npm test
```
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
cd api
git add src/routes/ src/app.js tests/appointments.test.js
git commit -m "feat(api): appointments, contacts routes and sheets stub"
```

---

### Task 7: API — Seed Default System Prompt

The bot needs a default system prompt on first run. Seed it in `index.js` on startup.

**Files:**
- Modify: `api/src/index.js`

- [ ] **Step 1: Update `api/src/index.js` to seed defaults**

```js
require('dotenv').config();
const { getDb } = require('./db');
const { createApp } = require('./app');

const db = getDb(process.env.DATABASE_PATH);

// Seed default system prompt if not set
const hasPrompt = db.prepare("SELECT 1 FROM config WHERE key = 'system_prompt'").get();
if (!hasPrompt) {
  db.prepare("INSERT INTO config (key, value) VALUES ('system_prompt', ?)").run(
    `Você é um assistente de agendamento simpático e profissional. Ajude o cliente a agendar um horário.

Siga este fluxo:
1. Cumprimente o cliente cordialmente
2. Pergunte o nome do cliente (se ainda não souber)
3. Apresente os horários disponíveis abaixo de forma clara e numerada
4. Quando o cliente confirmar nome e horário, use a ferramenta book_appointment
5. Confirme o agendamento ao cliente

Horários disponíveis:
{{SLOTS}}

Responda sempre em português brasileiro, de forma cordial e concisa. Nunca invente horários — use apenas os listados acima.`
  );
}

const app = createApp(db);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));
```

- [ ] **Step 2: Verify tests still pass**

```bash
cd api && npm test
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd api
git add src/index.js
git commit -m "feat(api): seed default system prompt on startup"
```

---

## Phase 2: Bot Service

### Task 8: Bot — Project Setup

**Files:**
- Create: `bot/package.json`
- Create: `bot/.env.example`
- Create: `bot/src/index.js`

- [ ] **Step 1: Initialize bot project**

```bash
mkdir -p bot/src
cd bot
npm init -y
npm install telegraf @anthropic-ai/sdk dotenv
npm install --save-dev jest
```

- [ ] **Step 2: Update `bot/package.json`**

```json
{
  "name": "agente-telegram-bot",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "jest --forceExit"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 3: Create `bot/.env.example`**

```
TELEGRAM_TOKEN=your_telegram_bot_token
API_URL=https://your-api.railway.app
API_SECRET=same_secret_as_api_service
```

- [ ] **Step 4: Create placeholder `bot/src/index.js`**

```js
require('dotenv').config();
const { Telegraf } = require('telegraf');
const { onMessage } = require('./handler');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.on('text', onMessage);

bot.launch().then(() => console.log('Bot running'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
```

- [ ] **Step 5: Commit**

```bash
cd bot
git add .
git commit -m "feat(bot): project scaffold"
```

---

### Task 9: Bot — API Client

**Files:**
- Create: `bot/src/api.js`
- Create: `bot/tests/api.test.js`

- [ ] **Step 1: Write failing test**

Create `bot/tests/api.test.js`:
```js
// Mock fetch globally
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd bot && npm test tests/api.test.js
```
Expected: FAIL

- [ ] **Step 3: Create `bot/src/api.js`**

```js
function headers() {
  return { Authorization: `Bearer ${process.env.API_SECRET}`, 'Content-Type': 'application/json' };
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${process.env.API_URL}${path}`, { ...options, headers: headers() });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

async function fetchConfig() {
  return apiFetch('/config/bot');
}

async function fetchSlots() {
  return apiFetch('/slots');
}

async function createAppointment({ slot_id, name, telegram_id }) {
  return apiFetch('/appointments', {
    method: 'POST',
    body: JSON.stringify({ slot_id, name, telegram_id }),
  });
}

module.exports = { fetchConfig, fetchSlots, createAppointment };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd bot && npm test tests/api.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd bot
git add src/api.js tests/api.test.js
git commit -m "feat(bot): API client"
```

---

### Task 10: Bot — Conversation State

**Files:**
- Create: `bot/src/conversation.js`
- Create: `bot/tests/conversation.test.js`

- [ ] **Step 1: Write failing tests**

Create `bot/tests/conversation.test.js`:
```js
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd bot && npm test tests/conversation.test.js
```
Expected: FAIL

- [ ] **Step 3: Create `bot/src/conversation.js`**

```js
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd bot && npm test tests/conversation.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd bot
git add src/conversation.js tests/conversation.test.js
git commit -m "feat(bot): conversation state with 30min timeout"
```

---

### Task 11: Bot — Claude Integration

**Files:**
- Create: `bot/src/claude.js`
- Create: `bot/tests/claude.test.js`

The bot uses Anthropic tool use. Claude receives a `book_appointment` tool and calls it when ready to book. The bot detects the tool call, creates the appointment, then calls Claude again with the tool result to get a confirmation message.

- [ ] **Step 1: Write failing test**

Create `bot/tests/claude.test.js`:
```js
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
    tools: [],
  });
  expect(result.type).toBe('text');
  expect(result.text).toBe('Olá! Qual é o seu nome?');
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd bot && npm test tests/claude.test.js
```
Expected: FAIL

- [ ] **Step 3: Create `bot/src/claude.js`**

```js
const Anthropic = require('@anthropic-ai/sdk').default;

const BOOK_TOOL = {
  name: 'book_appointment',
  description: 'Registra o agendamento quando o cliente confirmar nome e horário.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nome completo do cliente' },
      slot_id: { type: 'string', description: 'ID do slot escolhido' },
    },
    required: ['name', 'slot_id'],
  },
};

async function askClaude({ apiKey, systemPrompt, messages, tools = [] }) {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    messages,
    tools: [BOOK_TOOL, ...tools],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (toolUse && toolUse.name === 'book_appointment') {
    return { type: 'tool_use', toolUseId: toolUse.id, input: toolUse.input };
  }

  const text = response.content.find(b => b.type === 'text');
  return { type: 'text', text: text?.text ?? '' };
}

module.exports = { askClaude, BOOK_TOOL };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd bot && npm test tests/claude.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd bot
git add src/claude.js tests/claude.test.js
git commit -m "feat(bot): Claude integration with tool use"
```

---

### Task 12: Bot — Message Handler

**Files:**
- Create: `bot/src/handler.js`

This is the orchestrator that ties everything together. It's not unit tested in isolation (it coordinates I/O), but tested manually when running the bot.

- [ ] **Step 1: Create `bot/src/handler.js`**

```js
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

      // Ask Claude for a confirmation message
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
```

- [ ] **Step 2: Run all bot tests**

```bash
cd bot && npm test
```
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
cd bot
git add src/handler.js
git commit -m "feat(bot): message handler orchestrator"
```

---

## Phase 3: Admin Panel

### Task 13: Admin — Project Setup

**Files:**
- Create: `admin/` (Vite + React + Tailwind + shadcn)

- [ ] **Step 1: Scaffold React project**

```bash
npm create vite@latest admin -- --template react
cd admin
npm install
```

- [ ] **Step 2: Install dependencies**

```bash
cd admin
npm install react-router-dom @tanstack/react-query
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Configure Tailwind in `admin/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

- [ ] **Step 4: Replace `admin/src/index.css` with Tailwind import**

```css
@import "tailwindcss";
```

- [ ] **Step 5: Initialize shadcn/ui**

```bash
cd admin
npx shadcn@latest init
```

When prompted:
- Style: **Default**
- Base color: **Slate**
- CSS variables: **Yes**

- [ ] **Step 6: Add shadcn components**

```bash
cd admin
npx shadcn@latest add button input label card table badge textarea
```

- [ ] **Step 7: Create `admin/.env.example`**

```
VITE_API_URL=https://your-api.railway.app
```

- [ ] **Step 8: Verify dev server starts**

```bash
cd admin && npm run dev
```
Expected: Vite dev server on http://localhost:5173

- [ ] **Step 9: Commit**

```bash
cd admin
git add .
git commit -m "feat(admin): React + Vite + Tailwind + shadcn setup"
```

---

### Task 14: Admin — Auth Context, Login Page & Protected Route

**Files:**
- Create: `admin/src/context/AuthContext.jsx`
- Create: `admin/src/components/ProtectedRoute.jsx`
- Create: `admin/src/pages/Login.jsx`
- Create: `admin/src/lib/api.js`
- Modify: `admin/src/App.jsx`
- Modify: `admin/src/main.jsx`

- [ ] **Step 1: Create `admin/src/lib/api.js`**

```js
const BASE = import.meta.env.VITE_API_URL;

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => apiFetch(path, { method: 'DELETE' }),
};
```

- [ ] **Step 2: Create `admin/src/context/AuthContext.jsx`**

```jsx
import { createContext, useContext, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  async function login(password) {
    const data = await api.post('/auth/login', { password });
    localStorage.setItem('token', data.token);
    setToken(data.token);
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 3: Create `admin/src/components/ProtectedRoute.jsx`**

```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
```

- [ ] **Step 4: Create `admin/src/pages/Login.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(password);
      navigate('/config');
    } catch {
      setError('Senha incorreta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Painel Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Create `admin/src/App.jsx`**

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Config from './pages/Config';
import Slots from './pages/Slots';
import Appointments from './pages/Appointments';
import Contacts from './pages/Contacts';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/config" element={<ProtectedRoute><Config /></ProtectedRoute>} />
            <Route path="/slots" element={<ProtectedRoute><Slots /></ProtectedRoute>} />
            <Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
            <Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/config" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Update `admin/src/main.jsx`**

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Create placeholder pages so App.jsx compiles**

Create `admin/src/pages/Config.jsx`, `admin/src/pages/Slots.jsx`, `admin/src/pages/Appointments.jsx`, `admin/src/pages/Contacts.jsx` all with:

```jsx
// admin/src/pages/Config.jsx
export default function Config() { return <div>Config</div>; }

// admin/src/pages/Slots.jsx
export default function Slots() { return <div>Slots</div>; }

// admin/src/pages/Appointments.jsx
export default function Appointments() { return <div>Appointments</div>; }

// admin/src/pages/Contacts.jsx
export default function Contacts() { return <div>Contacts</div>; }
```

- [ ] **Step 8: Start dev server and verify login page loads**

```bash
cd admin && VITE_API_URL=http://localhost:3000 npm run dev
```
Open http://localhost:5173/login — expect login form to render without errors.

- [ ] **Step 9: Commit**

```bash
cd admin
git add src/
git commit -m "feat(admin): auth context, login page, protected route"
```

---

### Task 15: Admin — Layout Component

**Files:**
- Create: `admin/src/components/Layout.jsx`
- Modify: all protected pages to use Layout

- [ ] **Step 1: Create `admin/src/components/Layout.jsx`**

```jsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';

const navItems = [
  { to: '/config', label: 'Configurações' },
  { to: '/slots', label: 'Horários' },
  { to: '/appointments', label: 'Agendamentos' },
  { to: '/contacts', label: 'Contatos' },
];

export function Layout({ children }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex">
      <nav className="w-48 bg-slate-900 text-white flex flex-col p-4 gap-2">
        <p className="text-sm font-semibold text-slate-400 mb-4">Agendamentos</p>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `text-sm px-3 py-2 rounded hover:bg-slate-700 transition-colors ${
                isActive ? 'bg-slate-700 text-white' : 'text-slate-300'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="mt-auto text-slate-300 hover:text-white"
          onClick={handleLogout}
        >
          Sair
        </Button>
      </nav>
      <main className="flex-1 p-6 bg-slate-50 overflow-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd admin
git add src/components/Layout.jsx
git commit -m "feat(admin): layout with sidebar navigation"
```

---

### Task 16: Admin — Config Page

**Files:**
- Modify: `admin/src/pages/Config.jsx`

- [ ] **Step 1: Replace placeholder Config page**

```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export default function Config() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['config'], queryFn: () => api.get('/config') });

  const [form, setForm] = useState({
    telegram_token: '',
    anthropic_api_key: '',
    system_prompt: '',
    google_credentials_json: '',
    google_sheet_id: '',
  });

  useEffect(() => {
    if (data) setForm(prev => ({ ...prev, ...data }));
  }, [data]);

  const mutation = useMutation({
    mutationFn: (values) => api.put('/config', values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });

  function set(key) {
    return e => setForm(prev => ({ ...prev, [key]: e.target.value }));
  }

  if (isLoading) return <Layout><p>Carregando...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-6">Configurações</h1>
      <div className="max-w-2xl space-y-6">

        <Card>
          <CardHeader><CardTitle className="text-base">Telegram</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Token do Bot</Label>
              <Input type="password" value={form.telegram_token} onChange={set('telegram_token')} placeholder="123456:ABC-..." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Anthropic (Claude)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Chave da API</Label>
              <Input type="password" value={form.anthropic_api_key} onChange={set('anthropic_api_key')} placeholder="sk-ant-..." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Atendente</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              <Label>System Prompt</Label>
              <Textarea
                value={form.system_prompt}
                onChange={set('system_prompt')}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-slate-500">Use <code>{'{{SLOTS}}'}</code> para injetar os horários disponíveis.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Google Sheets</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>ID da Planilha</Label>
              <Input value={form.google_sheet_id} onChange={set('google_sheet_id')} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
            </div>
            <div className="space-y-1">
              <Label>Credenciais Service Account (JSON)</Label>
              <Textarea
                value={form.google_credentials_json}
                onChange={set('google_credentials_json')}
                rows={6}
                className="font-mono text-xs"
                placeholder='{"type": "service_account", ...}'
              />
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        {mutation.isSuccess && <p className="text-sm text-green-600">Salvo com sucesso!</p>}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Verify Config page renders (with API running)**

```bash
# Terminal 1 — start API
cd api && ADMIN_PASSWORD=test JWT_SECRET=secret API_SECRET=secret DATABASE_PATH=:memory: npm start

# Terminal 2 — start admin
cd admin && VITE_API_URL=http://localhost:3000 npm run dev
```
Open http://localhost:5173/login, log in with "test", navigate to Config — form should render.

- [ ] **Step 3: Commit**

```bash
cd admin
git add src/pages/Config.jsx
git commit -m "feat(admin): config page"
```

---

### Task 17: Admin — Slots Page

**Files:**
- Modify: `admin/src/pages/Slots.jsx`

- [ ] **Step 1: Replace placeholder Slots page**

```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export default function Slots() {
  const qc = useQueryClient();
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['slots'],
    queryFn: () => api.get('/slots'),
  });

  const [datetime, setDatetime] = useState('');
  const [recurrence, setRecurrence] = useState('');

  const createMutation = useMutation({
    mutationFn: () => api.post('/slots', { datetime, recurrence: recurrence || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['slots'] }); setDatetime(''); setRecurrence(''); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/slots/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slots'] }),
  });

  if (isLoading) return <Layout><p>Carregando...</p></Layout>;

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-6">Horários Disponíveis</h1>
      <div className="max-w-2xl space-y-6">

        <Card>
          <CardHeader><CardTitle className="text-base">Novo Horário</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Data e Hora</Label>
              <Input
                type="datetime-local"
                value={datetime}
                onChange={e => setDatetime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Recorrência (opcional)</Label>
              <select
                className="border rounded px-3 py-2 text-sm w-full"
                value={recurrence}
                onChange={e => setRecurrence(e.target.value)}
              >
                <option value="">Sem recorrência</option>
                <option value="weekly">Semanal</option>
              </select>
            </div>
            <Button onClick={() => createMutation.mutate()} disabled={!datetime || createMutation.isPending}>
              {createMutation.isPending ? 'Criando...' : 'Criar Horário'}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {slots.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum horário cadastrado.</p>
          )}
          {slots.map(slot => {
            const d = new Date(slot.datetime);
            return (
              <div key={slot.id} className="flex items-center justify-between bg-white border rounded px-4 py-3">
                <div>
                  <p className="font-medium text-sm">
                    {d.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}
                  </p>
                  {slot.recurrence && (
                    <p className="text-xs text-slate-500">Recorrência: {slot.recurrence}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={slot.occupied ? 'destructive' : 'default'}>
                    {slot.occupied ? 'Ocupado' : 'Livre'}
                  </Badge>
                  {!slot.occupied && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(slot.id)}
                    >
                      Excluir
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd admin
git add src/pages/Slots.jsx
git commit -m "feat(admin): slots page"
```

---

### Task 18: Admin — Appointments Page

**Files:**
- Modify: `admin/src/pages/Appointments.jsx`

- [ ] **Step 1: Replace placeholder Appointments page**

```jsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';

export default function Appointments() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filter, setFilter] = useState({});

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments', filter],
    queryFn: () => {
      const params = filter.from && filter.to
        ? `?from=${filter.from}&to=${filter.to}`
        : '';
      return api.get(`/appointments${params}`);
    },
  });

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-6">Agendamentos</h1>
      <div className="max-w-4xl space-y-4">
        <div className="flex gap-4 items-end">
          <div className="space-y-1">
            <Label>De</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Até</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <Button onClick={() => setFilter({ from, to })} disabled={!from || !to}>
            Filtrar
          </Button>
          <Button variant="outline" onClick={() => { setFilter({}); setFrom(''); setTo(''); }}>
            Limpar
          </Button>
        </div>

        {isLoading ? (
          <p>Carregando...</p>
        ) : appointments.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum agendamento encontrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Telegram ID</TableHead>
                <TableHead>Criado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.map(a => (
                <TableRow key={a.id}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>{a.slot_id}</TableCell>
                  <TableCell className="font-mono text-sm">{a.telegram_id}</TableCell>
                  <TableCell>{new Date(a.created_at).toLocaleString('pt-BR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd admin
git add src/pages/Appointments.jsx
git commit -m "feat(admin): appointments page with date filter"
```

---

### Task 19: Admin — Contacts Page

**Files:**
- Modify: `admin/src/pages/Contacts.jsx`

- [ ] **Step 1: Replace placeholder Contacts page**

```jsx
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';

export default function Contacts() {
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts'),
  });

  return (
    <Layout>
      <h1 className="text-xl font-semibold mb-6">Contatos Atendidos</h1>
      <div className="max-w-3xl">
        {isLoading ? (
          <p>Carregando...</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum contato ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telegram ID</TableHead>
                <TableHead>Primeiro Contato</TableHead>
                <TableHead>Último Contato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map(c => (
                <TableRow key={c.telegram_id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="font-mono text-sm">{c.telegram_id}</TableCell>
                  <TableCell>{new Date(c.first_seen).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{new Date(c.last_seen).toLocaleString('pt-BR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: Run all admin tests / build check**

```bash
cd admin && npm run build
```
Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd admin
git add src/pages/Contacts.jsx
git commit -m "feat(admin): contacts page"
```

---

## Phase 4: Deploy

### Task 20: Railway Configuration

**Files:**
- Create: `api/railway.toml`
- Create: `bot/railway.toml`
- Create: `admin/railway.toml`
- Create: `api/Procfile`
- Create: `bot/Procfile`

- [ ] **Step 1: Create `api/railway.toml`**

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node src/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 10
restartPolicyType = "on_failure"
```

- [ ] **Step 2: Create `bot/railway.toml`**

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node src/index.js"
restartPolicyType = "on_failure"
```

- [ ] **Step 3: Create `admin/railway.toml`**

```toml
[build]
builder = "nixpacks"
buildCommand = "npm run build"

[deploy]
startCommand = "npx serve dist -l $PORT"
```

- [ ] **Step 4: Install serve in admin**

```bash
cd admin && npm install serve
```

- [ ] **Step 5: Set up Railway project**

1. Go to https://railway.app and create a new project
2. Create three services: `api`, `bot`, `admin`
3. Connect each service to the corresponding subdirectory of your GitHub repository

- [ ] **Step 6: Configure environment variables in Railway dashboard**

For **api** service:
```
ADMIN_PASSWORD=<strong password>
JWT_SECRET=<random 32+ chars>
API_SECRET=<random 32+ chars>
DATABASE_PATH=/data/db.sqlite
PORT=3000
```

For **bot** service:
```
TELEGRAM_TOKEN=<from @BotFather>
API_URL=<Railway internal URL of api service>
API_SECRET=<same as api service>
```

For **admin** service:
```
VITE_API_URL=<public URL of api service>
```

- [ ] **Step 7: Add Railway volume to api service**

In Railway dashboard → api service → Volumes → Add volume:
- Mount path: `/data`

- [ ] **Step 8: Verify deploy**

After deploy, check:
- `GET <api-url>/health` returns `{"ok":true}`
- Admin panel loads at `<admin-url>/login`
- Login with your password works
- Config page loads

- [ ] **Step 9: Configure the bot via admin**

1. Go to Config page
2. Set Telegram token, Anthropic API key
3. Set Google Sheets ID and Service Account credentials
4. Save

- [ ] **Step 10: Test end-to-end**

1. In Railway bot service logs, confirm bot started
2. Open Telegram, message your bot
3. Have a conversation, book a slot
4. Check Appointments page in admin — booking should appear
5. Check Google Sheets — row should appear

- [ ] **Step 11: Commit all deploy config**

```bash
git add api/railway.toml bot/railway.toml admin/railway.toml
git commit -m "feat: Railway deploy configuration"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec requirements addressed — API endpoints, bot conversation flow, admin pages (config, slots, appointments, contacts), auth, Google Sheets, Railway deploy
- [x] **Placeholder scan:** No TBDs, no "implement later", all code blocks complete
- [x] **Type consistency:** `slot_id`, `telegram_id`, `created_at` used consistently across tasks; `BOOK_TOOL` in `claude.js` matches `book_appointment` tool name used in `handler.js`; `apiFetch`/`api` from `lib/api.js` used consistently in all pages
- [x] **Auth flows:** `requireJwtOrApiSecret` defined in Task 3 and used in slots route Task 5; `requireApiSecret` used in appointments Task 6 — consistent
