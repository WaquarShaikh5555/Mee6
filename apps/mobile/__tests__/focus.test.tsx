/**
 * Focus Mode — rules, screens, and the block screen.
 *
 * The pure rule functions get the most attention: they decide what is closed,
 * and a wrong default there would quietly block something a person needs.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockStorage = new Map<string, string>();

jest.mock('@/lib/storage', () => ({
  storage: {
    get: async (key: string) => mockStorage.get(key) ?? null,
    set: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    remove: async (key: string) => {
      mockStorage.delete(key);
    },
  },
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockParams: Record<string, string> = {};

jest.mock('expo-router', () => {
  const Stack = Object.assign(
    ({ children }: { children?: ReactNode }) => <>{children}</>,
    { Screen: () => null },
  );

  return {
    Stack,
    Redirect: () => null,
    Link: ({ children }: { children: ReactNode }) => <>{children}</>,
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => mockParams,
  };
});

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined) }));

import { FocusProvider } from '@/focus/FocusProvider';
import { findApp, FOCUS_APPS } from '@/focus/catalog';
import {
  blockedSectionsFor,
  createDefaultState,
  dayKey,
  defaultRules,
  interventionsToday,
  isSectionBlocked,
  parseState,
  recentInterventions,
  recordIntervention,
  FOCUS_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  serializeState,
  setEnabled,
  shouldBlock,
  toggleSection,
  totalBlockedSections,
} from '@/focus/store';
import { ThemeProvider } from '@/theme/ThemeProvider';

import FocusAppScreen from '@/app/(app)/focus/[appId]';
import BlockedScreen from '@/app/(app)/focus/blocked';
import FocusScreen from '@/app/(app)/focus/index';

const instagram = findApp('instagram')!;
const youtube = findApp('youtube')!;

async function wrap(node: ReactNode) {
  return render(
    <ThemeProvider>
      <FocusProvider>{node}</FocusProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.clear();
  delete mockParams.appId;
  delete mockParams.sectionId;
});

/* ------------------------------------------------------------------ rules --- */

describe('default rules', () => {
  it('blocks the infinite surfaces and leaves conversation alone', () => {
    const rules = defaultRules();

    expect(rules.instagram).toEqual(expect.arrayContaining(['reels', 'explore']));
    expect(rules.instagram).not.toContain('direct');
    expect(rules.instagram).not.toContain('shared-reels');

    expect(rules.youtube).toEqual(['shorts']);
    expect(rules.youtube).not.toContain('videos');

    expect(rules.snapchat).toEqual(expect.arrayContaining(['camera', 'spotlight']));
    expect(rules.tiktok).toEqual(['for-you']);
    expect(rules.discord).toEqual(expect.arrayContaining(['servers']));
  });

  it('never blocks a section that is not switchable', () => {
    for (const app of FOCUS_APPS) {
      for (const sectionId of defaultRules()[app.id] ?? []) {
        const section = app.sections.find((candidate) => candidate.id === sectionId);
        expect(section?.blockable).toBe(true);
      }
    }
  });

  it('starts switched off', () => {
    expect(createDefaultState().enabled).toBe(false);
  });
});

describe('toggling', () => {
  it('removes a section and puts it back', () => {
    let state = createDefaultState();

    expect(isSectionBlocked(state, instagram, 'reels')).toBe(true);

    state = toggleSection(state, instagram, 'reels');
    expect(isSectionBlocked(state, instagram, 'reels')).toBe(false);

    state = toggleSection(state, instagram, 'reels');
    expect(isSectionBlocked(state, instagram, 'reels')).toBe(true);
  });

  it('drops the app entirely once nothing is blocked', () => {
    let state = createDefaultState();
    state = toggleSection(state, instagram, 'reels');
    state = toggleSection(state, instagram, 'explore');

    expect(state.rules.instagram).toBeUndefined();
  });

  it('refuses to switch an always-available section', () => {
    const state = createDefaultState();
    const next = toggleSection(state, instagram, 'direct');

    expect(next).toBe(state);
    expect(isSectionBlocked(next, instagram, 'direct')).toBe(false);
  });

  it('ignores unknown sections instead of throwing', () => {
    const state = createDefaultState();
    expect(toggleSection(state, instagram, 'not-a-section')).toBe(state);
  });

  it('counts only what is blocked', () => {
    const state = createDefaultState();
    expect(blockedSectionsFor(state, youtube)).toEqual(['shorts']);
    expect(totalBlockedSections(state)).toBeGreaterThan(0);
  });
});

