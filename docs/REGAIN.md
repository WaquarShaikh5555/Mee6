# Regain

**Status: the feature is built and working in the app. The interception — actually stopping
Instagram before it shows a Reel — is the one part that cannot exist until Shaikh's is
installed as a real app on a phone rather than run in Expo Go.**

That distinction matters, so this document is explicit about which is which.

---

## 1. The idea

Most apps are two products stapled together: a useful one (messages, the people who choose
to talk to you) and a compulsive one (an infinite feed engineered to never end). Regain keeps
the first and closes the second.

The rules are per **section**, not per app:

| App | Closed when Regain is on | Always available |
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

with what was blocked, how many times today, and a button that requires a two-second hold to
switch Regain off. Friction, not a lock — the point is that turning it off becomes a
decision instead of a reflex.

---

## 2. What exists in the app today

Everything below is real, typed, and covered by tests (`__tests__/regain.test.tsx`, 29 cases).

| Piece | Where | State |
| --- | --- | --- |
| Dashboard entry point with live status | `app/(app)/index.tsx` | Done |
| Regain home: master switch, per-app counts, how-it-works | `app/(app)/regain/index.tsx` | Done |
| Per-app screen: section switches, "always available" list | `app/(app)/regain/[appId].tsx` | Done |
| The block screen with hold-to-disable | `app/(app)/regain/blocked.tsx`, `regain/ShieldMessage.tsx` | Done |
| Rules catalog (6 apps, 25 sections) | `regain/catalog.ts` | Done |
| Persistence, repair of corrupt state, daily counts | `regain/store.ts`, `regain/RegainProvider.tsx` | Done |
| Native enforcement contract | `regain/enforcement.ts` | Interface only |

Rules survive restarts, a corrupt record is repaired rather than fatal, and turning every
section off is remembered as a real choice (not silently reverted to the defaults).

**Try it now:** open the app → the Regain card on the dashboard → *See the block screen*.
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
  user is prohibited — Regain only reads the screen and shows its own overlay, which is the
  defensible side of that line. Google's policy:
  [Use of the AccessibilityService API](https://support.google.com/googleplay/android-developer/answer/10964491).
- **Advanced Protection Mode (Android 17+):** when a user enables it, only apps flagged as
  accessibility tools may use the API. A digital-wellbeing app will not qualify, so Regain
  must degrade to whole-app blocking in that mode rather than break.

### iOS — section-level blocking is not possible

Apple's Screen Time APIs (`FamilyControls`, `DeviceActivity`, `ManagedSettings`) can shield
**whole apps**, categories, or web domains. They cannot shield a tab inside an app, and the
tokens they hand out are deliberately opaque — an app cannot even learn which app a token
represents.

So on iPhone the honest options are:

1. **Shield the whole app** at times you choose (e.g. Instagram closed between 21:00 and
   07:00). This is what Regain will do on iOS.
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

## 4. The path to a build that actually blocks

1. **Create a development build** (`npx expo run:android` locally, or an EAS profile). Expo
   Go is out of scope for this feature, permanently.
2. **Android module** — an Expo module wrapping an `AccessibilityService`:
   - publishes the current foreground package and a `surface` classification
   - reads `regain_rules` from shared preferences, kept in sync by `syncRules()`
   - draws a full-screen overlay when a blocked surface appears, using the same copy as
     `ShieldMessage`
   - requests `SYSTEM_ALERT_WINDOW` only if drawn as a system overlay rather than an
     accessibility overlay
3. **iOS module** — `FamilyControls` + `ManagedSettings` + a Shield Configuration extension,
   with `AuthorizationCenter.requestAuthorization(.individual)` and a `FamilyActivityPicker`
   for choosing apps. Rules map to whole-app shields, and the UI already knows to say so
   (`granularity: 'app-only'`).
4. **Wire `enforcement.ts`** to the real module — the interface does not change.
5. **Test on a physical device.** Accessibility and Screen Time behave differently in
   emulators and simulators; neither can be trusted for this feature.

Nothing in the app's screens has to change for any of that: the rules, the copy, and the
block screen are already built against the interface.

---

## 5. Privacy and tone

- Rules and counts live **on the device only** — in the same Keychain/Keystore adapter the
  session uses. No analytics, no upload, no account linkage.
- Regain never reads message content, never records what you looked at, and never reports to
  anyone. The counter is for the person using it.
- The block screen says what happened and hands the choice back. It does not shame, streak,
  or gamify — those mechanics are the problem Regain exists to solve.
- The app carries a line pointing to real help, because "social media addiction" is not a
  setting and an app should not pretend to be treatment.

---

## 6. Files

```
src/regain/
  catalog.ts          Six apps, their sections, and which ones are always available
  store.ts            Pure rules: defaults, toggling, persistence, daily counts
  RegainProvider.tsx  State + storage, with a guard against a load/interaction race
  enforcement.ts      The native contract and honest capability reporting
  ShieldMessage.tsx   The "Make yourself better." screen
src/app/(app)/
  index.tsx           Dashboard entry point
  regain/index.tsx    Master switch, apps, how it works
  regain/[appId].tsx  Per-section switches
  regain/blocked.tsx  What a blocked surface looks like
__tests__/
  regain.test.tsx     29 tests: rules, repair, counting, every screen, hold-to-disable
```
