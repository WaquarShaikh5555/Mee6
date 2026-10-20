-- 0001_init.sql — accounts, sessions, password resets.
--
-- Portable PostgreSQL: the same file runs against the embedded PGlite instance in
-- development and tests, and against Azure Database for PostgreSQL in production.
-- Only core features are used (uuid, timestamptz, partial indexes, gen_random_uuid,
-- which is built into PostgreSQL 13+ and therefore needs no extension).

create table users (
  id            uuid primary key default gen_random_uuid(),
  -- Stored lower-cased. Uniqueness is enforced case-insensitively and only among
  -- live accounts, so deleting an account frees its address for reuse.
  email         text        not null,
  password_hash text        not null,
  display_name  text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Set by "delete account". Rows are purged after a 30-day grace period.
  deleted_at    timestamptz,
  constraint users_email_not_blank check (length(btrim(email)) > 0),
  constraint users_display_name_len check (length(display_name) between 1 and 60)
);

create unique index users_email_live_idx
  on users (lower(email))
  where deleted_at is null;

create table sessions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references users (id) on delete cascade,
  -- Only the SHA-256 of the bearer token is stored: a database leak cannot be
  -- replayed as a session, and lookup is still a single indexed read.
  token_hash   text        not null unique,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  user_agent   text,
  -- Salted hash of the client IP: enough to spot abuse, not enough to store a
  -- user's location history.
  ip_hash      text
);

create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);

create table password_reset_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references users (id) on delete cascade,
  token_hash text        not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create index password_reset_user_id_idx on password_reset_tokens (user_id);
