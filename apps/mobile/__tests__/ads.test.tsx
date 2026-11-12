/**
 * Ads: where they are, what they unlock, and what happens when they fail.
 *
 * The point of most of these tests is not that an ad shows. It is that the app
 * never becomes unusable because one does not — that is the failure mode that
 * makes people uninstall.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ReactNode } from 'react';

import { ADS_PAUSED, AD_APP_ID, REWARDED_UNIT_ID, UNLOCK_HOURS, USING_TEST_ADS } from '@/ads/config';
import {
  currentEntitlement,
  describeTimeLeft,
  forgetUnlock,
  grantUnlock,
  liveWindow,
  windowFrom,
} from '@/ads/entitlement';
import { FREE_TOOL_IDS, MUST_STAY_FREE, PRO_TOOL_IDS, isProTool, proToolCount } from '@/ads/pro';
import { UnlockCard } from '@/ads/UnlockCard';
import { __setAdsForTests, adsAvailable, showRewarded } from '@/ads/rewarded';

/* ------------------------------------------------------------------ mocks --- */

// Prefixed `mock` so Jest's factory guard allows it inside `jest.mock`.
const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ toolId: 'protect' }),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn() }));

import { ThemeProvider } from '@/theme/ThemeProvider';

function wrap(node: ReactNode) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

/* --------------------------------------------------------- fake module --- */

/**
 * The native module's whole surface is one function, so the fake is one
 * function. `unavailable` is what the module itself answers when there is no
 * activity to draw on; `rejects` models a bridge-level failure.
 */
function fakeAds(outcome: 'earned' | 'closed' | 'failed' | 'unavailable' | 'rejects') {
  return {
    show: jest.fn(async () => {
      if (outcome === 'rejects') throw new Error('bridge went away');
      // The real module answers with a map; anything else must not be trusted.
      return { outcome };
    }),
  } as never;
}

beforeEach(() => {
  mockStore.clear();
  __setAdsForTests(null);
});

/* ------------------------------------------------------------------ tests --- */

describe('the identifiers cannot drift apart', () => {
  it('pins the app id in config.ts to the one the SDK reads from the manifest', () => {
    // A mismatch crashes at launch with "Invalid application ID", before a
    // single line of app code runs — there is no screen to show an error on.
    // The meta-data used to come from the ad package's config plugin; that
    // package is gone, so our own module's manifest carries it.
    const manifest = readFileSync(
      join(__dirname, '..', 'modules', 'rewarded', 'android', 'src', 'main', 'AndroidManifest.xml'),
      'utf8',
    );
    const match = manifest.match(
      /com\.google\.android\.gms\.ads\.APPLICATION_ID"[\s\S]*?android:value="([^"]+)"/,
    );

    expect(match?.[1]).toBe(AD_APP_ID);
  });

  it('carries the live units, not the samples', () => {
    expect(AD_APP_ID).toMatch(/^ca-app-pub-\d{16}~\d{10}$/);
    expect(REWARDED_UNIT_ID).toMatch(/^ca-app-pub-\d{16}\/\d{10}$/);
    expect(AD_APP_ID).not.toBe('ca-app-pub-3940256099942544~3347511713');
    expect(REWARDED_UNIT_ID).not.toBe('ca-app-pub-3940256099942544/5224354917');
    expect(USING_TEST_ADS).toBe(false);
  });
});

describe('the 48-hour window', () => {
  it('opens for exactly two days', () => {
    const now = 1_700_000_000_000;
    const window = windowFrom(now);

    expect(window.until - window.grantedAt).toBe(UNLOCK_HOURS * 60 * 60 * 1000);
    expect(UNLOCK_HOURS).toBe(48);
  });

  it('is closed the moment it expires, and refuses a doctored record', () => {
    const now = 1_700_000_000_000;
    const window = windowFrom(now);

    expect(liveWindow(window, now + 1)).not.toBeNull();
    expect(liveWindow(window, window.until + 1)).toBeNull();
    expect(liveWindow(null, now)).toBeNull();
    // A window longer than what was granted means the record was edited.
    expect(liveWindow({ ...window, until: now + 999 * 60 * 60 * 1000 }, now)).toBeNull();
    expect(liveWindow({ ...window, hours: 24 }, now)).toBeNull();
  });

  it('says how long is left in words', () => {
    const now = 1_700_000_000_000;

    expect(describeTimeLeft(now + 30 * 60_000, now)).toBe('30 minutes left');
    expect(describeTimeLeft(now + 60 * 60_000, now)).toBe('1 hour left');
    expect(describeTimeLeft(now + 2 * 60 * 60_000, now)).toBe('2 hours left');
    expect(describeTimeLeft(now - 1, now)).toBe('Expired');
  });

  it('extends rather than resets when a second ad is watched', async () => {
    const now = Date.now();

    const first = await grantUnlock('reward', now);
    const second = await grantUnlock('reward', now + 60_000);

    expect(second.until).toBe(first.until + UNLOCK_HOURS * 60 * 60 * 1000);
    expect((await currentEntitlement(now + 60_000))?.until).toBe(second.until);
  });

  it('remembers nothing when the store is unavailable', async () => {
    const SecureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
      setItemAsync: jest.Mock;
    };

    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('no keystore'));
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error('no keystore'));

    await expect(currentEntitlement()).resolves.toBeNull();
    await expect(grantUnlock()).resolves.toMatchObject({ reason: 'reward' });
  });

  it('forgets on request', async () => {
    await grantUnlock();
    expect(await currentEntitlement()).not.toBeNull();

    await forgetUnlock();
    expect(await currentEntitlement()).toBeNull();
  });
});

