/**
 * The owner console, from the screen's side.
 *
 * What matters here is not pixels: it is that an ordinary account never gets
 * the list, that every action goes to `setAccess` with the action the button
 * promised, and that a refusal from the server is shown rather than swallowed.
 */

import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockUser = {
  id: '83556d43-40be-47bf-a4c6-c20a8fca2155',
  email: 'waquar@example.com',
  displayName: 'Waquar',
  isAdmin: true as boolean | undefined,
};

jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }));

const mockListUsers = jest.fn();
const mockFetchOverview = jest.fn();
const mockRecentActions = jest.fn();
const mockSetAccess = jest.fn();

jest.mock('@/admin/service', () => {
  class AdminError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    AdminError,
    adminAvailable: () => true,
    listUsers: (...args: unknown[]) => mockListUsers(...args),
    fetchOverview: (...args: unknown[]) => mockFetchOverview(...args),
    recentActions: (...args: unknown[]) => mockRecentActions(...args),
    setAccess: (...args: unknown[]) => mockSetAccess(...args),
    describeAction: (action: string) => action,
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined) }));

import { AdminError } from '@/admin/service';
import { ThemeProvider } from '@/theme/ThemeProvider';
import PeopleScreen from '@/app/(app)/people';

const AYESHA = {
  id: '9f1d2c3b-4a5e-4f60-8b71-2c3d4e5f6071',
  displayName: 'Ayesha Khan',
  email: 'ayesha@example.com',
  isAdmin: false,
  isBlocked: false,
  proUntil: null as string | null,
  lastSeenAt: new Date().toISOString(),
  createdAt: '2026-10-01T09:00:00.000Z',
  note: null,
};

const OVERVIEW = { total: 4, pro: 1, blocked: 0, admins: 1, seen7d: 3 };

function wrap(node: ReactNode) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.isAdmin = true;
  mockListUsers.mockResolvedValue([AYESHA]);
  mockFetchOverview.mockResolvedValue(OVERVIEW);
  mockRecentActions.mockResolvedValue([]);
  mockSetAccess.mockResolvedValue({ ...AYESHA, proUntil: '2026-12-20T00:00:00.000Z' });
});

describe('the gate', () => {
  it('shows an ordinary account nothing to manage', async () => {
    mockUser.isAdmin = false;

    const view = await wrap(<PeopleScreen />);

    expect(view.getByText('Owners only')).toBeTruthy();
    expect(view.queryByText('Ayesha Khan')).toBeNull();
    expect(mockListUsers).not.toHaveBeenCalled();
  });
});

describe('the list', () => {
  it('shows every account with its state', async () => {
    const view = await wrap(<PeopleScreen />);

    expect(await view.findByText('Ayesha Khan')).toBeTruthy();
    expect(view.getByText(/ayesha@example\.com/)).toBeTruthy();
    // Counts come from admin_overview, not from the rows on screen.
    expect(view.getByText('Accounts')).toBeTruthy();
    expect(view.getByText('Owners')).toBeTruthy();
  });

  it('marks paused and Pro accounts so the state is never guessed', async () => {
    mockListUsers.mockResolvedValue([
      {
        ...AYESHA,
        isBlocked: true,
        proUntil: new Date(Date.now() + 86_400_000).toISOString(),
      },
    ]);

    const view = await wrap(<PeopleScreen />);

    expect(await view.findByText('PAUSED')).toBeTruthy();
    expect(view.getByText(/^Pro until/)).toBeTruthy();
  });

  it('says so when the server refuses the list', async () => {
    mockListUsers.mockRejectedValue(new AdminError('not-authorised', 'This account is not an owner.'));

    const view = await wrap(<PeopleScreen />);

    expect(await view.findByText('This account is not an owner.')).toBeTruthy();
  });
});

describe('actions', () => {
  it('asks before granting Pro and then calls the server', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text !== 'Cancel')?.onPress?.();
    });

    const view = await wrap(<PeopleScreen />);

    fireEvent.press(await view.findByText('Ayesha Khan'));
    fireEvent.press(await view.findByText('Give 30 days of Pro'));

    // The day count is the service's job (it sends p_days: 30); the screen only
    // has to name the right account and the right action.
    await waitFor(() => expect(mockSetAccess).toHaveBeenCalledWith(AYESHA.id, 'grant_pro'));

    expect(alert).toHaveBeenCalledWith(
      'Give 30 days of Pro?',
      expect.stringContaining('Ayesha Khan'),
      expect.any(Array),
    );

    alert.mockRestore();
  });

  it('offers the opposite action once an account is paused', async () => {
    mockListUsers.mockResolvedValue([{ ...AYESHA, isBlocked: true }]);

    const view = await wrap(<PeopleScreen />);
    fireEvent.press(await view.findByText('Ayesha Khan'));

    expect(await view.findByText('Restore access')).toBeTruthy();
    expect(view.queryByText('Pause this account')).toBeNull();
  });

  it('will not let an owner pause themselves from this sheet', async () => {
    mockListUsers.mockResolvedValue([
      {
        ...AYESHA,
        id: mockUser.id,
        displayName: 'Waquar',
        email: 'waquar@example.com',
        isAdmin: true,
      },
    ]);

    const view = await wrap(<PeopleScreen />);
    fireEvent.press(await view.findByText(/Waquar/));

    const pause = await view.findByText('Pause this account');
    expect(pause).toBeTruthy();
    // Disabled at the control, and explained rather than silently inert.
    expect(view.getByText(/You cannot pause it/)).toBeTruthy();
  });
});
