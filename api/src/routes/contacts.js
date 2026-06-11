const { Router } = require('express');

function createContactsRouter(db, { requireJwt }) {
  const router = Router();

  router.get('/', requireJwt, (req, res) => {
    res.json(db.prepare('SELECT * FROM contacts ORDER BY last_seen DESC').all());
  });

  return router;
}

module.exports = { createContactsRouter };
