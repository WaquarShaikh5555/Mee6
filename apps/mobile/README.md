# Shaikh's — the app

Expo + React Native + TypeScript. Focus Mode, PDF Arena, real accounts, and an owner console,
shipped as an Android APK from this repository.

- **Stack:** Expo SDK 58 · React Native 0.88 · React 19 · TypeScript 6 (strict) · Expo Router
- **Backend:** Supabase when `EXPO_PUBLIC_SUPABASE_*` is set; an on-device preview otherwise
- **Gate:** `npm run verify` — strict type check plus 335 tests

## Run it

```bash
cd apps/mobile
npm install
npx expo start          # then i, a, or w
```

| Command | Does |
| --- | --- |
| `npm test` | Jest suite |
| `npm run typecheck` | TypeScript, no emit |
| `npm run verify` | Both — the same gate CI runs |
| `npx expo start -c` | Restart with a cleared cache (after changing `.env`) |

Configuration lives in `.env` (git-ignored), documented in `.env.example`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

## What is where

```
src/app/        Routes: (auth) signed out, (app) signed in, people.tsx = owner console
src/auth/       AuthService contract, Supabase + demo implementations, session storage
src/admin/      Owner console RPCs (list, overview, setAccess, audit)
src/ads/        Rewarded bridge, 48-hour entitlement, unlock hook and gate card
src/focus/      Focus Mode rules, native bridge, blocked screen
src/pdf/        PDF engine bridge, tool catalogue, components
src/theme/      tokens → semantic themes → ThemeProvider, contrast maths
src/ui/         Text, Button, Card, ListRow, Screen, motion.tsx
```

Two conventions worth knowing before editing: screens read colours and sizes from `useTheme()`
only, and authority is enforced in Postgres — the UI only decides what to display.

## Building

Android builds happen in GitHub Actions; every push that touches the app produces four APK
variants and attaches them to the `apk` release. Locally, `npx expo prebuild` then Gradle works,
but there is no SDK in the dev container here. See [docs/UPDATES.md](../../docs/UPDATES.md).

Deeper detail: [engineering handbook](../../docs/ENGINEERING.md) ·
[Focus Mode](../../docs/FOCUS.md) · [PDF Arena](../../docs/PDF-ARENA.md) ·
[Ads](../../docs/ADS.md) · [Security](../../docs/SECURITY.md).
