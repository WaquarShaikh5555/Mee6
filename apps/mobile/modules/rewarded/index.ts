/**
 * TypeScript face of the rewarded-ad native module (Android only).
 *
 * The app never imports this file: `src/ads/rewarded.ts` resolves the module at
 * runtime with `requireOptionalNativeModule('RewardedAds')`, so the same bundle
 * still runs in the web preview and in any build where it is absent.
 */

import { requireNativeModule } from 'expo-modules-core';

export type RewardOutcome = 'earned' | 'closed' | 'failed' | 'unavailable';

export type RewardedNativeModule = {
  show: (unitId: string) => Promise<{ outcome: RewardOutcome } | null>;
};

export default requireNativeModule('RewardedAds') as RewardedNativeModule;
