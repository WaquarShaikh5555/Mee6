# Supabase — the backend, live

**Status: connected, configured, and wired into the app. There is nothing left for you to set up.**

The app now signs up and signs in against a real PostgreSQL database. No servers, no
regions, no deployment step, no credit card.

| | |
| --- | --- |
| Project | `ngufuocbyqrucrytqzbt` |
| Region | `ap-northeast-2` (Seoul — the closest available; ~60–90 ms from Pune) |
| Database | PostgreSQL 17 |
| Plan | Free |

---

## What is actually running

**Accounts.** Supabase runs GoTrue: password hashing, sessions, token refresh, password
resets. The app never sees or stores a password.

**Database.** PostgreSQL with row-level security. One table so far:

```
profiles
  id            uuid, primary key, references auth.users(id) on delete cascade
  display_name  text, 1–80 characters
  created_at    timestamptz
  updated_at    timestamptz, maintained by trigger
```

A database trigger creates a profile row the moment an account is created, seeded with the
name typed at sign-up. Rows are readable and editable **only by their owner** — enforced by
the database, not by the app, so a modified client gains nothing.

The schema is version-controlled in [`supabase/migrations/0001_profiles.sql`](../supabase/migrations/0001_profiles.sql).

**Auth settings applied**

| Setting | Value | Why |
| --- | --- | --- |
| Email confirmation | off | Sign-up returns a session immediately; no waiting on an email that may not arrive |
| Minimum password length | 8 | Matches the app's own validation |
| Site URL / redirects | `shaikhs://reset-password` | Password-reset links open the app |
| JWT lifetime | 1 hour | Refresh tokens keep people signed in without re-entering a password |

Turn email confirmation back on before the app is public. It is off now so that a sign-up
cannot fail because an email landed in spam.

---

## How the app uses it

`src/auth/supabaseAuthService.ts` implements the same `AuthService` interface the screens
have always used. `AuthProvider` picks it automatically when these two values exist:

```
EXPO_PUBLIC_SUPABASE_URL=https://ngufuocbyqrucrytqzbt.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…
```

They are in `apps/mobile/.env` (git-ignored) and documented in `.env.example`.

**The anon key is safe to ship inside an app.** That is its design: it identifies the
project, and row-level security decides what the holder may do. It is not a password.

> **The one key that must never leave the dashboard:** `service_role` / `sb_secret_…`.
> It bypasses row-level security. If it ever appears in this repository, in a screenshot, or
> in a message, rotate it in Project Settings → API.

Sessions are stored in the iOS Keychain / Android Keystore through `expo-secure-store`, so a
token does not sit in a plain file. The SDK refreshes it silently while the app is open.

---

## What works, and what has a limit

**Works now:** sign up, sign in, stay signed in across restarts, sign out, profile row
created automatically, password validation, session refresh.

**Password-reset email — the honest caveat.** Supabase's built-in mail sender is meant for
development and is rate-limited to a handful of messages per hour, and delivery can land in
spam. The app implements the whole flow, and the reset screen works; the email that starts
it may be slow or throttled. Fix it when you are ready by adding your own SMTP provider
(Resend, Brevo, Gmail) under Authentication → Emails → SMTP Settings. Nothing in the app
changes.

**Free plan limits:** 500 MB database, unlimited API requests, 50,000 monthly active users,
1 GB file storage. A personal app will not approach any of these.

**Projects pause after 7 days of inactivity.** The first request after that takes a few
seconds to wake it. Signing in once a week keeps it awake.

---

## Verifying it yourself

The app's preview is running. Open it and:

1. **Create an account** — any real email, a password of 8+ characters with a letter and a
   number.
2. You should land on the home screen, greeted by the name you typed.
3. Close and reopen — you stay signed in.
4. **Settings → Sign out**, then sign back in with the same details.

If step 1 fails, the message on screen names the reason. Send it to me and I will fix it.

To see the data:

```sql
select p.display_name, p.created_at, u.email
from public.profiles p
join auth.users u on u.id = p.id
order by p.created_at desc;
```

---

## Where the old plans went

`apps/api` (the Fastify server), `infra/` (Bicep), and `docs/BACKEND.md` describe a
self-hosted deployment on Azure. They still work and are still tested, but they are **not
part of the current architecture** — running a server to do what Supabase does out of the
box was the wrong trade for one person shipping a first app. They are kept because the
schema design, the security reasoning, and the tests remain useful if the app ever outgrows
the free plan.

The migration path, if that day comes: Supabase *is* PostgreSQL, so `pg_dump` moves the
data into any Postgres, and the app changes one line (`AuthProvider.tsx`) to point at a
different `AuthService`.
