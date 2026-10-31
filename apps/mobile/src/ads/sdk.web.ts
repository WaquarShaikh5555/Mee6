/**
 * The web build has no ad SDK, and that is the answer.
 *
 * Google Mobile Ads is a native Android/iOS library; there is no browser build.
 * The web preview exists to show the interface, so it reports "no ads" and the
 * tools open freely — a gate with nothing behind it would be worse than none.
 */

import type { AdsModule } from './sdk.types';

let override: AdsModule | null | undefined;

export function __setAdsForTests(module: AdsModule | null | undefined): void {
  override = module;
}

export function loadAds(): AdsModule | null {
  return override ?? null;
}
