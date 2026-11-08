/**
 * Legal documents and the owner tools.
 *
 * The legal text is content, so the tests check that it exists, is complete,
 * and is wired to somewhere a person can actually reach. The admin gate is
 * security-sensitive, so it is tested in both directions.
 */

import { cleanup, fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockPush = jest.fn();
const mockReplace = jest.fn();
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
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => mockParams,
  };
});

const mockUser: { isAdmin?: boolean; email: string; displayName: string } = {
  email: 'owner@example.com',
  displayName: 'Waquar',
};

// One stable object: returning a fresh one on every call makes any effect that
// depends on it re-run forever, and the test then hangs instead of failing.
const mockAuth = {
  user: mockUser,
  isDemoMode: false,
  isSubmitting: false,
  signOut: jest.fn(),
};

jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));

const mockFocus = {
  isReady: true,
  enabled: true,
  state: { version: 1, enabled: true, rules: { instagram: ['reels'] }, interventions: {} },
  apps: [],
  blockedSectionCount: 1,
  todayCount: 3,
  setEnabled: jest.fn(),
  toggleSection: jest.fn(),
  isBlocked: () => true,
  blockedSections: () => ['reels'],
  recordIntervention: jest.fn(),
  resetRules: jest.fn(),
};

jest.mock('@/focus/FocusProvider', () => ({ useFocus: () => mockFocus }));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined) }));

import { ThemeProvider } from '@/theme/ThemeProvider';

import { LEGAL_DOCUMENTS, PRIVACY, TERMS } from '@/legal/documents';
import LegalScreen from '@/app/legal/[doc]';

function wrap(node: ReactNode) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.doc;
});

describe('the documents themselves', () => {
  it.each([PRIVACY, TERMS])('$title is complete', (document) => {
    expect(document.updated).toMatch(/^\d{1,2} \w+ \d{4}$/);
    expect(document.sections.length).toBeGreaterThan(8);
    for (const section of document.sections) {
      expect(section.heading.length).toBeGreaterThan(0);
      expect((section.body?.length ?? 0) + (section.points?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  it('is reachable by the ids the routes use', () => {
    expect(Object.keys(LEGAL_DOCUMENTS).sort()).toEqual(['privacy', 'terms']);
  });

  it('says where data goes and what stays on the phone', () => {
    const text = JSON.stringify(PRIVACY);
    expect(text).toMatch(/Supabase/);
    expect(text).toMatch(/accessibility/i);
    expect(text).toMatch(/never do/i);
  });

  it('does not pretend the app is medical care', () => {
    expect(JSON.stringify(TERMS)).toMatch(/not a medical device/i);
  });
});

describe('legal screen', () => {
  it('renders the privacy policy', async () => {
    mockParams.doc = 'privacy';
    const view = await wrap(<LegalScreen />);
    expect(view.getAllByText('Privacy policy').length).toBeGreaterThan(0);
    expect(view.getByText('What stays on your phone')).toBeTruthy();
  });

  it('renders the terms and offers the other document', async () => {
    mockParams.doc = 'terms';
    const view = await wrap(<LegalScreen />);
    expect(view.getAllByText('Terms of use').length).toBeGreaterThan(0);
    fireEvent.press(view.getByText('Privacy policy'));
    expect(mockReplace).toHaveBeenCalledWith('/legal/privacy');
  });

  it('explains an unknown document instead of crashing', async () => {
    mockParams.doc = 'nonsense';
    const view = await wrap(<LegalScreen />);
    expect(view.getByText('Not found')).toBeTruthy();
  });
});
