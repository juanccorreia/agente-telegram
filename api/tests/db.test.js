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
