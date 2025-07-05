// PostgreSQL DB initialization script for disasters table
import { Pool } from 'pg';
import { CREATE_DISASTERS_TABLE_SQL } from './disaster.model.js';

console.log('[init-db.ts] Using POSTGRES_URI:', process.env.POSTGRES_URI);
const pool = new Pool({
  connectionString: process.env.POSTGRES_URI,
});

async function initDb() {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    await pool.query(CREATE_DISASTERS_TABLE_SQL);
    console.log('Database initialized: disasters table and PostGIS extension ensured.');
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDb();
