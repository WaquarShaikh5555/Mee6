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

import { AD_APP_ID, REWARDED_UNIT_ID, UNLOCK_HOURS, USING_TEST_ADS } from '@/ads/config';
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

/* ------------------------------------------------------------- fake SDK --- */

type Listener = (...args: unknown[]) => void;

/** A rewarded ad that plays a script: which events fire, and in what order. */
function fakeAds(script: 'earned' | 'closed' | 'error') {
  const listeners: Record<string, Listener> = {};

  const ad = {
    addAdEventListener: (event: string, listener: Listener) => {
      listeners[event] = listener;
      return () => {};
    },
    load: () => {
      if (script === 'error') {
        setTimeout(() => listeners['error']?.(), 0);
        return;
      }
      setTimeout(() => listeners['rewarded_loaded']?.(), 0);
    },
    show: async () => {
      if (script === 'earned') listeners['rewarded_earned_reward']?.();
      listeners['closed']?.();
    },
  };

  return {
    default: () => ({
      setRequestConfiguration: async () => {},
      initialize: async () => [],
    }),
    RewardedAd: { createForAdRequest: () => ad },
    RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned_reward' },
    AdEventType: { CLOSED: 'closed', ERROR: 'error', LOADED: 'loaded' },
  } as never;
}

beforeEach(() => {
  mockStore.clear();
  __setAdsForTests(null);
});

/* ------------------------------------------------------------------ tests --- */

describe('the identifiers cannot drift apart', () => {
  it('pins the app id in config.ts to the one the manifest is built with', () => {
    // A mismatch crashes at launch with "Invalid application ID", before a
    // single line of app code runs — there is no screen to show an error on.
    const appJson = JSON.parse(
      readFileSync(join(__dirname, '..', 'app.json'), 'utf8'),
    ) as { expo: { plugins: unknown[] } };

    const plugin = appJson.expo.plugins.find(
      (entry): entry is [string, { androidAppId: string }] =>
        Array.isArray(entry) && entry[0] === 'react-native-google-mobile-ads',
    );

    expect(plugin?.[1]?.androidAppId).toBe(AD_APP_ID);
  });

  it('carries the live units, not the samples', () => {
    // Well-formed, and actually earning. The sample ids serve test ads, which
    // pay nothing — a build that ships with them looks fine and earns zero.
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
    return expect(showRewarded()).resolves.toBe('unavailable');
  });

  it('earns the reward when the ad is watched through', async () => {
    __setAdsForTests(fakeAds('earned'));
    await expect(showRewarded()).resolves.toBe('earned');
  });

  it('does not reward an ad closed early', async () => {
    __setAdsForTests(fakeAds('closed'));
    await expect(showRewarded()).resolves.toBe('closed');
  });

  it('reports a failure instead of hanging when there is no fill', async () => {
    __setAdsForTests(fakeAds('error'));
    await expect(showRewarded()).resolves.toBe('failed');
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
    __setAdsForTests(fakeAds('error'));

    await wrap(<UnlockCard toolName="Protect" onClose={() => {}} onUnlocked={onUnlocked} />);

    await act(async () => {
      await fireEvent.press(screen.getByText('Watch an ad — 48 hours free'));
    });

    expect(onUnlocked).toHaveBeenCalled();
    const window = await currentEntitlement();
    expect(window?.reason).toBe('grace');
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

describe('the platform shim', () => {
  const read = (file: string) =>
    readFileSync(join(__dirname, '..', 'src', 'ads', file), 'utf8');

  // The ad package imports a native-only React Native module. Importing it on
  // the web is not a warning — it fails the whole export, and with it every
  // preview and the web build. Only the .web shim may be resolved there, and
  // the shim must never reach for the package.
  it('keeps the native package out of the web build', () => {
    expect(read('sdk.web.ts')).not.toMatch(/require\(\s*['"]react-native-google-mobile-ads/);
    expect(read('sdk.web.ts')).not.toMatch(/from\s+['"]react-native-google-mobile-ads/);
  });

  it('is the only place the native package is loaded', () => {
    const importers = ['rewarded.ts', 'useUnlock.ts', 'UnlockCard.tsx', 'config.ts', 'pro.ts']
      .map((file) => [file, read(file)] as const)
      .filter(([, text]) => /require\(\s*['"]react-native-google-mobile-ads/.test(text))
      .map(([file]) => file);

    expect(importers).toEqual([]);
  });

  it('gives the web no ads and therefore no gate', () => {
    const web = require('@/ads/sdk.web') as { loadAds: () => unknown };
    expect(web.loadAds()).toBeNull();
  });
});

describe('the pause', () => {
  // The ads SDK is installed but deliberately not linked into Android. It was
  // the only new native code between the last build that launched and the
  // first one that did not, so it leaves the build until the cause is found.
  //
  // This test is the guard on that decision: re-linking it fails here, which
  // forces the person doing it to read this and delete the test on purpose.
  it('keeps the ads SDK out of the Android build', () => {
    const config = require('../react-native.config.js') as {
      dependencies: Record<string, { platforms?: { android?: null; ios?: null } }>;
    };

    const entry = config.dependencies['react-native-google-mobile-ads'];
    expect(entry).toBeTruthy();
    expect(entry.platforms?.android).toBeNull();
    expect(entry.platforms?.ios).toBeNull();
  });

  it('still resolves in Metro, so the require stays caught rather than fatal', () => {
    // Uninstalling would make Metro fail to resolve the require at bundle
    // time. Being installed and merely unlinked keeps `sdk.ts` a try/catch.
    expect(() => require.resolve('react-native-google-mobile-ads')).not.toThrow();
  });
});