describe('shouldBlock', () => {
  it('requires the master switch', () => {
    const state = createDefaultState();
    expect(shouldBlock(state, instagram, 'reels')).toBe(false);
    expect(shouldBlock(setEnabled(state, true), instagram, 'reels')).toBe(true);
  });

  it('still permits the always-available surfaces while switched on', () => {
    const state = setEnabled(createDefaultState(), true);
    expect(shouldBlock(state, instagram, 'direct')).toBe(false);
    expect(shouldBlock(state, instagram, 'shared-reels')).toBe(false);
  });
});

describe('persistence', () => {
  it('round-trips', () => {
    const state = setEnabled(toggleSection(createDefaultState(), youtube, 'home'), true);
    expect(parseState(serializeState(state))).toEqual(state);
  });

  it('falls back to defaults on garbage', () => {
    expect(parseState('not json').enabled).toBe(false);
    expect(parseState('[]').rules).toEqual(defaultRules());
    expect(parseState(null).rules).toEqual(defaultRules());
  });

  it('repairs a partially broken record rather than discarding it', () => {
    const parsed = parseState(
      JSON.stringify({
        enabled: 'yes',
        rules: { instagram: ['reels', 42], youtube: 'shorts' },
        interventions: { [dayKey()]: 3 },
      }),
    );

    expect(parsed.enabled).toBe(false);
    // Both entries were unusable, so nothing is blocked: a corrupt rule must
    // never block something by accident.
    expect(parsed.rules).toEqual({});
    expect(interventionsToday(parsed)).toBe(3);
  });

  it('remembers "nothing blocked" instead of restoring the defaults', () => {
    const cleared = { ...createDefaultState(), rules: {} };

    expect(parseState(serializeState(cleared)).rules).toEqual({});
  });
});

describe('counting', () => {
  it('counts per calendar day, not in total', () => {
    const today = new Date('2026-10-21T09:00:00');
    const tomorrow = new Date('2026-10-22T09:00:00');

    let state = recordIntervention(createDefaultState(), today);
    state = recordIntervention(state, today);
    state = recordIntervention(state, tomorrow);

    expect(interventionsToday(state, today)).toBe(2);
    expect(interventionsToday(state, tomorrow)).toBe(1);
  });

  it('returns a zero-filled window for history', () => {
    const now = new Date('2026-10-21T12:00:00');
    const state = recordIntervention(createDefaultState(), now);
    const window = recentInterventions(state, 3, now);

    expect(window).toHaveLength(3);
    expect(window[2]).toEqual({ day: '2026-10-21', count: 1 });
    expect(window[1]?.count).toBe(0);
  });
});

/* ----------------------------------------------------------------- screens --- */

describe('Focus Mode screen', () => {
  it('opens switched off and lists every app', async () => {
    await wrap(<FocusScreen />);

    expect(await screen.findByText('Focus Mode is off')).toBeTruthy();
    expect(screen.getByLabelText(/Instagram, 2 of 4 blocked/)).toBeTruthy();
    expect(screen.getByLabelText(/YouTube, 1 of 2 blocked/)).toBeTruthy();
    expect(screen.getByText(/Messages never get blocked/)).toBeTruthy();
  });

  it('switches on and reports the blocked count', async () => {
    await wrap(<FocusScreen />);
    const toggle = await screen.findByLabelText('Focus Mode active');

    await act(async () => {
      fireEvent(toggle, 'valueChange', true);
    });

    expect(await screen.findByText('Focus Mode is on')).toBeTruthy();
    expect(screen.getByText(/sections across 6 apps/)).toBeTruthy();
  });

  it('opens the per-app screen', async () => {
    await wrap(<FocusScreen />);
    fireEvent.press(await screen.findByLabelText(/Instagram/));
    expect(mockPush).toHaveBeenCalledWith('/focus/instagram');
  });

  it('offers the preview of the block screen in this build', async () => {
    await wrap(<FocusScreen />);
    fireEvent.press(await screen.findByText('See the block screen'));
    expect(mockPush).toHaveBeenCalledWith('/focus/blocked?appId=instagram&sectionId=reels');
  });
});

