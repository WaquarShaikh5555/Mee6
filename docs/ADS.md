# Ads

One format, one place, one promise: **watch a short ad, every Pro tool opens for
48 hours.** No banners, no interstitials, no app-open ads, nothing in the middle
of a task.

## What is free, what is Pro

| Always free | Pro (one ad → 48 hours) |
| --- | --- |
| Viewing, printing | Protect (password lock) |
| Merge, split, delete, rearrange | Unlock |
| Rotate, sign | Compare |
| Compress | Repair |
| Text out (`pdf2text`) | Watermark |
| Images out / images to PDF | Page numbers |
| | Bookmarks |
| | Metadata |
| | Grayscale |
| | To ZIP |
| | Extract images |

The split follows one test: **can this tool finish a document?** If yes, it is
free. Merging, splitting, turning and signing are the verbs of actually getting
something done, and putting a toll booth in front of them is how an app gets one
star. The Pro set is the occasional work — locking a file, comparing two drafts,
repairing a corrupt scan — the things a person is happy to spend thirty seconds
of attention on twice a month.

`__tests__/ads.test.tsx` enforces this: `MUST_STAY_FREE` in `src/ads/pro.ts` names
the verbs, and the test fails if any of them ever gains a `pro: true`.

## Why there are no ads in Regain

This was a deliberate decision, not an omission.

1. **Policy.** Regain works as an accessibility overlay drawn *over other apps*.
   An ad rendered there is an ad on someone else's screen, next to someone else's
   buttons — the classic recipe for accidental taps, which AdMob counts as
   invalid traffic and can terminate an account for.
2. **Product.** Regain exists to reduce compulsive phone use. Selling attention
   inside the app that helps you use your phone less is not a trade-off; it is
   the opposite of the feature.
3. **Money.** Regain is used for seconds at a time, mostly to flip a switch. It
   would earn a rounding error and cost the one thing the app actually has:
   being trusted.

If Regain ever gets monetised, it should be an optional "support" card on the
Regain *overview* — never the shield, never the blocked screen, never while
another app is on screen.

## Why rewarded only

- **Banners** would sit under a tool screen where people drag pages. Every
  mis-tap is a click AdMob charges for and a user who leaves.
- **Interstitials** interrupt. The worst possible moment in this app is right
  after "Sign the document" — that is the moment the result appears, and an ad
  there would feel like being held to ransom for your own file.
- **Rewarded** asks first and gives something back. It is the only format where
  the person is better off after the ad than before it.

## The three rules the implementation keeps

1. **The ask comes before the work.** A Pro tool shows the card on arrival,
   before a file is picked. Nobody chooses a document, waits for it, and then
   discovers a wall.
2. **No ad is never a wall.** If the ad fails to load — no fill, no connection,
   SDK error, or a build with no ad SDK at all — the 48 hours are granted anyway
   and the card says so. A "watch to unlock" button that does nothing is the
   most frustrating thing a rewarded-ad app can ship.
3. **"Not now" works.** It hides the card and leaves the rest of the app alone,
   including the free tools.

Non-personalised ads only. That means no advertising-ID consent flow, no UMP
dialogue, and nothing about the person collected for targeting. It pays less per
impression and is the right trade for a document tool.

## Swapping the test IDs for real ones

`src/ads/config.ts` holds both values, and `app.json` holds the app ID again (the
Expo config plugin writes it into the Android manifest). They must agree or the
app crashes at launch with *Invalid application ID* — before any of this code
runs — so a test pins them together.

```
AD_APP_ID        ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY     (AdMob → App settings)
REWARDED_UNIT_ID ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ     (AdMob → Ad units → Rewarded)
```

Change both places, commit, and the CI build publishes it. While the sample IDs
are in place the card says "Test ad", so a build can never quietly earn nothing.

## What to expect from revenue

- A rewarded ad pays roughly ₹0.5–₹3 per completed view in India, varying hugely
  by ad inventory. One view every 48 hours per active user is a low ceiling —
  this design chooses trust over impressions, deliberately.
- **Fill rate is the real number to watch.** Sideloaded APKs, outside any app
  store, often see far fewer ads available. The grace-unlock rule means that
  shows up as "unlocked anyway" in the card rather than as an empty wall.
- AdMob's policy expects an app to be distributed through a supported store. The
  **lite** edition (no accessibility service) is the one that can be published to
  Play; that also lifts fill rate and protects the account. The full build can
  stay on the GitHub release.

## The web build has no ads, on purpose

`react-native-google-mobile-ads` is a native library: it imports
`codegenNativeComponent`, which does not exist in a browser. A plain import
therefore fails the whole web export — not just the ad, the entire build.

So the package is loaded in exactly one place, behind a platform shim:

| file | resolved on | what it does |
| --- | --- | --- |
| `src/ads/sdk.ts` | Android / iOS | `require`s the package inside a `try`/`catch` |
| `src/ads/sdk.web.ts` | web | always returns `null` |

`rewarded.ts` only ever calls `loadAds()`. When it gets `null` the app reports
"no ads", the gate disappears, and every tool opens freely. That is the correct
behaviour for a browser preview: a gate with nothing behind it would be a lie.
`__tests__/ads.test.tsx` pins both halves of the shim, so the web bundle cannot
regress into importing the native package again.
