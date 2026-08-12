import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Pool } from 'pg';

export async function runMigrations(pool: Pool, directory = process.env.MIGRATIONS_DIR ?? resolve('infra/migrations')): Promise<void> {
  const files = (await readdir(directory)).filter(file => /^\d+-.+\.sql$/.test(file)).sort();
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS hedgeos_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of files) {
      const version = file.slice(0, file.indexOf('-'));
      const applied = await client.query('SELECT 1 FROM hedgeos_schema_migrations WHERE version = $1', [version]);
      if (applied.rowCount) continue;
      await client.query('BEGIN');
      try {
        await client.query(await readFile(join(directory, file), 'utf8'));
        await client.query('INSERT INTO hedgeos_schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}
