# Security notes

A plain account of what protects an account in Shaikh's, what was checked, and what is
still weak. Written to be read by the person who owns this app, not to impress anyone.

Last audit: **23 October 2026**.

---

## Passwords

- The app never sees or stores a password. `signUp` and `signIn` hand it straight to
  Supabase's authentication service over HTTPS.
- Passwords are hashed there with **bcrypt** and a per-password salt. The hash is not
  reversible, and the app has no code path that can read it.
- The app never logs a password, never puts one in storage, and never includes one in a URL.
- Password reset goes through a single-use, time-limited link that returns to the app
  through its `shaikhs://` URL scheme.

**Weak points, honestly:**

| Setting | Value | Why it matters |
| --- | --- | --- |
| Minimum password length | 6 | The app enforces 8 on its own form, but a direct API call could set 6. Supabase's free plan does not expose this setting to the connector used here. |
| Leaked-password protection | off | Supabase can check new passwords against HaveIBeenPwned. Not available on this plan/tooling. |
| Email confirmation | off | Sign-up signs you in immediately. That was deliberate: the built-in mailer allows only a couple of emails per hour, so requiring confirmation would make sign-up fail for friends. The cost is that nobody proves they own the address they register. |
| MFA | available but unused | TOTP can be switched on in Supabase; the app has no screen for it yet. |

None of these let someone read another person's account, but they are the honest gaps.

---

## Sessions

- The access token is a JWT valid for **1 hour**; the refresh token rotates on every use.
- Both are stored in the phone's encrypted storage — the iOS Keychain / Android Keystore
  through `expo-secure-store` — not in a plain file or `localStorage`.
- Signing out signs out locally and clears the stored tokens.
- Restoring a session calls the server to confirm the account still exists, so a revoked or
  deleted account does not come back to life from a cached token.

---

## Data access

There are two tables: `public.profiles` (one row per account) and `public.admin_audit`
(every change made from the owner console). Row-level security is **on** for both:

```sql
profiles_select_own : auth.uid() = id                       -- SELECT
profiles_update_own : auth.uid() = id and not is_blocked    -- UPDATE
admin_audit         : no policies at all                    -- readable only through a
                                                               security-definer function
                                                               that checks is_admin
```

There is no insert policy (rows are created by a trigger on `auth.users`) and no delete
policy, so a signed-in client cannot create, delete, or read anyone else's row — including
by guessing a UUID.

Column privileges are separate from those policies, and were tightened for the owner flag:

```sql
revoke update on public.profiles from authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;
```

Verified live: `has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE')`
returns **false**, while `display_name` returns true. An account cannot promote itself, and
the app has no endpoint that could.

Behind the grants there is a second wall: a `before update` trigger restores every protected
column (`is_admin`, `is_blocked`, `pro_until`, `email`, `last_seen_at`, `id`, `created_at`)
from `OLD` unless the statement comes from one of the console functions, which set a
transaction-local flag the client cannot set for itself. If a future migration ever widens
the grants, that trigger still holds.

### The owner console

`people` in the app is the whole console: the account list with Pro / paused / owner state,
the four actions (grant or revoke Pro, pause or restore, make or remove an owner) and the
audit trail, on the phone.

Authority is never the screen. Each call goes to a `security definer` function —
`admin_list_users`, `admin_overview`, `admin_set_access`, `admin_recent_actions` — that
re-reads `is_admin` from `profiles` for `auth.uid()` and raises `not_authorised` otherwise.
Verified live: an ordinary account calling `admin_overview()` receives
`ERROR 42501: not_authorised`, and `admin_set_access()` refuses to let an owner pause,
demote or revoke Pro from **themselves**, or remove the **last** owner.

Blocking is honest about its reach: the app signs a paused account out at launch and at
sign-in, using a server answer (`my_access()`), not a local flag. Their documents were
always stored on their own phone, so nothing of theirs is deleted or held hostage.

---

## Keys

| Key | Where it lives | Safe to expose? |
| --- | --- | --- |
| Publishable / anon | In the app bundle and the CI workflow | **Yes** — by design. It identifies the project; RLS decides what it can do. |
| `service_role` / secret | Nowhere in this repository | **Never.** It bypasses RLS entirely. |

Checked in the repository:

- `git ls-files` contains no `.env`, keystore, or key material — only `.env.example`.
- No tracked file contains `service_role` as a value, or an `sb_secret_` key.
- The anon key appears in exactly two places: the CI workflow and the docs that explain it.

If the anon key is ever abused (someone scraping the API), rotating it in Supabase is safe
and costs nothing; only the app's next build needs the new value.

---

## What Focus Mode is trusted with

- The accessibility service reads **view ids and content descriptions**. It never reads
  message text, post text, passwords, or keyboard input, and it cannot perform actions in
  another app except the one the person taps (open DMs, or Back).
- Rules and counters live in the app's private `SharedPreferences` and are never uploaded.
- The permission can be revoked at any time in Settings → Accessibility, and the app keeps
  working without it.

---

## Transport

Everything goes over HTTPS to `*.supabase.co`. There is no other server, no analytics
endpoint, and no third-party SDK that could phone home. The app makes no network request at
all while Focus Mode is doing its job.

---

## Changes worth making next

1. Turn on **email confirmation** once a custom SMTP sender is configured (free with a
   Gmail app password), then set `mailer_autoconfirm` back to false.
2. Raise the minimum password length to 10 and enable leaked-password protection, either
   from the Supabase dashboard or by self-hosting the auth settings.
3. Add **TOTP** enrolment for the owner account — it is the one account whose compromise
   would matter beyond itself.
4. Add an "export my data" and "delete my account" button, so the promises in the privacy
   policy are self-service rather than a request by email.

---

## Reporting

Security problems: open an issue at
<https://github.com/WaquarShaikh5555/Mee6/issues>, or contact the owner directly if the
issue should not be public.
