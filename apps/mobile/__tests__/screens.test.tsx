/**
 * Screen smoke tests.
 *
 * These render the real screens inside the real providers, with navigation and
 * native modules stubbed. They catch the class of bug a type check cannot:
 * a provider used in the wrong order, a hook read outside its context, a
 * component that throws on first render, a missing icon name.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

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

const mockParams: Record<string, string> = {};

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const Stack = Object.assign(
    ({ children }: { children?: ReactNode }) => <>{children}</>,
    { Screen: () => null },
  );
  return {
    Stack,
    Redirect: ({ href }: { href: string }) => {
      mockReplace(href);
      return null;
    },
    Link: ({ children }: { children: ReactNode }) => <>{children}</>,
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
      canGoBack: () => true,
    }),
    // Reset-password reads its token from the deep link; tests set this object.
    useLocalSearchParams: () => mockParams,
  };
});

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined) }));

import { AuthProvider } from '@/auth/AuthProvider';
import { RegainProvider } from '@/regain/RegainProvider';
import { demoAuthService } from '@/auth/demoAuthService';
import { ThemeProvider } from '@/theme/ThemeProvider';

// Import after mocks are registered.
import DesignScreen from '@/app/(app)/design';
import HomeScreen from '@/app/(app)/index';
import SettingsScreen from '@/app/(app)/settings';
import ForgotPasswordScreen from '@/app/(auth)/forgot-password';
import ResetPasswordScreen from '@/app/(auth)/reset-password';
import SignInScreen from '@/app/(auth)/sign-in';
import SignUpScreen from '@/app/(auth)/sign-up';
import WelcomeScreen from '@/app/(auth)/welcome';

function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RegainProvider>{children}</RegainProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

async function renderScreen(node: ReactNode) {
  return render(<Providers>{node}</Providers>);
}

/** Signs a user in through the service so the guards are satisfied. */
async function seedSession() {
  await demoAuthService.signUp({
    displayName: 'Waquar',
    email: 'waquar@example.com',
    password: 'shaikhs2026',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Native sign-out goes through a confirmation dialog; accept it.
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    const confirm = buttons?.find((button) => button.style === 'destructive');
    confirm?.onPress?.();
  });
  mockStorage.clear();
  delete mockParams.token;
});

