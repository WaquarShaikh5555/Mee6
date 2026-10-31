/**
 * Where the ad SDK is actually loaded — native only.
 *
 * This file is replaced by `sdk.web.ts` in a web build (Metro resolves `.web`
 * first there), because `react-native-google-mobile-ads` imports
 * `codegenNativeComponent`, which does not exist on the web and fails the
 * bundle outright. Splitting the load keeps `rewarded.ts` platform-agnostic.
 *
 * Everything is still optional: a build where linking failed must report "no
 * ads", not crash on launch.
 */

import type { AdsModule } from './sdk.types';

let override: AdsModule | null | undefined;

/** Test seam: a fake SDK, or `null` to pretend there is none. */
export function __setAdsForTests(module: AdsModule | null | undefined): void {
  override = module;
}

export function loadAds(): AdsModule | null {
  if (override !== undefined) return override;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-google-mobile-ads') as AdsModule;
  } catch {
    // The TurboModule is not registered in this build.
    return null;
  }
}
