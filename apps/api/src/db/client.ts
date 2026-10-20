/**
 * Database connection.
 *
 * Production: PostgreSQL (Azure Database for PostgreSQL Flexible Server) over TCP,
 * pooled, TLS required.
 * Development and tests: PGlite, an embedded build of PostgreSQL 16 compiled to
 * WebAssembly. It speaks the same SQL, so migrations and queries are identical —
 * there is no second dialect to keep in sync and no local Postgres to install.
 *
 * The PGlite import is dynamic so it never ships in the production image.
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { drizzle as drizzleNode, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseHandle = {
  db: Database;
  /** Runs a raw statement batch. Used by the migrator. */
  exec(sql: string): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
  /** Which backing store is in use — surfaced by /health for operators. */
  kind: 'postgres' | 'pglite';
};

type CreateOptions = {
  /** A postgres:// URL. When omitted, an embedded PGlite database is created. */
  url?: string;
  /** Path or `memory://` for PGlite. Ignored when `url` is set. */
  pglitePath?: string;
  maxConnections?: number;
};

export async function createDatabase(options: CreateOptions = {}): Promise<DatabaseHandle> {
  if (options.url) {
    const pool = new Pool({
      connectionString: options.url,
      max: options.maxConnections ?? 10,
      // Managed Postgres fronted by a proxy: keep TLS on, accept the provider CA
      // through sslmode in the URL rather than disabling verification globally.
      ssl: options.url.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    const db = drizzleNode(pool, { schema });

    return {
      db,
      kind: 'postgres',
      async exec(sql) {
        await pool.query(sql);
      },
      async query<T>(sql: string, params: unknown[] = []) {
        const result = await pool.query(sql, params);
        return result.rows as T[];
      },
      async close() {
        await pool.end();
      },
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');

  const path = options.pglitePath ?? 'memory://';

  // PGlite's filesystem backend creates one directory level; a nested data
  // path such as `.data/pg` needs its parent to exist first.
  if (path !== 'memory://') {
    await mkdir(dirname(path), { recursive: true });
  }

  const client = new PGlite(path);
  await client.waitReady;
  const db = drizzlePglite(client, { schema }) as unknown as Database;

  return {
    db,
    kind: 'pglite',
    async exec(sql) {
      await client.exec(sql);
    },
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await client.query<T>(sql, params);
      return result.rows;
    },
    async close() {
      await client.close();
    },
  };
}
