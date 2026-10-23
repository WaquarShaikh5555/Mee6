# Mee6

Two things live here:

1. **A mobile engineering skill library** — 115 Agent Skills that teach a coding agent how to build
   production Android and iOS apps. See [SKILLS.md](SKILLS.md) and
   [docs/MOBILE_TOOLCHAIN_REQUIREMENTS.md](docs/MOBILE_TOOLCHAIN_REQUIREMENTS.md).
2. **Shaikh's** — the app those skills were installed to build.
   - Mobile app: `apps/mobile` — [README](apps/mobile/README.md)
   - Backend: Supabase (hosted, configured) — [docs/SUPABASE.md](docs/SUPABASE.md)

## Shaikh's

Expo + React Native + TypeScript on the client. Accounts and data live in Supabase
(hosted PostgreSQL) — no server to deploy, no card required.

**First feature: Regain.** A dashboard button opens a screen that closes the compulsive parts
of social apps — Reels, Shorts, Spotlight — while leaving messages and anything someone chose
to send you open.

**Install it on an Android phone:** [download `shaikhs.apk`](https://github.com/WaquarShaikh5555/Mee6/releases/download/apk/shaikhs.apk),
open it, allow installing from this source, then open Regain and allow it in
Settings → Accessibility. Built by GitHub Actions on every push
([how it works](docs/REGAIN.md)).

```bash
cd apps/mobile
npm install
npx expo start
```

Real authentication is wired up and tested (139 tests). Set the two `EXPO_PUBLIC_SUPABASE_*`
values from [apps/mobile/.env.example](apps/mobile/.env.example) in `apps/mobile/.env`;
without them the app falls back to an on-device demo service so screens stay usable.

Status of the backend, what is configured, and its limits:
[docs/SUPABASE.md](docs/SUPABASE.md).

Design direction, token values, and architecture decisions are in the app README and in
[docs/adr](docs/adr). `apps/api` and `infra/` hold a self-hosted alternative that the app no
longer uses — kept for reference.
