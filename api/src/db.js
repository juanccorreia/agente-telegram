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
