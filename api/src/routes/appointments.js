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

    // Mirror to Google Sheets (non-blocking)
    const slot = db.prepare('SELECT datetime FROM slots WHERE id = ?').get(slot_id);
    appendAppointmentToSheet(db, { name, datetime: slot?.datetime, telegram_id, created_at }).catch(
      err => console.error('Sheets sync error:', err.message)
    );

    res.status(201).json({ id, slot_id, name, telegram_id, created_at });
  });

  router.get('/', requireJwt, (req, res) => {
    const { from, to } = req.query;
    if (from && to) {
      return res.json(
        db.prepare('SELECT * FROM appointments WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC').all(from, to)
      );
    }
    res.json(db.prepare('SELECT * FROM appointments ORDER BY created_at DESC').all());
  });

  return router;
}

module.exports = { createAppointmentsRouter };
