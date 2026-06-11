const Database = require('better-sqlite3');
const { runMigrations } = require('../src/db');

test('appointments.slot_id is unique', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare('INSERT INTO appointments VALUES (?,?,?,?,?)').run('id1','slot1','João','123','2026-01-01');
  expect(() => {
    db.prepare('INSERT INTO appointments VALUES (?,?,?,?,?)').run('id2','slot1','Maria','456','2026-01-01');
  }).toThrow();
  db.close();
});

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
