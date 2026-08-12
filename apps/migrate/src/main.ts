import { Pool } from 'pg';
import { runMigrations } from '@hedgeos/infrastructure';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await runMigrations(pool);
} finally {
  await pool.end();
}
