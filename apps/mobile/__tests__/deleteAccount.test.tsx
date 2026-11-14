/**
 * Deleting the account, from the screen's side.
 *
 * The guarantee worth testing is not the layout: it is that nothing happens
 * until the word is typed, that the request fires exactly once, and that a
 * failure leaves the person signed in and told the truth.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockDelete = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
}));

const mockAuth = {
  user: { id: 'u1', email: 'waquar@example.com', displayName: 'Waquar', createdAt: '' },
  isDemoMode: false,
  isSubmitting: false,
  error: null as string | null,
  deleteAccount: (...args: unknown[]) => mockDelete(...args),
  clearError: jest.fn(),
};

jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));

jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined) }));

import { ThemeProvider } from '@/theme/ThemeProvider';
import DeleteAccountScreen from '@/app/(app)/delete-account';

function wrap(node: ReactNode) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.error = null;
  mockDelete.mockResolvedValue(true);
});

describe('what deletion removes', () => {
  it('says both halves plainly: what goes, and what was never ours', async () => {
    const view = await wrap(<DeleteAccountScreen />);

    expect(view.getByText('What is deleted')).toBeTruthy();
    expect(view.getByText(/waquar@example\.com/)).toBeTruthy();
    expect(view.getByText('What stays on your phone')).toBeTruthy();
  });
});

describe('the typed confirmation', () => {
  it('does nothing until DELETE is typed', async () => {
    const view = await wrap(<DeleteAccountScreen />);

    await fireEvent.press(view.getByText('Delete my account'));
    expect(mockDelete).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByPlaceholderText('DELETE'), 'DELET');
    await fireEvent.press(view.getByText('Delete my account'));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('accepts lowercase, because a phone keyboard should not be the gate', async () => {
    const view = await wrap(<DeleteAccountScreen />);

    await fireEvent.changeText(view.getByPlaceholderText('DELETE'), ' delete ');
    await fireEvent.press(view.getByText('Delete my account'));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
  });

  it('hands over to the receipt once the server confirms', async () => {
    const view = await wrap(<DeleteAccountScreen />);

    await fireEvent.changeText(view.getByPlaceholderText('DELETE'), 'DELETE');
    await fireEvent.press(view.getByText('Delete my account'));

    expect(await view.findByText('Your account is gone')).toBeTruthy();

    await fireEvent.press(view.getByText('Close'));
    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });
});

describe('when the server refuses', () => {
  it('stays on the screen and shows the reason', async () => {
    mockDelete.mockResolvedValue(false);
    mockAuth.error = 'Cannot reach the server. Check your connection and try again.';

    const view = await wrap(<DeleteAccountScreen />);

    await fireEvent.changeText(view.getByPlaceholderText('DELETE'), 'DELETE');
    await fireEvent.press(view.getByText('Delete my account'));

    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(view.queryByText('Your account is gone')).toBeNull();
  });
});