describe('the free / Pro split', () => {
  it('keeps every "finish the document" tool free', () => {
    for (const id of MUST_STAY_FREE) {
      expect({ id, pro: isProTool(id) }).toEqual({ id, pro: false });
    }
  });

  it('charges for the occasional work, and says how much there is', () => {
    expect(proToolCount()).toBe(11);
    expect(isProTool('protect')).toBe(true);
    expect(isProTool('compare')).toBe(true);
    expect(isProTool('sign')).toBe(false);
    expect(isProTool('merge')).toBe(false);
  });

  it('covers all twenty-one tools exactly once, free or Pro', () => {
    const seen = new Set<string>([...FREE_TOOL_IDS, ...PRO_TOOL_IDS]);

    expect(seen.size).toBe(21);
    expect(FREE_TOOL_IDS.length + PRO_TOOL_IDS.size).toBe(21);
  });
});

describe('the ad itself', () => {
  it('reports having no SDK rather than throwing', () => {
    expect(adsAvailable()).toBe(false);
    return expect(showRewarded()).resolves.toEqual({ result: 'unavailable', reason: null });
  });

  it('earns the reward when the ad is watched through', async () => {
    __setAdsForTests(fakeAds('earned'));
    await expect(showRewarded()).resolves.toEqual({ result: 'earned', reason: null });
  });

  it('does not reward an ad closed early', async () => {
    __setAdsForTests(fakeAds('closed'));
    await expect(showRewarded()).resolves.toEqual({ result: 'closed', reason: null });
  });

  it('reports a failure instead of hanging when there is no fill', async () => {
    __setAdsForTests(fakeAds('failed'));
    await expect(showRewarded()).resolves.toEqual({ result: 'failed', reason: null });
  });
});

