# Engineering handbook

Everything a developer — or an AI agent — needs before changing this repository. The user-facing
description of the app is the [README](../README.md); this file is the part that would be noise there.

## The shape of the repo

| Path | What it is |
| --- | --- |
| `apps/mobile` | The shipping app. Expo SDK 58, React Native 0.88, React 19, TypeScript 6 (strict), Expo Router. |
| `supabase/migrations` | The database schema, kept in step with the live project. |
| `skills/` | 115 mobile-engineering skills (`SKILL.md` per skill). `.claude/skills` is a symlink to it. |
| `docs/` | Feature and operations docs. `AGENTS.md` is the routing table for skills. |
| `apps/api`, `infra/` | A self-hosted Fastify/Postgres/Azure alternative the app no longer uses. Reference only. |

## The four rules the code follows

1. **One source per value.** Screens read `useTheme()` — never a hex code, a font size, or a
   spacing number. New colours go in `theme/tokens.ts` → `theme/semantic.ts`, and
   `__tests__/design-system.test.ts` proves each pair at WCAG AA in both schemes before it ships.
2. **State has one owner.** `AuthProvider` owns the session, `FocusProvider` the rules,
   `useUnlock` the 48-hour window, `ThemeProvider` the appearance. Nothing else caches a copy.
3. **Authority lives in Postgres.** `is_admin`, `is_blocked` and `pro_until` are server columns a
   client cannot write; every owner action is a `security definer` function that re-checks the
   caller. Hiding a button is a courtesy, never a permission.
4. **Never ship an unverified guess.** `npm run verify` (type check + Jest) passes before a commit.
   A native change is not done until a build installs and opens on a phone.

## Where things are

```
apps/mobile/src/
  app/                 Routes. (app) is signed-in, (auth) is not; people.tsx is the owner console.
  auth/                AuthService contract, Supabase implementation, demo fallback, storage.
  admin/service.ts     RPC wrappers for the owner console (list, overview, setAccess, audit).
  ads/                 Rewarded ad module bridge, entitlement storage, unlock hook, gate card.
  focus/               Focus Mode rules, native module bridge, blocked screen.
  pdf/                 Engine bridge, catalogue (tools as data), components.
  theme/               tokens → semantic → ThemeProvider; contrast maths.
  ui/                  Text, Button, Card, ListRow, Screen, motion.tsx …
modules/               Native Expo modules: focus, pdf, rewarded, updater, diagnostics.
__tests__/             Design system, auth contracts, every screen, PDF parity.
```

Feature docs: [FOCUS](FOCUS.md) · [PDF-ARENA](PDF-ARENA.md) · [ADS](ADS.md) · [UPDATES](UPDATES.md) ·
[SECURITY](SECURITY.md) · [SUPABASE](SUPABASE.md) · [BRAND](BRAND.md) · [INSTALL](INSTALL.md).

## Motion and colour

Motion lives in `src/ui/motion.tsx` and is deliberately small: native-driver `Animated` only, no
extra dependency. Three rules — never animate something being read; acknowledge the press on the
first frame (`onPressIn`, spring to ~0.97); honour Reduce Motion live, falling back to a fade or
nothing.

Colour families: peacock (accent, Edit), brass (Pro and milestones), sage (Optimise), plum
(Secure), clay (Convert), lagoon (information and background services), parchment/ink (surfaces).
Category colours are semantic, not decorative: the same family means the same kind of tool
everywhere in the app.

## Backend

Supabase owns accounts, sessions, profiles and the owner functions. Migrations `0001_profiles`,
`0002_admin` and `0003_delete_account` are applied to the live project; any further change must be
a new file in `supabase/migrations` and applied through the Supabase tooling, not hand-edited in
the dashboard. Account deletion is a `security definer` function: the app can remove its own
account and nothing else's, and the profile goes with it by cascade.
The publishable/anon key is safe to ship (RLS enforces everything); a `service_role` key must
never enter the repo, a screenshot, or a message.

## Building

CI (`.github/workflows/android.yml`) runs on every push to `main` and to the session branch:
type check, tests, `expo prebuild`, Gradle, four APK variants (universal, arm64, arm64-lite,
32-bit and lite), manifest guards, then it publishes to the `apk` release with `version.json`.

Two hard-won constraints, both of which have already caused a shipped crash:

- **Shrinking stays off.** R8 removed Room's reflective `WorkDatabase_Impl` and closed the app at
  startup in 0.13.0. Do not re-enable `minifyEnabled` / `shrinkResources`.
- **Never gate a button on a promise without a deadline.** A native call that never answers must
  resolve into a visible outcome; the rewarded flow has a 20 s watchdog for exactly this.

Version is `major*10000 + minor*100 + patch` for the Android `versionCode`, derived in CI.

## Working with the skill library

`AGENTS.md` routes a task to the one or two skills that own it; read `SKILL.md` before writing
code, and always let this repository's existing architecture, theme and CI override a skill's
defaults. Skills are references, not build environments.
