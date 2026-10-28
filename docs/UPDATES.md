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