describe('the card', () => {
  beforeEach(() => {
    // A build that *has* the SDK: the only one where a gate could earn.
    __setAdsForTests(fakeAds('earned'));
  });

  it('explains the trade before asking for anything', async () => {
    await wrap(<UnlockCard toolName="Protect" onClose={() => {}} />);

    expect(screen.getByText('One ad, 48 hours')).toBeTruthy();
    expect(screen.getByText(/merge, split, delete, rearrange, rotate, sign/)).toBeTruthy();
    expect(screen.getByText('Watch an ad — 48 hours free')).toBeTruthy();
    // A live build does not advertise that it is showing a test ad.
    expect(screen.queryByText(/Test ad/)).toBeNull();
  });

  it('lets someone leave without watching anything', async () => {
    const onClose = jest.fn();
    await wrap(<UnlockCard toolName="Protect" onClose={onClose} />);

    await fireEvent.press(screen.getByText('Not now'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('unlocks when the ad is watched', async () => {
    const onUnlocked = jest.fn();
    __setAdsForTests(fakeAds('earned'));

    await wrap(<UnlockCard toolName="Protect" onClose={() => {}} onUnlocked={onUnlocked} />);

    await act(async () => {
      await fireEvent.press(screen.getByText('Watch an ad — 48 hours free'));
    });

    expect(onUnlocked).toHaveBeenCalled();
    expect(await currentEntitlement()).not.toBeNull();
  });

  it('unlocks anyway when no ad can be shown, and says so', async () => {
    // The most important behaviour in the whole feature: the wall opens.
    const onUnlocked = jest.fn();
    __setAdsForTests(fakeAds('failed'));

    await wrap(<UnlockCard toolName="Protect" onClose={() => {}} onUnlocked={onUnlocked} />);

    await act(async () => {
      await fireEvent.press(screen.getByText('Watch an ad — 48 hours free'));
    });

    // The window opens regardless — that behaviour is unchanged.
    const window = await currentEntitlement();
    expect(window?.reason).toBe('grace');

    // But the card does not vanish. A tap that produces no ad and no visible
    // change read as a broken button, so the card stays and explains itself.
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(screen.getByText('Unlocked')).toBeTruthy();
    expect(screen.getByText(/Unlocked anyway, for 48 hours/)).toBeTruthy();
  });

  it('changes nothing when the ad is closed early', async () => {
    const onUnlocked = jest.fn();
    __setAdsForTests(fakeAds('closed'));

    await wrap(<UnlockCard toolName="Protect" onClose={() => {}} onUnlocked={onUnlocked} />);

    await act(async () => {
      await fireEvent.press(screen.getByText('Watch an ad — 48 hours free'));
    });

    expect(onUnlocked).not.toHaveBeenCalled();
    expect(await currentEntitlement()).toBeNull();
    expect(screen.getByText(/Closed before the end/)).toBeTruthy();
  });
});

describe('in the app', () => {
  it('asks before the file, on a Pro tool', async () => {
    __setAdsForTests(fakeAds('earned'));

    const PdfToolScreen = require('@/app/(app)/pdf/[toolId]').default as () => ReactNode;
    await wrap(<PdfToolScreen />);

    expect(screen.getByText('One ad, 48 hours')).toBeTruthy();
    // No file picker while the gate is up.
    expect(screen.queryByText('Choose a PDF from this phone')).toBeNull();
  });

  it('opens the tool straight away when there is no ad SDK', async () => {
    // Web preview, Expo Go, or a build where linking failed: no gate at all,
    // because there is nothing to watch and nothing to charge for.
    __setAdsForTests(null);

    const PdfToolScreen = require('@/app/(app)/pdf/[toolId]').default as () => ReactNode;
    await wrap(<PdfToolScreen />);

    expect(screen.queryByText('One ad, 48 hours')).toBeNull();
    expect(screen.getByText('Choose a PDF from this phone')).toBeTruthy();
  });
});

describe('the native module', () => {
  const moduleFile = (name: string) =>
    readFileSync(join(__dirname, '..', 'modules', 'rewarded', name), 'utf8');

  it('wraps Google\'s SDK directly, with no React Native package in between', () => {
    // The crash that cost three builds: importing react-native-google-mobile-ads
    // registers a native view, and an unlinked native view takes the process
    // down. This is an Expo module — registered once by the Expo runtime, not at
    // import time — so it cannot repeat that.
    const gradle = moduleFile('android/build.gradle');

    expect(gradle).toMatch(/com\.google\.android\.gms:play-services-ads:/);
    expect(gradle).not.toMatch(/react-native-google-mobile-ads/);
  });

  it('is looked up at runtime, so a build without it simply has no ads', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'ads', 'rewarded.ts'), 'utf8');

    expect(source).toMatch(/requireOptionalNativeModule\?\.\('RewardedAds'\)/);
    // No static import of anything native, ever.
    expect(source).not.toMatch(/^import .*(google-mobile-ads|react-native)/m);
  });

  it('exposes one function that answers with one of four words', () => {
    const module = moduleFile('android/src/main/java/expo/modules/rewarded/RewardedModule.kt');

    expect(module).toMatch(/Name\("RewardedAds"\)/);
    expect(module.match(/AsyncFunction\(/g)?.length).toBe(1);
    for (const outcome of ['"earned"', '"closed"', '"failed"', '"unavailable"']) {
      expect(module).toContain(outcome);
    }
  });
});

describe('the brake', () => {
  it('is off, so ads run', () => {
    expect(ADS_PAUSED).toBe(false);
  });

  it('short-circuits before the module is asked', () => {
    // The point of a brake is that nothing happens. Checked before the call,
    // not around it.
    const source = readFileSync(join(__dirname, '..', 'src', 'ads', 'rewarded.ts'), 'utf8');
    const brake = source.indexOf('if (ADS_PAUSED) return');
    const call = source.indexOf('await ads.show(REWARDED_UNIT_ID)');

    expect(brake).toBeGreaterThan(-1);
    expect(brake).toBeLessThan(call);
  });
});

describe('what actually ships', () => {
  const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8');

  // Four builds died learning this. The ad SDK cannot be in the native build
  // until we know why it kills the process, and the way that is guaranteed is
  // exclusion at autolinking — plus this test, so re-enabling it cannot be an
  // accident of editing one line.
  it('keeps the ad SDK out of the app\'s startup', () => {
    const manifest = read('modules/rewarded/android/src/main/AndroidManifest.xml');

    // The SDK's own provider runs before the first screen. Removed, so the SDK
    // is only ever initialised by us, on a tap, inside a try/catch.
    expect(manifest).toMatch(/MobileAdsInitProvider/);
    expect(manifest).toMatch(/tools:node="remove"/);
  });

  it('keeps the SDK\'s classes safe from R8', () => {
    const rules = read('modules/rewarded/android/consumer-rules.pro');

    // A release build without these strips classes the SDK reaches
    // reflectively — the crash lands on a phone, never in a test.
    expect(rules).toMatch(/-keep class com\.google\.android\.gms\.ads/);
    expect(rules).toMatch(/-keep class com\.google\.android\.gms\.internal\.ads/);
  });

  it('ships a crash handler that runs before every other provider', () => {
    const manifest = read('modules/diagnostics/android/src/main/AndroidManifest.xml');

    // Highest initOrder wins, and it is what puts a recorder in place before
    // an SDK's own startup provider can throw.
    expect(manifest).toMatch(/CrashLogProvider/);
    expect(manifest).toMatch(/initOrder="2147483647"/);
    expect(manifest).toMatch(/exported="false"/);
  });

  it('writes the crash somewhere a phone can send from', () => {
    const source = read(
      'modules/diagnostics/android/src/main/java/expo/modules/diagnostics/CrashLogProvider.kt',
    );

    // Downloads is the only folder the person can reach without a PC.
    expect(source).toMatch(/MediaStore\.Downloads/);
    expect(source).toMatch(/shaikhs-crash-/);
    // And the original handler still runs, so it stays a crash.
    expect(source).toMatch(/previous\?\.uncaughtException/);
  });
});
