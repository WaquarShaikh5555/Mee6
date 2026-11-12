# Shaikh's

An Android app for two jobs: **stop the endless scroll**, and **do real work on PDFs on the phone**.

Built with Expo, React Native and TypeScript. Accounts and profiles live in Supabase.

[**Download the app →**](https://github.com/WaquarShaikh5555/Mee6/releases/download/apk/shaikhs-arm64.apk) · 46 MB · Android 8+ · [install help](docs/INSTALL.md)

---

## Focus Mode

One switch closes the parts of Instagram, YouTube and TikTok that are built to be endless —
Reels, Shorts, Spotlight — while leaving messages, DMs and anything a friend sent you open.
It never asks you to quit an app. Blocked screens say one thing: *Make yourself better.*

Rules and counts stay on the phone. Nothing is uploaded.

## PDF Arena

Twenty-one tools that run entirely on your phone: merge, split, delete, rearrange, rotate,
sign, watermark, page numbers, bookmarks, compress, grayscale, repair, compare, protect,
unlock, metadata, images in and out, ZIP, embedded images, and text extraction.

No account, no queue, no upload. The original is never modified — every tool writes a new file.
Everything in **Edit**, **Optimise**, **Secure** and **Convert** is free except eleven occasional
tools, which need one short ad to open for 48 hours. No banners anywhere, and none in Focus Mode.

## Your account, from your phone

Settings → Owner → **People**. See every account, who has Pro, who is paused, and when each
person last opened the app. Grant or remove Pro, pause or restore an account, and make someone
else an owner — without touching code or a dashboard. Every change is recorded and shown on the
same screen, and the database refuses anything that would lock you out of your own app.

## Inside this repository

| | |
| --- | --- |
| [`apps/mobile`](apps/mobile) | The app |
| [`supabase/migrations`](supabase/migrations) | The database schema, as applied |
| [`docs`](docs) | Focus Mode, PDF Arena, updates, security, brand |
| [`skills`](skills) | A mobile-engineering skill library, used while building the app |

## Run it

```bash
cd apps/mobile
npm install
npx expo start
```

`npm run verify` runs the type check and the 335-test suite. Building an APK is done by GitHub
Actions on every push to `main` and attaches it to the `apk` release — see
[docs/UPDATES.md](docs/UPDATES.md).

## More

- [Focus Mode](docs/FOCUS.md) · [PDF Arena](docs/PDF-ARENA.md) · [Updates](docs/UPDATES.md)
- [Security](docs/SECURITY.md) · [Backend](docs/SUPABASE.md) · [Brand](docs/BRAND.md)
- [Privacy policy and terms](docs/legal)
- Working on the code, or an AI agent? Start at [docs/ENGINEERING.md](docs/ENGINEERING.md).
