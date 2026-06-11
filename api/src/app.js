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

  // Placeholder slots route — replaced in Task 5
  app.get('/slots', requireJwtOrApiSecret, (_req, res) => res.json([]));

  return app;
}

module.exports = { createApp };
