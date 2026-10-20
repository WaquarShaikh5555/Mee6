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
  };
});

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined) }));

import { AuthProvider } from '@/auth/AuthProvider';
import { demoAuthService } from '@/auth/demoAuthService';
import { ThemeProvider } from '@/theme/ThemeProvider';

// Import after mocks are registered.
import DesignScreen from '@/app/(app)/design';
import HomeScreen from '@/app/(app)/index';
import SettingsScreen from '@/app/(app)/settings';
import ForgotPasswordScreen from '@/app/(auth)/forgot-password';
import SignInScreen from '@/app/(auth)/sign-in';
import SignUpScreen from '@/app/(auth)/sign-up';
import WelcomeScreen from '@/app/(auth)/welcome';

function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
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
});

describe('app screens', () => {
  it('home greets the signed-in user and lists the foundation', async () => {
    await seedSession();
    await renderScreen(<HomeScreen />);

    expect(await screen.findByText('Waquar', undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('Foundation complete')).toBeTruthy();
    expect(screen.getByText('Your first feature')).toBeTruthy();
    expect(screen.getByText('Signed in as waquar@example.com')).toBeTruthy();
  });

  it('home routes to design and settings', async () => {
    await seedSession();
    await renderScreen(<HomeScreen />);

    await fireEvent.press(await screen.findByText('Design system'));
    expect(mockPush).toHaveBeenCalledWith('/design');

    await fireEvent.press(screen.getByText('Settings'));
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
