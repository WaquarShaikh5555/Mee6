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
 * **Where it comes from:** our own Expo module (`modules/rewarded`), which calls
 * Google's Mobile Ads SDK directly. The React Native wrapper package used to sit
 * here and it closed the app on launch — importing it registers a native view,
 * and that registration is not something a `try`/`catch` can survive. This file
 * has no such import: the module is looked up at runtime, and a build without it
 * simply has no ads.
 */

import { ADS_PAUSED, REWARDED_UNIT_ID } from './config';

export type WatchResult =
  /** The person watched it through and the reward was granted. */
  | 'earned'
  /** Shown, closed early: no reward, and no penalty either. */
  | 'closed'
  /** Nothing to show — no fill, no connection, or an SDK error. */
  | 'failed'
  /** No ad support in this build at all (web, Expo Go, or a build without it). */
  | 'unavailable';

type NativeRewarded = {
  show: (unitId: string) => Promise<{ outcome?: string } | null>;
};

let override: NativeRewarded | null | undefined;

/** Test seam: a fake module, or `null` to pretend there is none. */
export function __setAdsForTests(module: NativeRewarded | null | undefined): void {
  override = module;
  available = null;
}

/**
 * The native module, if this build has one.
 *
 * Looked up through `expo-modules-core` at call time rather than imported, so
 * the web preview and Expo Go take the same path they always did: no module,
 * no ads, every tool free.
 */
function nativeModule(): NativeRewarded | null {
  if (override !== undefined) return override;

  try {
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (name: string) => unknown;
    };
    const module = core.requireOptionalNativeModule?.('RewardedAds');
    return (module as NativeRewarded | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether this build can show an ad at all.
 *
 * Cached: a build either has the module or it does not, and the answer is asked
 * for on every render of every tile in the Arena — twenty-one of them per pass.
 * Repeated native-module lookups there are pure cost for an answer that cannot
 * change while the app is running.
 */
let available: boolean | null = null;

/** False in the browser, in Expo Go, and in any build without the module. */
export function adsAvailable(): boolean {
  if (available === null) available = nativeModule() !== null;
  return available;
}

const OUTCOMES: WatchResult[] = ['earned', 'closed', 'failed', 'unavailable'];

/**
 * Shows one rewarded ad and reports what happened.
 *
 * The outcomes matter to the caller:
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
  if (ADS_PAUSED) return 'unavailable';

  const ads = nativeModule();
  if (!ads) return 'unavailable';

  try {
    const result = await ads.show(REWARDED_UNIT_ID);
    const outcome = result?.outcome;
    return OUTCOMES.includes(outcome as WatchResult) ? (outcome as WatchResult) : 'failed';
  } catch {
    return 'failed';
  }
}
