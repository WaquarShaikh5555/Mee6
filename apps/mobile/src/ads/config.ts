/**
 * AdMob identifiers — the only place they live.
 *
 * Two values matter and they must agree with `app.json`, or the app crashes on
 * launch with "Invalid application ID". `__tests__/ads.test.tsx` checks that
 * they do, because that failure happens before a single line of this app runs
 * and there is no way to show an error for it.
 *
 * The values below are Google's **official test units**. They serve real test
 * ads to any device and pay nothing — which is exactly right until the real
 * ones are dropped in. Swapping them is two lines here plus one in `app.json`.
 *
 * Real IDs look like:
 *   app id      ca-app-pub-1234567890123456~1234567890
 *   rewarded    ca-app-pub-1234567890123456/0987654321
 *
 * They are not secrets: every copy of the app carries them.
 */

/** Google's sample app id. Replace with the real one from AdMob → App settings. */
export const AD_APP_ID = 'ca-app-pub-3940256099942544~3347511713';

/** Google's sample rewarded unit. Replace with AdMob → Ad units → Rewarded. */
export const REWARDED_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';

/**
 * True while the sample units are in use.
 *
 * The prompt says "test ad" in that case, so nobody is ever misled about what
 * they are looking at, and a build that ships without real IDs is obvious
 * rather than a mystery about missing revenue.
 */
export const USING_TEST_ADS =
  AD_APP_ID === 'ca-app-pub-3940256099942544~3347511713' ||
  REWARDED_UNIT_ID === 'ca-app-pub-3940256099942544/5224354917';

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
