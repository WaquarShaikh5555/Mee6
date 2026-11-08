# Focus Mode

**Status: shipped as an Android app.** The rules, the screens, and the interception are all
built. An installable APK is produced by GitHub Actions on every push:

```
https://github.com/WaquarShaikh5555/Mee6/releases/download/apk/shaikhs.apk
```

Install it on the phone, open Focus Mode, switch it on, and allow it in
**Settings → Accessibility**. From then on the closed sections are covered by
*Make yourself better.* while messages keep working.

The one thing that has not happened yet is calibration on a real phone. The detector
recognises surfaces by their view ids (see §3), and those names are the sort of thing that
changes with app releases. It is built to fail safe: if a screen is not recognised,
**nothing is blocked** — never the other way round.

---

## 1. The idea

Most apps are two products stapled together: a useful one (messages, the people who choose
to talk to you) and a compulsive one (an infinite feed engineered to never end). Focus Mode keeps
the first and closes the second.

The rules are per **section**, not per app:

| App | Closed when Focus Mode is on | Always available |
| --- | --- | --- |
| Instagram | Reels feed, Explore | Direct messages, reels a friend sends you |
| YouTube | Shorts | Long videos, search, subscriptions |
| Snapchat | Camera, Spotlight | Chat |
| TikTok | For You | Messages |
| Discord | Servers, discovery | Direct messages |
| X | For You timeline, Explore | Messages |

A reel someone sends you still opens and plays. What disappears is the scroll *underneath*
it — the slot machine that turns one shared video into forty minutes. Same for YouTube: the
Shorts shelf and the Shorts player go; the video you searched for stays.

Where a surface is blocked, the person sees one screen:

> **Make yourself better.**

with what was blocked, how many times today, and one button. On Instagram and X that button
reads **Go to DMs** and opens the app's messages — where someone leaving Reels actually wants
to be, instead of the screen they were stuck on. Everywhere else it is **Leave**, which
presses Back for them.

The two-second hold still applies, but to switching Focus Mode off in the app itself rather than
to a tap on the overlay: the shield is a wall, the settings are where the decision lives.

---

## 2. What exists in the app today

Everything below is real, typed, and covered by tests (`__tests__/focus.test.tsx`, 29 cases).

| Piece | Where | State |
| --- | --- | --- |
| Dashboard entry point with live status | `app/(app)/index.tsx` | Done |
| Focus Mode home: master switch, per-app counts, how-it-works | `app/(app)/focus/index.tsx` | Done |
| Per-app screen: section switches, "always available" list | `app/(app)/focus/[appId].tsx` | Done |
| The block screen with hold-to-disable | `app/(app)/focus/blocked.tsx`, `focus/ShieldMessage.tsx` | Done |
| Rules catalog (6 apps, 25 sections) | `focus/catalog.ts` | Done |
| Persistence, repair of corrupt state, daily counts | `focus/store.ts`, `focus/FocusProvider.tsx` | Done |
| Native enforcement (Android) | `modules/focus/` | Built — accessibility service + shield |
| Owner tools | `app/(app)/developer.tsx` | Built — diagnostics, last sighting |
| Privacy policy and terms | `src/legal/documents.ts` | Built — in-app and in the repo |
| APK build | `.github/workflows/android.yml` | Green; publishes to the `apk` release |

Rules survive restarts, a corrupt record is repaired rather than fatal, and turning every
section off is remembered as a real choice (not silently reverted to the defaults).

**Try it now:** open the app → the Focus Mode card on the dashboard → *See the block screen*.
The block screen is the exact component the native overlay will render later.

### Why the enforcement module is an interface, not an implementation

Shaikh's currently runs in Expo Go, which cannot contain custom native code. Reading another
app's screen requires a system service that only exists in a development build. Pretending
otherwise — shipping switches that do nothing and calling it done — would be the wrong kind
of progress.

So `enforcement.ts` defines the contract (`getStatus`, `openSettings`, `detectInstalled`,
`sync`), reports honestly whether a native module is present, and the UI changes its copy
accordingly. In the preview it says so plainly instead of implying it is blocking anything.

---

## 3. What real interception requires

### Android — section-level blocking is possible

Android exposes an **AccessibilityService**, which can read the current window's view tree and
draw an overlay on top of another app. That is enough to notice "the Reels player is on
screen" and cover it, while leaving the DM thread untouched.

- **Permission:** the person enables the service in Settings once. It cannot be granted
  silently.
- **Fragility:** detection relies on Instagram's view hierarchy, which changes between
  releases and is obfuscated. A detection strategy needs to be built from several weak
  signals (view ids, content descriptions, layout shape) and tolerate being wrong in both
  directions.
