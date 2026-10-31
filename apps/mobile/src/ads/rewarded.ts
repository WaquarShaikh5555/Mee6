/**
 * One rewarded ad, and nothing else.
 *
 * Deliberately the only ad format in the app. No banners (they would sit on the
 * tool screen and be tapped by accident while someone drags a page), no
 * interstitials (they interrupt, and an interruption after "Sign the document"
 * is how an app earns one star), no app-open ads (they would fire before the
 * update prompt, on every launch, forever).
 *
 * A rewarded ad is the one format that asks first and pays for consent with
 * something the person actually wanted.
 *
 * The native module is loaded **optionally**. In the web preview and in Expo Go
 * there is no Google Mobile Ads, and the app must keep working — so a missing
 * module is a state ("no ads here"), not a crash.
 */

import { NON_PERSONALISED_ONLY, REWARDED_UNIT_ID } from './config';
import { __setAdsForTests as setAdsModule, loadAds } from './sdk';
import type { AdsModule } from './sdk.types';

export type WatchResult =
  /** The person watched it through and the reward was granted. */
  | 'earned'
  /** Shown, closed early: no reward, and no penalty either. */
  | 'closed'
  /** Nothing to show — no fill, no connection, or an SDK error. */
  | 'failed'
  /** No ad SDK in this build at all (web, Expo Go, or a build without it). */
  | 'unavailable';

// The SDK lives behind a platform shim: native loads the real package, web
// never touches it (its bundle would drag in a native-only module and fail).
// Re-exported here so callers and tests still reach it through `rewarded`.

/** Test seam: a fake SDK, or `null` to pretend there is none. */
export function __setAdsForTests(module: AdsModule | null | undefined): void {
  setAdsModule(module);
  initialised = null;
}

/** False in the browser, in Expo Go, and in any build without the SDK. */
export function adsAvailable(): boolean {
  return loadAds() !== null;
}

let initialised: Promise<void> | null = null;

/**
 * Initialises the SDK once per launch.
 *
 * `maxAdContentRating` is G: this app is used for contracts and schoolwork and
 * has no business serving anything else. Request configuration is set before
 * the first ad request, which is the only time it is read.
 */
async function ensureReady(ads: AdsModule): Promise<void> {
  if (initialised) return initialised;

  initialised = (async () => {
    const mobileAds = ads.default;
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: 'G' as never,
      // Nothing here is directed at children, and pretending otherwise would
      // serve worse ads for no benefit.
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();
  })().catch((error: unknown) => {
    initialised = null;
    throw error;
  });

  return initialised;
}

const LOAD_TIMEOUT_MS = 15_000;

/**
 * Shows one rewarded ad and reports what happened.
 *
 * The three outcomes matter to the caller:
 *  - `earned`   → grant the window.
 *  - `closed`   → say nothing unkind; the person chose not to finish.
 *  - `failed` /
 *    `unavailable` → still grant it. This is the important one. An ad that
 *    cannot be shown must never become a wall in front of someone's document.
 *    The app gives the 48 hours away and says why, rather than leaving a
 *    "watch to unlock" button that does nothing — which is the single most
 *    frustrating thing a rewarded-ad app can do.
 */
export async function showRewarded(): Promise<WatchResult> {
  const ads = loadAds();
  if (!ads) return 'unavailable';

  try {
    await ensureReady(ads);
  } catch {
    return 'failed';
  }

  return new Promise<WatchResult>((resolve) => {
    let settled = false;
    let earned = false;
    const teardown: (() => void)[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: WatchResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      for (const remove of teardown) {
        try {
          remove();
        } catch {
          // An already-removed listener is not a problem.
        }
      }
      resolve(result);
    };

    try {
      const ad = ads.RewardedAd.createForAdRequest(REWARDED_UNIT_ID, {
        requestNonPersonalizedAdsOnly: NON_PERSONALISED_ONLY,
      });

      teardown.push(
        ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          // `show` rejects if the screen went away mid-flow; treat that as a
          // failed show rather than an unhandled rejection.
          ad.show().catch(() => finish(earned ? 'earned' : 'failed'));
        }),
        ad.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
        }),
        ad.addAdEventListener(ads.AdEventType.CLOSED, () => {
          finish(earned ? 'earned' : 'closed');
        }),
        ad.addAdEventListener(ads.AdEventType.ERROR, () => {
          finish(earned ? 'earned' : 'failed');
        }),
      );

      timer = setTimeout(() => finish(earned ? 'earned' : 'failed'), LOAD_TIMEOUT_MS);
      ad.load();
    } catch {
      finish('failed');
    }
  });
}
