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

**Regain.** A dashboard card opens a screen that closes the compulsive parts of social apps —
Reels, Shorts, Spotlight — while leaving messages and anything someone chose to send you open.

**PDF Arena.** Twenty-one tools — merge, split, delete, rearrange, rotate, sign, watermark, page
numbers, bookmarks, compress, grayscale, repair, compare, protect, unlock, metadata, images in
and out, ZIP, embedded images, text — every one of them running on the phone. No account, no
queue, no upload; the original is never modified and every tool writes a new file. The design
and the engine are documented in [docs/PDF-ARENA.md](docs/PDF-ARENA.md).

**The mark:** a hexagon in two interlocking pieces, teal and brass. Colours, files, and how
to regenerate them from the source artwork are in [docs/BRAND.md](docs/BRAND.md).

**Privacy policy and terms:** built into the app (Settings → Legal) and readable at
[docs/legal](docs/legal). Accounts, sessions, and the owner flag are audited in
[docs/SECURITY.md](docs/SECURITY.md).

**Updating:** the app checks for a new build the moment it opens, says what changed, and installs it
in one tap — no browser and no hunting for a file. The first update ever asks once for Android's
"allow installs from this source", because the platform requires it; after that it is a single tap
on Update. How the feed, the download and the installer work is in [docs/UPDATES.md](docs/UPDATES.md).

**Install it on an Android phone:** [download `shaikhs.apk`](https://github.com/WaquarShaikh5555/Mee6/releases/download/apk/shaikhs.apk),
open it, allow installing from this source, then open Regain and allow it in
Settings → Accessibility. Built by GitHub Actions on every push
([how it works](docs/REGAIN.md)).

```bash
cd apps/mobile
npm install
npx expo start
```

Real authentication is wired up and tested (205 tests). Set the two `EXPO_PUBLIC_SUPABASE_*`
values from [apps/mobile/.env.example](apps/mobile/.env.example) in `apps/mobile/.env`;
without them the app falls back to an on-device demo service so screens stay usable.

Status of the backend, what is configured, and its limits:
[docs/SUPABASE.md](docs/SUPABASE.md).

Design direction, token values, and architecture decisions are in the app README and in
[docs/adr](docs/adr). `apps/api` and `infra/` hold a self-hosted alternative that the app no
longer uses — kept for reference.
