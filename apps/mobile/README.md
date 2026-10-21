# Shaikh's — mobile app

A cross-platform app for iOS and Android, built with Expo (React Native) and TypeScript.

**Current state: real accounts are live.** Design foundation, navigation, and authentication
are in place and verified, and the app signs up and signs in against a hosted PostgreSQL
database (Supabase). Features come next.

- **Stack:** Expo SDK 58 · React Native 0.88 · React 19 · TypeScript 6 (strict) · Expo Router
- **Runs on:** iOS, Android, and web from one codebase
- **Tests:** 109 passing (design system, auth contracts, Supabase client, HTTP client, screens)
- **Accounts:** Supabase when `EXPO_PUBLIC_SUPABASE_*` is set, otherwise the on-device
  preview service

## Run it

```bash
cd apps/mobile
npm install
npx expo start          # then press i, a, or w
```

| Command | What it does |
| --- | --- |
| `npm start` | Dev server with QR code for Expo Go |
| `npm run ios` / `npm run android` / `npm run web` | Open on a specific target |
| `npm test` | Jest suite |
| `npm run typecheck` | TypeScript, strict, no emit |
| `npm run verify` | Typecheck + tests, the same gate CI should run |

Try the flow: **Welcome → Look around with a demo account → Home → Design system → Settings**.

> Running on a physical device needs the Expo Go app. Native iOS builds need macOS + Xcode;
> native Android builds need the Android SDK. Neither is required to develop or preview.

## Design direction: Ink & Peacock

One accent, warm neutrals, brass for milestones. Chosen through the `frontend-design` and
`expo-design-system` skills, and deliberately *not* the current generated-app defaults (cream +
terracotta, near-black + acid green, or the identical-card SaaS kit).

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#F7F5EF` parchment | `#0A0F0F` ink |
| Surface | `#FFFFFF` | `#141C1C` |
| Text | `#1E1C18` | `#E7ECE9` |
| Accent (Peacock) | `#0E6F6B` | `#7FC7C1` |
| Brass | `#8A6227` | `#DFBC7C` |
| Danger | `#B3261E` | `#FF9A91` |

**Why these:** teal reads calm and trustworthy without the generic corporate blue; warm
parchment keeps long sessions comfortable and stops the app looking like a dashboard; brass
appears only for premium and milestone moments, so it never competes with the accent.

**Type:** Georgia for the wordmark and editorial statements, the platform UI sans for everything
else. No font payload, no flash of unstyled text, and Dynamic Type plus non-Latin scripts work
without extra work. Sizes run 40 → 12pt over ten steps, with tracking that tightens as size grows.

**Measured, not eyeballed:** every text/background pair is contrast-checked in
`__tests__/design-system.test.ts`. That suite caught a real failure during development — the
light-mode warning colour sat at 4.42:1, just under the 4.5:1 threshold, and was corrected to
`#8A580C` (5.3:1).

See it live in the app: **Home → Design system**.

## Project structure

```text
src/
  app/                    Routes (Expo Router, file-based)
    _layout.tsx           Providers, theme, auth gate
    index.tsx             Entry redirect based on session
    (auth)/               Unauthenticated stack
      welcome · sign-in · sign-up · forgot-password
    (app)/                Authenticated stack
      index (home) · design · settings
  auth/
    types.ts              AuthService contract + AuthUser/Session
    AuthProvider.tsx      Session state, sign-in/up/out, error surface
    demoAuthService.ts    Local preview implementation
    validation.ts         Field rules shared by forms and service
  theme/
    tokens.ts             Raw scales: colour ramps, type, space, radius, motion
    semantic.ts           Role-based themes (light/dark) built from tokens
    contrast.ts           WCAG maths used by tests and the design screen
    ThemeProvider.tsx     Preference (system/light/dark) + persisted choice
  ui/                     Reusable components
    Text · Button · TextField · Card · Badge · ListRow · Divider
    Screen · ScreenHeader · SegmentedControl · Wordmark
  lib/
    storage.ts            Keychain/Keystore wrapper (+ storage.web.ts)
    haptics.ts            Touch feedback that fails silently
__tests__/                design-system · auth · screens
```

**Rules the code follows:** screens never hardcode a colour, spacing value, or font size; state
has one owner; every interactive element has an accessibility label and a state; components take
`modifier`-style composition (children, not boolean flags).

## Authentication

The app talks to an `AuthService` interface, never to a vendor SDK. Which implementation runs
is one line in `src/auth/AuthProvider.tsx`:

```ts
const service: AuthService = isSupabaseConfigured()
  ? supabaseAuthService
  : isApiConfigured()
    ? httpAuthService
    : demoAuthService;
```

Configuration lives in `apps/mobile/.env` (git-ignored):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable / anon key>
```

Restart the dev server after changing it (`npx expo start -c` clears the cache).

### With Supabase (`supabaseAuthService`)

- Passwords are hashed by the auth server; the app never stores one.
- Sessions are JWTs refreshed in the background, held in the iOS Keychain / Android Keystore
  through `expo-secure-store`.
- `restore()` revalidates the stored token and clears it if the account is gone or revoked.
- Profile rows are created by a database trigger and protected by row-level security, so the
  client cannot read or write anyone else's data even if it is modified.
- Password reset emails link to `shaikhs://reset-password`, which opens the reset screen.

### Without it (`demoAuthService`)

The local preview service stores accounts on the device and **does not verify passwords**. It
exists so the flow still works for anyone who has not configured a project. The Welcome screen
labels it "Preview build" and the demo button only appears in that mode.

### Tests

`__tests__/supabaseAuthService.test.ts` stubs the Supabase client and asserts the mapping the
UI depends on: which SDK calls happen, error-code translation, and how the stored session
behaves when it is revoked, refreshed, or expired. `__tests__/screens.test.tsx` renders every
screen inside the real providers.

## Platform notes

- **Orientation is not locked.** Foldables and tablets need landscape, and Android large-screen
  tiers expect it.
- **Edge-to-edge is on** for Android; safe-area insets are handled by `Screen`.
- **Dynamic Type / font scaling** is honoured, capped at 1.8× so layouts reflow rather than break.
- **Haptics** are used for press and success feedback, and can never throw.
- **No dark-mode flash**: the stored preference is read before the first screen paints.

## What is not done yet

- Features — deliberately deferred; you define them.
- A deployed backend. The API and its Azure infrastructure are built
  ([docs/BACKEND.md](../../docs/BACKEND.md)); deployment needs an Azure subscription.
- Email verification and MFA — additive to the existing endpoints.
- Push notifications, offline sync, analytics — all require infrastructure choices.
- Native builds: this sandbox has no Android SDK or Xcode, so no APK/AAB/IPA has been produced.
  `npx expo start` and the web preview are the verified targets so far.
- Store submission: needs signing credentials and an Apple Developer / Google Play account.
