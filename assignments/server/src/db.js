import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export const pool = new pg.Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'root',
  database: process.env.PGDATABASE || 'room_alloc',
  max: 10,
});

export const query = (text, params) => pool.query(text, params);

/** Run a function inside a transaction. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