describe('per-app screen', () => {
  it('shows blockable sections with switches and protects the rest', async () => {
    mockParams.appId = 'instagram';
    await wrap(<FocusAppScreen />);

    expect(await screen.findByText('Reels feed')).toBeTruthy();
    expect(screen.getByText('Always available')).toBeTruthy();
    expect(screen.getByText('Direct messages')).toBeTruthy();
    expect(screen.getByText('Reels sent to you')).toBeTruthy();

    // Three switchable sections in Instagram, none of them "Direct messages".
    expect(screen.queryByLabelText('Block Direct messages')).toBeNull();
  });

  it('toggling a section updates the summary', async () => {
    mockParams.appId = 'instagram';
    await wrap(<FocusAppScreen />);

    const toggle = await screen.findByLabelText('Block Reels feed');
    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });

    expect(await screen.findByText(/1 of 4 blocked/)).toBeTruthy();
  });

  it('explains an unknown app instead of crashing', async () => {
    mockParams.appId = 'myspace';
    await wrap(<FocusAppScreen />);

    expect(await screen.findByText('App not found')).toBeTruthy();
  });

  it('confirms the rules are saved even while Focus Mode is off', async () => {
    mockParams.appId = 'youtube';
    await wrap(<FocusAppScreen />);

    expect(await screen.findByText(/Focus Mode is off. These rules apply/)).toBeTruthy();
  });
});

describe('block screen', () => {
  it('says the line and names what is blocked', async () => {
    mockParams.appId = 'instagram';
    mockParams.sectionId = 'reels';
    await wrap(<BlockedScreen />);

    expect(await screen.findByText('Make yourself better.')).toBeTruthy();
    expect(screen.getByText(/Reels feed on Instagram is off/)).toBeTruthy();
  });

  it('counts the encounter', async () => {
    mockParams.appId = 'instagram';
    mockParams.sectionId = 'reels';
    await wrap(<BlockedScreen />);

    await screen.findByText('Make yourself better.');
    expect(await screen.findByText(/first time today/)).toBeTruthy();
  });

  it('closes without changing anything', async () => {
    mockParams.appId = 'youtube';
    mockParams.sectionId = 'shorts';
    await wrap(<BlockedScreen />);

    fireEvent.press(await screen.findByText('Close'));
    expect(mockBack).toHaveBeenCalled();
  });

});

describe('provider wiring', () => {
  it('restores a saved state before rendering rules', async () => {
    mockStorage.set(
      FOCUS_STORAGE_KEY,
      serializeState(setEnabled(createDefaultState(), true)),
    );

    await wrap(<FocusScreen />);
    expect(await screen.findByText('Focus Mode is on')).toBeTruthy();
  });

  it('persists the master switch', async () => {
    await wrap(<FocusScreen />);
    const toggle = await screen.findByLabelText('Focus Mode active');

    await act(async () => {
      fireEvent(toggle, 'valueChange', true);
    });

    const stored = parseState(mockStorage.get(FOCUS_STORAGE_KEY));
    expect(stored.enabled).toBe(true);
  });

  // The rename must not cost anyone their settings. A phone that had already
  // chosen what to close keeps those choices, and the record moves to the new
  // key on the first launch after the update.
  it('brings rules across from the old name once', async () => {
    mockStorage.set(
      LEGACY_STORAGE_KEY,
      serializeState(setEnabled(createDefaultState(), true)),
    );

    await wrap(<FocusScreen />);

    expect(await screen.findByText('Focus Mode is on')).toBeTruthy();
    expect(mockStorage.has(FOCUS_STORAGE_KEY)).toBe(true);
  });

  it('prefers the current record when both exist', async () => {
    mockStorage.set(
      LEGACY_STORAGE_KEY,
      serializeState(setEnabled(createDefaultState(), true)),
    );
    mockStorage.set(FOCUS_STORAGE_KEY, serializeState(createDefaultState()));

    await wrap(<FocusScreen />);

    expect(await screen.findByText('Focus Mode is off')).toBeTruthy();
  });
});
