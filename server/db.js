import pg from 'pg';
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  console.error('Nedostaje DATABASE_URL. Vidi .env.example');
  process.exit(1);
}

// Supabase i Render traže SSL; lokalni Postgres ne.
const lokalno = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: lokalno ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

export const upit = (tekst, params) => pool.query(tekst, params);
