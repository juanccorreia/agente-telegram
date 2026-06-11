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
  app.get('/slots', requireJwtOrApiSecret, (_req, res) => res.json([]));

  return app;
}

module.exports = { createApp };
