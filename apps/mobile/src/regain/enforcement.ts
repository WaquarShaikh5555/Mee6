/**
 * The boundary between Regain's interface and the operating system.
 *
 * Everything in this app can be built, tested, and previewed without touching
 * native code. Actually intercepting Instagram before it renders Reels cannot:
 * it needs an Android Accessibility Service or Apple's Screen Time framework,
 * which only exist in a development build (see `docs/REGAIN.md`).
 *
 * So this file defines the contract the native module must satisfy, and reports
 * honestly whether it is present. The UI reads `status.available` and adjusts
 * its copy rather than pretending.
 */

import { Platform } from 'react-native';

export type EnforcementAvailability =
  /** A native build with the Regain module is installed and allowed. */
  | 'ready'
  /** Running in Expo Go, the web preview, or a build without the module. */
  | 'unavailable'
  /** The module is there, but the person has not granted the system permission. */
  | 'blocked-by-permission';

export type EnforcementStatus = {
  availability: EnforcementAvailability;
  platform: 'android' | 'ios' | 'web' | 'other';
  /** One sentence for the settings screen, already human-readable. */
  explanation: string;
  /** Sections detectable on this platform, or `all` when the OS can filter. */
  granularity: 'surface' | 'app-only' | 'none';
};

/**
 * Shape the native module must expose. Documented here because it is the thing
 * a future build has to implement; nothing in the JS bundle calls it yet, so
 * importing it would throw rather than silently doing nothing.
 */
/** What the phone last recognised, for tuning the detector on a real device. */
export type Sighting = {
  /** e.g. "instagram · reels · clips_viewer", or "nothing matched · …". */
  summary: string;
  /** Unix milliseconds, 0 when nothing has been seen yet. */
  at: number;
  /** Encounters on the phone today, counted natively. */
  today: number;
  /** The last exception the service caught, if any. Empty when healthy. */
  error?: string;
};

export type RegainNativeModule = {
  getStatus(): Promise<EnforcementStatus>;
  getSighting(): Promise<Sighting>;
  /** Opens the OS settings page where the service or permission is granted. */
  openSettings(): Promise<void>;
  /** Android package names, or iOS URL schemes, that are installed. */
  detectInstalled(): Promise<string[]>;
  /** Hands the current rules to the native side and turns enforcement on/off. */
  sync(rules: { appId: string; sections: string[] }[], enabled: boolean): Promise<void>;
};

function nativeModule(): RegainNativeModule | null {
  // Resolved lazily so a missing module is a status, not a crash at import time.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-modules-core').requireOptionalNativeModule?.('Regain');
    return (mod as RegainNativeModule | null) ?? null;
  } catch {
    return null;
  }
}

export function platformName(): EnforcementStatus['platform'] {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'web') return 'web';
  return 'other';
}

/**
 * What the OS can actually enforce here.
 *
 * Android exposes an accessibility tree, so a specific surface (the Reels
 * player) can be recognised. iOS exposes only opaque app tokens through Screen
 * Time, so it can shield whole apps and nothing finer.
 */
export function granularityFor(platform: EnforcementStatus['platform']): EnforcementStatus['granularity'] {
  if (platform === 'android') return 'surface';
  if (platform === 'ios') return 'app-only';
  return 'none';
}

const EXPLANATIONS: Record<EnforcementAvailability, string> = {
  ready: 'Regain watches for the blocked screens and steps in before they load.',
  unavailable:
    'Preview build: the screens and rules are real, but blocking starts once the native build is installed on your phone.',
  'blocked-by-permission':
    'Regain needs permission in your phone settings before it can step in.',
};

export async function getEnforcementStatus(): Promise<EnforcementStatus> {
  const platform = platformName();
  const granularity = granularityFor(platform);
  const mod = nativeModule();

  if (!mod) {
    return {
      availability: 'unavailable',
      platform,
      explanation: EXPLANATIONS.unavailable,
      granularity,
    };
  }

  try {
    return await mod.getStatus();
  } catch {
    return { availability: 'unavailable', platform, explanation: EXPLANATIONS.unavailable, granularity };
  }
}

export function explanationFor(status: EnforcementStatus): string {
  return status.explanation || EXPLANATIONS[status.availability];
}

/** No-ops until a native module exists; kept so callers never branch on it. */
export async function openEnforcementSettings(): Promise<void> {
  await nativeModule()?.openSettings().catch(() => undefined);
}

/**
 * The phone's own count and last sighting. Returns null in the preview, where
 * there is no service watching anything.
 */
export async function getLastSighting(): Promise<Sighting | null> {
  const mod = nativeModule();
  if (!mod) return null;

  try {
    return await mod.getSighting();
  } catch {
    return null;
  }
}

export async function syncRules(
  rules: { appId: string; sections: string[] }[],
  enabled: boolean,
): Promise<void> {
  await nativeModule()?.sync(rules, enabled).catch(() => undefined);
}
