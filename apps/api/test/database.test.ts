/**
 * Schema and migration guarantees, asserted against the live database rather
 * than against the TypeScript types — the migration SQL is what production runs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase, type DatabaseHandle } from '../src/db/client.js';
import { migrate } from '../src/db/migrate.js';

type ColumnRow = { table_name: string; column_name: string; data_type: string; is_nullable: string };
type IndexRow = { indexname: string };

let handle: DatabaseHandle;

beforeAll(async () => {
  handle = await createDatabase({ pglitePath: 'memory://' });
  await migrate(handle);
});

afterAll(async () => {
  await handle.close();
});

describe('migrations', () => {
  it('applies the initial migration once', async () => {
    const rows = await handle.query<{ name: string }>('select name from schema_migrations order by name');
    expect(rows.map((row) => row.name)).toEqual(['0001_init.sql']);
  });

  it('is idempotent — a second run changes nothing', async () => {
    const second = await migrate(handle);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['0001_init.sql']);
  });
});

describe('schema', () => {
  it('creates the three application tables', async () => {
    const rows = await handle.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`,
    );
    const names = rows.map((row) => row.table_name);

    expect(names).toContain('users');
    expect(names).toContain('sessions');
    expect(names).toContain('password_reset_tokens');
  });

  it('defines the users columns the service depends on', async () => {
    const rows = await handle.query<ColumnRow>(
      `select table_name, column_name, data_type, is_nullable
       from information_schema.columns where table_name = 'users'`,
    );
    const columns = Object.fromEntries(rows.map((row) => [row.column_name, row]));

    expect(Object.keys(columns).sort()).toEqual(
      ['created_at', 'deleted_at', 'display_name', 'email', 'id', 'password_hash', 'updated_at'].sort(),
    );
    expect(columns.email?.is_nullable).toBe('NO');
    expect(columns.password_hash?.is_nullable).toBe('NO');
    expect(columns.deleted_at?.is_nullable).toBe('YES');
    expect(columns.created_at?.data_type).toBe('timestamp with time zone');
    expect(columns.id?.data_type).toBe('uuid');
  });

  it('enforces a case-insensitive unique email among live accounts only', async () => {
    await handle.query('truncate table users cascade');

    await handle.query(
      `insert into users (email, password_hash, display_name) values ($1, $2, $3)`,
      ['person@example.com', 'x', 'Person'],
    );

    // Same address, different case: the partial unique index must reject it.
    await expect(
      handle.query(`insert into users (email, password_hash, display_name) values ($1, $2, $3)`, [
        'PERSON@example.com',
        'x',
        'Person',
      ]),
    ).rejects.toThrow();

    // After soft deletion the address is free again.
    await handle.query('update users set deleted_at = now()');
    await expect(
      handle.query(`insert into users (email, password_hash, display_name) values ($1, $2, $3)`, [
        'person@example.com',
        'x',
        'Person',
      ]),
    ).resolves.toBeDefined();
  });

  it('cascades session deletion when a user row is removed', async () => {
    await handle.query('truncate table users cascade');
    const [user] = await handle.query<{ id: string }>(
      `insert into users (email, password_hash, display_name) values ($1, $2, $3) returning id`,
      ['cascade@example.com', 'x', 'Cascade'],
    );

    await handle.query(
      `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 day')`,
      [user!.id, 'hash-1'],
    );

    await handle.query('delete from users where id = $1', [user!.id]);

    const rows = await handle.query<{ count: string }>('select count(*)::text as count from sessions');
    expect(rows[0]!.count).toBe('0');
  });

  it('indexes the columns used for lookups', async () => {
    const rows = await handle.query<IndexRow>(
      `select indexname from pg_indexes where schemaname = 'public'`,
    );
    const names = rows.map((row) => row.indexname);

    expect(names).toContain('users_email_live_idx');
    expect(names).toContain('sessions_user_id_idx');
    expect(names).toContain('sessions_expires_at_idx');
    expect(names).toContain('password_reset_user_id_idx');
  });

  it('rejects a blank display name at the database level too', async () => {
    await expect(
      handle.query(`insert into users (email, password_hash, display_name) values ($1, $2, $3)`, [
        'blank@example.com',
        'x',
        '',
      ]),
    ).rejects.toThrow();
  });
});
