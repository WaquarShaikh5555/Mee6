# Shaikh's — mobile app

A cross-platform app for iOS and Android, built with Expo (React Native) and TypeScript.

**Current state: Step 1 complete, backend integration in progress.** Design foundation,
navigation, and authentication are in place and verified; the app talks to the real API in
`apps/api` when `EXPO_PUBLIC_API_URL` is set. Features come next.

- **Stack:** Expo SDK 58 · React Native 0.88 · React 19 · TypeScript 6 (strict) · Expo Router
- **Runs on:** iOS, Android, and web from one codebase
- **Tests:** 92 passing (design system, auth contracts, HTTP client, screen rendering)
- **Accounts:** the Shaikh's API when `EXPO_PUBLIC_API_URL` is set, otherwise the on-device
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

The app talks to an `AuthService` interface, never to a vendor SDK. Which implementation it uses
is one line in `src/auth/AuthProvider.tsx`:

```ts
const service: AuthService = isApiConfigured() ? httpAuthService : demoAuthService;
```

`isApiConfigured()` is true when `EXPO_PUBLIC_API_URL` is set at build time:

```bash
# apps/mobile/.env
EXPO_PUBLIC_API_URL=http://192.168.1.20:8082      # phone on the same Wi-Fi as your laptop
# EXPO_PUBLIC_API_URL=https://<app>.azurecontainerapps.io   # deployed backend
```

Restart the dev server after changing it (`npx expo start -c` clears the cache).

### With the real API (`httpAuthService`)

- Passwords are hashed with argon2id on the server; the app never stores one.
- The session token is opaque (256 bits), stored in the iOS Keychain / Android Keystore, and
  revoked server-side on sign-out.
- `restore()` revalidates the stored token against `GET /v1/auth/session`, refreshes the expiry,
  and clears the token when it has been revoked. If the device is offline it keeps the last
  known session rather than signing the person out.
- Server error codes map onto the app's `AuthError` codes, so screens show the same copy either
  way.
- Password reset sends a real email through Azure Communication Services and the link opens
  `shaikhs://reset-password?token=…`.

### Without it (`demoAuthService`)

The local preview service stores accounts on the device and **does not verify passwords**. It
exists so the flow still works for anyone who has not started the backend. The Welcome screen
labels it "Preview build" and the demo button only appears in that mode.

### Tests

`__tests__/httpAuthService.test.ts` stubs `fetch` and asserts exactly what crosses the wire:
paths, bodies, bearer tokens, error-code mapping, and what happens to the stored session on
every branch (revoked, offline, expired). `__tests__/auth.test.ts` covers the demo service and
shared validation rules; `__tests__/screens.test.tsx` renders every screen.

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
