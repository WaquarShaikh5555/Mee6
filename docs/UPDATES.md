# Updates

Shaikh's updates itself from inside itself. No browser, no "find the file in Downloads", no
choreography between apps: tap Update, watch the percentage, tap the one confirmation Android
insists on.

## The pieces

| Piece | Where | What it does |
| --- | --- | --- |
| The feed | `version.json` beside the APK | A tiny JSON file: `{version, url, size, notes, builtAt}`. Written by the build from `apps/mobile/app.json` and `apps/mobile/update-notes.json`, uploaded to the `apk` release. |
| The check | `src/update/useUpdate.ts` | One fetch of the feed, 1.2 s after the app is usable, 8 s timeout. Offline or a missing feed is "no update", never an error on screen. |
| The prompt | `src/update/UpdateSheet.tsx` | Shows what changed and the size. Update stays disabled for five seconds; Later is live from the first frame. |
| The download | `modules/updater` (Kotlin) | `HttpURLConnection` into the cache, `onProgress` events four times a second, partial file deleted on failure. |
| The install | Same module | `FileProvider` + `ACTION_VIEW` with the APK mime type. Android shows its own confirmation; nothing can skip that. |

## Why a file next to the APK, not the GitHub API

The GitHub REST API is rate limited per IP and per token, and 63 MB assets are not meant to be
streamed through it. A plain file on the release is one request that either answers or does not,
needs no token, and costs nothing.

## Version codes

Android refuses an install whose `versionCode` is not higher than the installed one, so the build
stamps it from the version: `major * 10000 + minor * 100 + patch` — `0.9.0` is `900`, `0.10.1` is
`1001`. Bumping the version in `app.json` is therefore the only step needed to ship an update, and
forgetting it fails loudly (Android says "app not installed") rather than silently.

## Three packages, one version

The build writes one APK per CPU type and a universal one, because a 60 MB
download over a mobile connection is where installs actually fail:

| File | For |
| --- | --- |
| `shaikhs-arm64.apk` | 64-bit phones — the usual case, about half the size |
| `shaikhs-32bit.apk` | older 32-bit phones |
| `shaikhs.apk` | anything; also the file the in-app updater downloads |

Native libraries are stored compressed, so the download is about 40% smaller
than the installed size; Android unpacks them on install. The universal package
is therefore near 63 MB and the 64-bit one near 35 MB.

The release notes carry the exact byte count and SHA-256 of each one, and the
feed carries the same for `shaikhs.apk` plus an entry per CPU type and per
edition (`arm64-v8a`, `arm64-v8a-lite`, …), so:

- A download that was cut short is caught before Android has to refuse it.
- An in-app update downloads the package built for that phone's CPU — around
  half the bytes of the universal one — and falls back to the universal package
  if the feed has no entry for it.
- A **lite** install only ever takes a lite package. The app asks Focus Mode which
  edition it is (`not-in-this-build` means lite) and, if the feed has no lite
  package for that CPU, offers no update at all rather than quietly installing
  the edition with Focus Mode in it.

## When Android says the package appears to be invalid

That message means the phone was handed something it could not read as a
package, and in practice it is a download that never finished — a 60 MB file
over a phone connection, often through an in-app browser that saves an error
page under the `.apk` name.

In order, the things that actually fix it:

1. **Download in a real browser.** Open the release page in Chrome, tap the
   file, and wait for the download notification. Links tapped inside another
   app often do not survive the redirect to the file host.
2. **Take the small file.** `shaikhs-arm64.apk` is roughly 30 MB, so it has half
   as many chances to be cut short. If the phone is 32-bit, the installer says
   the app is not compatible — use `shaikhs-32bit.apk`.
3. **Compare the size.** The release notes print the exact byte count. A file
   that is a few MB short of it was truncated, however finished it looks.
4. Signing is never the cause of *invalid*: the key is the same on every build
   (the workflow prints its fingerprint on each run), and a key mismatch would
   read as a conflict with an existing package instead.

The build now refuses to publish a package that does not unzip cleanly, whose
`versionCode` is missing or stale, or whose signature will not verify — so the
file offered on the release page is always one that passed those checks.

## The one permission

A sideloaded app may not launch the installer until **Android Settings → Apps → Shaikh's → Install
unknown apps** is switched on. That is a platform rule and cannot be automated away or pre-granted
by the app itself. So:

- The permission is checked *before* the download finishes, so an update never wastes 63 MB and
  then stops dead.
- The card explains the exact switch in one line and offers a button that opens that screen
  directly.
- Coming back from Settings resumes the flow: the APK is already downloaded, so it goes straight to
  the installer without downloading again.
- Once allowed, every later update is a single tap on Update.

## Order of events after tapping Update

1. Download with a real percentage (not a spinner of unknown length).
2. If the permission is missing: "One setting first" → open the setting → come back.
3. Android's installer opens with Shaikh's APK, and the screen says to tap Update there.
4. The system replaces the app in place; documents, account and settings are untouched, because
   the APK is signed with the same key as the installed one.

Failure at any point says what happened, says plainly that nothing on the phone changed, and offers
Try again.

## Signing

Release builds use the standard React Native debug keystore, which is identical on every CI run —
that is what makes in-place updates possible. It is also a public key, so these builds are for
sideloading only, never the Play Store. A store build would need its own keystore and the Play
Store's own update mechanism instead of this one.
