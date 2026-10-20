/**
 * Minimal forward-only migrator.
 *
 * Reads src/db/migrations/NNNN_name.sql in order, applies the ones not already
 * recorded in schema_migrations, and does so inside a transaction per file so a
 * failed migration leaves the database untouched.
 *
 * Deliberately not a framework: the whole behaviour is 60 lines and can be
 * reviewed. It runs identically against PGlite and Azure PostgreSQL.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DatabaseHandle } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));

export function migrationsDirectory(): string {
  return join(here, 'migrations');
}

export type MigrationResult = { applied: string[]; skipped: string[] };

export async function migrate(
  handle: DatabaseHandle,
  directory = migrationsDirectory(),
): Promise<MigrationResult> {
  await handle.exec(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const files = (await readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const existing = await handle.query<{ name: string }>('select name from schema_migrations');
  const applied = new Set(existing.map((row) => row.name));

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of files) {
    if (applied.has(file)) {
      result.skipped.push(file);
      continue;
    }

    const sql = await readFile(join(directory, file), 'utf8');

    await handle.exec('begin');
    try {
      await handle.exec(sql);
      await handle.query('insert into schema_migrations (name) values ($1)', [file]);
      await handle.exec('commit');
      result.applied.push(file);
    } catch (error) {
      await handle.exec('rollback');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }

  return result;
}
