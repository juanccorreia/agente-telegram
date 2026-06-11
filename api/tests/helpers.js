const Database = require('better-sqlite3');
const { runMigrations } = require('../src/db');
const { createApp } = require('../src/app');

function createTestApp() {
  const db = new Database(':memory:');
  runMigrations(db);
  const app = createApp(db);
  return { app, db };
}

module.exports = { createTestApp };
