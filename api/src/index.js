require('dotenv').config();
const { getDb } = require('./db');
const { createApp } = require('./app');

const db = getDb(process.env.DATABASE_PATH);
const app = createApp(db);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));
