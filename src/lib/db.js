// src/lib/db.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.PGHOST,
  user:     process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port:     Number(process.env.PGPORT || 5432),
  max:      10,
  idleTimeoutMillis: 30_000
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params)
};