- **Play Store:** permitted for a wide range of apps, but only disability tools may declare
  `isAccessibilityTool=true`; everything else must provide prominent in-app disclosure,
  consent, and a Play Console declaration with a demo video. Automation that *acts* for the
  user is prohibited — Focus Mode only reads the screen and shows its own overlay, which is the
  defensible side of that line. Google's policy:
  [Use of the AccessibilityService API](https://support.google.com/googleplay/android-developer/answer/10964491).
- **Advanced Protection Mode (Android 17+):** when a user enables it, only apps flagged as
  accessibility tools may use the API. A digital-wellbeing app will not qualify, so Focus Mode
  must degrade to whole-app blocking in that mode rather than break.

### iOS — section-level blocking is not possible

Apple's Screen Time APIs (`FamilyControls`, `DeviceActivity`, `ManagedSettings`) can shield
**whole apps**, categories, or web domains. They cannot shield a tab inside an app, and the
tokens they hand out are deliberately opaque — an app cannot even learn which app a token
represents.

So on iPhone the honest options are:

1. **Shield the whole app** at times you choose (e.g. Instagram closed between 21:00 and
   07:00). This is what Focus Mode will do on iOS.
2. Blur/cover the app with a custom shield screen — the same *Make yourself better.* visual.

"We leave your DMs open" is achievable on Android and **not achievable on iOS**. That is an
operating-system limit, not a shortcut.

Two further gates: the **Family Controls (Distribution) entitlement** must be requested from
Apple, separately for every bundle id that links the framework (app + shield configuration +
shield action + device activity monitor), and approval takes days to weeks
([Apple's guide](https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement)).

### What this means for shipping

| Target | Section-level block | Whole-app block | Effort to get there |
| --- | --- | --- | --- |
| Android | Yes | Yes | Development build, Kotlin service, Play Console declaration |
| iOS | **No** | Yes | Development build, Swift extensions, Apple entitlement approval |
| Expo Go / web | No | No | — (this is where the app runs today) |

---

## 4. Where the Android build stands

Done:

1. ✅ A local Expo module with an accessibility service, autolinked by `expo prebuild`.
2. ✅ Rules mirrored from the app into native storage on every change, so enforcement
   survives the app being closed.
3. ✅ A shield drawn over the blocked surface, with the same copy as the in-app preview.
4. ✅ A signed APK built and published by CI on every push, with a stable download URL.

Two reported failures, and what caused them:

- **"It works the moment I open the app, then it stops caring."** The service
  re-armed its timer on every accessibility event. A playing feed emits an event
  every few milliseconds, so the check was cancelled and postponed forever and
  never ran. It is a leading-edge throttle now: one check is scheduled, later
  events fall through, and nothing can starve it.
- **Nothing matched at all.** An earlier version vetoed a match when a "feed"
  marker was on screen and demanded the matched view cover 60% of the display.
  Both were guesses; both vetoed the screens they were meant to catch. The
  matching is back to view ids alone, and the tree is walked once per check.

Notes from the first real device:

- A reel inside Instagram's home feed matched the Reels player, so leaving Reels and
  landing on home showed the shield again. Sections marked `fullScreen` now have to cover
  most of the display, and a short list of feed markers vetoes the match.
- "Leave" put people back on the screen they came from. It now opens the app's own DMs
  where that exists, which is where someone leaving Reels actually wants to be.

Still to do, in order:

1. **Calibrate on a real phone.** Open Instagram, watch which view ids are present, and
   adjust `Surfaces.TOKENS`. This is expected work, not a defect — the tables are the one
   part that cannot be written from a desk.
2. **iOS.** Not started. It needs a Mac, an Apple Developer account, and the Family Controls
   entitlement approval described above; the app already reports `app-only` granularity
   there, so the UI is ready.
3. **A Play Store release**, if wanted: it needs an upload key, a data-safety declaration,
   and the accessibility-service declaration with a demo video.

---

## 5. Privacy and tone

- Rules and counts live **on the device only** — in the same Keychain/Keystore adapter the
  session uses. No analytics, no upload, no account linkage.
- Focus Mode never reads message content, never records what you looked at, and never reports to
  anyone. The counter is for the person using it.
- The block screen says what happened and hands the choice back. It does not shame, streak,
  or gamify — those mechanics are the problem Focus Mode exists to solve.
- The app carries a line pointing to real help, because "social media addiction" is not a
  setting and an app should not pretend to be treatment.

---

## 6. Files

```
src/focus/
  catalog.ts          Six apps, their sections, and which ones are always available
  store.ts            Pure rules: defaults, toggling, persistence, daily counts
  FocusProvider.tsx  State + storage, with a guard against a load/interaction race
  enforcement.ts      The native contract and honest capability reporting
  ShieldMessage.tsx   The "Make yourself better." screen
src/app/(app)/
  index.tsx           Dashboard entry point
  focus/index.tsx    Master switch, apps, how it works
  focus/[appId].tsx  Per-section switches
  focus/blocked.tsx  What a blocked surface looks like
modules/focus/      Android: the accessibility service, the shield, the JS bridge
__tests__/
  focus.test.tsx     29 tests: rules, repair, counting, every screen, hold-to-disable
.github/workflows/
  android.yml         Type-check, test, prebuild, assemble, publish the APK
```
