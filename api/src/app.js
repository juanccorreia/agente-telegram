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
