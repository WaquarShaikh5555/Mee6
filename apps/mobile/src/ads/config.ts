/**
 * AdMob identifiers — the only place they live.
 *
 * Two values matter and they must agree with `app.json`, or the app crashes on
 * launch with "Invalid application ID". `__tests__/ads.test.tsx` checks that
 * they do, because that failure happens before a single line of this app runs
 * and there is no way to show an error for it.
 *
 * These are the live units from the Shaikh's account. They are not secrets:
 * every copy of the app carries them, and anyone can read them out of the APK.
 *
 * If the app is ever moved to a different AdMob app (or a fresh account for a
 * Play Store listing), replace both of these and `androidAppId` in `app.json`
 * in the same commit. Leaving the Google sample ids here would serve test ads
 * and earn exactly nothing; `USING_TEST_ADS` below makes that state loud on the
 * unlock card instead of silently mysterious.
 */

/** AdMob → Apps → Shaikh's → App settings. */
export const AD_APP_ID: string = 'ca-app-pub-8602760833611299~1068854218';

/** AdMob → Ad units → the rewarded unit. Only rewarded format, by design. */
export const REWARDED_UNIT_ID: string = 'ca-app-pub-8602760833611299/7902302989';

/** Google's sample units, kept only to recognise them. */
const SAMPLE_APP_ID: string = 'ca-app-pub-3940256099942544~3347511713';
const SAMPLE_REWARDED_UNIT_ID: string = 'ca-app-pub-3940256099942544/5224354917';

/**
 * True only while the sample units are in use.
 *
 * The prompt says "test ad" in that case, so nobody is ever misled about what
 * they are looking at, and a build that ships with samples is obvious rather
 * than a mystery about missing revenue.
 */
export const USING_TEST_ADS =
  AD_APP_ID === SAMPLE_APP_ID || REWARDED_UNIT_ID === SAMPLE_REWARDED_UNIT_ID;

/**
 * Ads are paused in this build.
 *
 * 0.10.0 and 0.11.0 closed themselves on launch. 0.11.1 took the SDK out of the
 * native build and the app opened — but tapping PDF Arena still killed it,
 * because that screen is the first thing that *imports* the ad package, and the
 * package's JavaScript registers a native view on load. With the native side
 * unlinked, that registration is not a catchable error on a device: the process
 * goes down with it.
 *
 * So the require is skipped outright. Nothing in the bundle ever touches
 * `react-native-google-mobile-ads` while this is true, `adsAvailable()` answers
 * false, and the whole app behaves as it does in the web preview: no gate, no
 * card, every tool open.
 *
 * Turning ads back on is this one word plus a rebuild — and it needs the crash
 * understood first, not merely re-tried.
 */
export const ADS_PAUSED = true;

/** How long one ad buys. The single number that decides generosity. */
export const UNLOCK_HOURS = 48;

/**
 * Ad requests are non-personalised, always.
 *
 * Personalised ads need a consent flow (Google's UMP SDK) in the EEA and UK and
 * a disclosure everywhere else. Non-personalised ads need neither: no consent
 * dialogue to get wrong, no advertising identifier to explain, and no
 * "why is it asking about my data" on a phone that just wants to merge two
 * PDFs. It pays less per impression. It is the honest trade.
 */
export const NON_PERSONALISED_ONLY = true;