describe('auth screens', () => {
  it('welcome renders the wordmark, the pitch, and all three ways in', async () => {
    await renderScreen(<WelcomeScreen />);

    expect(await screen.findByText('Shaikh’s')).toBeTruthy();
    expect(screen.getByText('A place for what matters to you.')).toBeTruthy();
    expect(screen.getByText('Create an account')).toBeTruthy();
    expect(screen.getByText('I already have an account')).toBeTruthy();
    expect(screen.getByText('Look around with a demo account')).toBeTruthy();
    expect(screen.getByText('Preview build')).toBeTruthy();
  });

  it('welcome navigates to sign-up', async () => {
    await renderScreen(<WelcomeScreen />);
    await fireEvent.press(await screen.findByText('Create an account'));
    expect(mockPush).toHaveBeenCalledWith('/sign-up');
  });

  it('sign-in shows field errors before calling the network', async () => {
    await renderScreen(<SignInScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your email address.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
  });

  it('sign-in surfaces an unknown-account error from the service', async () => {
    await renderScreen(<SignInScreen />);

    await fireEvent.changeText(await screen.findByPlaceholderText('you@example.com'), 'ghost@example.com');
    await fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'shaikhs2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('No account found with that email. Create one first.', undefined, {
        timeout: 3000,
      }),
    ).toBeTruthy();
  });

  it('sign-up reports a duplicate account', async () => {
    await demoAuthService.signUp({
      displayName: 'Waquar',
      email: 'taken@example.com',
      password: 'shaikhs2026',
    });

    await renderScreen(<SignUpScreen />);

    await fireEvent.changeText(await screen.findByPlaceholderText('What should we call you?'), 'Someone');
    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'taken@example.com');
    await fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'shaikhs2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('An account already uses that email.', undefined, { timeout: 3000 }),
    ).toBeTruthy();
  });

  it('sign-up shows the strength meter once a password is typed', async () => {
    await renderScreen(<SignUpScreen />);
    await fireEvent.changeText(await screen.findByPlaceholderText('At least 8 characters'), 'shaikhs2026');
    expect(await screen.findByText('Fair')).toBeTruthy();
  });

  it('forgot-password moves to the confirmation state', async () => {
    await renderScreen(<ForgotPasswordScreen />);

    await fireEvent.changeText(await screen.findByPlaceholderText('you@example.com'), 'a@b.co');
    await fireEvent.press(screen.getByText('Send reset link'));

    expect(
      await screen.findByText('Check your inbox', undefined, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.getByText(/Preview build: no email is actually sent yet/)).toBeTruthy();
  });

  it('reset-password explains an incomplete link instead of failing silently', async () => {
    await renderScreen(<ResetPasswordScreen />);

    expect(await screen.findByText('This link is incomplete')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Request a new link' }));
    expect(mockReplace).toHaveBeenCalledWith('/forgot-password');
  });

  it('reset-password checks confirmation, then reports the demo limitation', async () => {
    mockParams.token = 'demo-token';
    await renderScreen(<ResetPasswordScreen />);

    await fireEvent.changeText(await screen.findByPlaceholderText('At least 8 characters'), 'newpass123');
    await fireEvent.changeText(screen.getByPlaceholderText('Type it again'), 'different123');
    await fireEvent.press(screen.getByRole('button', { name: 'Set new password' }));

    expect(await screen.findByText('Those passwords do not match.')).toBeTruthy();

    await fireEvent.changeText(screen.getByPlaceholderText('Type it again'), 'newpass123');
    await fireEvent.press(screen.getByRole('button', { name: 'Set new password' }));

    expect(
      await screen.findByText('Reset links only work with a connected account.', undefined, {
        timeout: 3000,
      }),
    ).toBeTruthy();
  });
});

describe('app screens', () => {
  it('home greets the person and shows what Regain is doing today', async () => {
    await seedSession();
    await renderScreen(<HomeScreen />);

    expect(await screen.findByText('Waquar', undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('Regain')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Counted on this phone. Nothing is uploaded.')).toBeTruthy();
    expect(screen.getByText('Signed in as waquar@example.com')).toBeTruthy();

    // The build's own progress does not belong on a screen a user looks at.
    expect(screen.queryByText('Foundation complete')).toBeNull();
    expect(screen.queryByText(/features come next/i)).toBeNull();
  });

  it('home leads with Regain and opens it', async () => {
    await seedSession();
    await renderScreen(<HomeScreen />);

    await fireEvent.press(await screen.findByLabelText('Open Regain'));
    expect(mockPush).toHaveBeenCalledWith('/regain');
  });

  it('home reaches settings from the header', async () => {
    await seedSession();
    await renderScreen(<HomeScreen />);

    await fireEvent.press(await screen.findByLabelText('Settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('design screen renders the palette, the type scale and the components', async () => {
    await seedSession();
    await renderScreen(<DesignScreen />);

    expect(await screen.findByText('Ink & Peacock')).toBeTruthy();
    expect(screen.getByText('Accent · Peacock')).toBeTruthy();
    expect(screen.getByText('Primary action')).toBeTruthy();
    expect(screen.getByText('Cream + terracotta')).toBeTruthy();
    // The measured contrast is rendered, not hardcoded marketing copy.
    expect(screen.getAllByText(/:1$/).length).toBeGreaterThan(0);
  });

  it('settings shows the account and signs out', async () => {
    await seedSession();
    await renderScreen(<SettingsScreen />);

    expect(await screen.findByText('waquar@example.com')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    // The layout redirect is what unmounts the screen in the running app; here we
    // assert the thing that matters: the persisted session is gone.
    await waitFor(() => {
      expect(mockStorage.has('shaikhs.session.v1')).toBe(false);
    });
  });
});
