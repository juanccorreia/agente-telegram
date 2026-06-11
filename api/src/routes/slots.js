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
