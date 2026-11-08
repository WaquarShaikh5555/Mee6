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

import { LEGAL_DOCUMENTS, PRIVACY, TERMS } from '@/legal/documents';
import { ThemeProvider } from '@/theme/ThemeProvider';

import DeveloperScreen from '@/app/(app)/developer';
import SettingsScreen from '@/app/(app)/settings';

function wrap(node: ReactNode) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.isAdmin = false;
});

describe('owner gate', () => {
  it('hides owner tools from an ordinary account', async () => {
    const view = await wrap(<SettingsScreen />);
    expect(view.queryByText('Developer options')).toBeNull();
  });

  it('shows owner tools when the database says so', async () => {
    mockUser.isAdmin = true;
    const view = await wrap(<SettingsScreen />);
    expect(view.getByText('Developer options')).toBeTruthy();
  });

  it('refuses an ordinary account the developer screen', async () => {
    const view = await wrap(<DeveloperScreen />);
    expect(view.getByText('Not available')).toBeTruthy();
    expect(view.queryByText('What Focus Mode last saw')).toBeNull();
  });

  it('shows the owner what is in force', async () => {
    mockUser.isAdmin = true;
    const view = await wrap(<DeveloperScreen />);
    expect(view.getByText('Owner tools')).toBeTruthy();
    expect(view.getByText('What Focus Mode last saw')).toBeTruthy();
    expect(view.getByText('Rules in force')).toBeTruthy();
    expect(view.getByText('reels')).toBeTruthy();
  });

  // Pressing comes last: a navigation mock leaves queued work that later
  // renders in the same file do not flush under the test renderer.
  it('links to both documents', async () => {
    const view = await wrap(<SettingsScreen />);
    fireEvent.press(view.getByText('Privacy policy'));
    expect(mockPush).toHaveBeenCalledWith('/legal/privacy');
    fireEvent.press(view.getByText('Terms of use'));
    expect(mockPush).toHaveBeenCalledWith('/legal/terms');
  });
});
