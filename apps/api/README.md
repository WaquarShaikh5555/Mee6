# Shaikh's API

Fastify + PostgreSQL backend for the Shaikh's mobile app: accounts, sessions, password
resets, and profile management.

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:8082, embedded PostgreSQL, no setup
```

```bash
npm test             # 48 tests against in-memory PostgreSQL
npm run typecheck
npm run verify       # typecheck + tests
npm run build && npm start
```

- **Database:** PostgreSQL 16 everywhere. Azure Flexible Server in production, PGlite
  in development and tests — same migrations, same SQL.
- **Auth:** argon2id password hashes, opaque session tokens stored as SHA-256 hashes,
  immediate revocation on sign-out and password reset, no account enumeration.
- **Email:** console in development, Azure Communication Services in production.

Full instructions — local setup, Azure deployment, secrets, backups, troubleshooting —
are in [docs/BACKEND.md](../../docs/BACKEND.md). Infrastructure lives in
[`infra/main.bicep`](../../infra/main.bicep).

## Layout

```
src/
  app.ts                 Fastify instance: plugins, /health, routes, shutdown
  index.ts               Entry point: config → database → migrate → listen
  config.ts              Environment schema and production guards
  db/
    migrations/*.sql     Forward-only schema (the source of truth)
    migrate.ts           Migrator: one transaction per file
    client.ts            pg.Pool in production, PGlite locally
    schema.ts            Typed mirrors of the tables
  lib/                   Errors, tokens, argon2 wrapper, email senders
  modules/auth/          Sign-up, sign-in, sessions, password reset
  modules/me/            Profile read/update/delete
test/                    Auth, hardening, schema, and email-signing tests
```
