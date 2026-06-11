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
