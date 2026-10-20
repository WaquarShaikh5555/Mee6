/**
 * Auth contract tests.
 *
 * These run against the demo service, but they encode the behaviour every
 * future provider must keep: validation messages, no account enumeration,
 * expiry handling, and a clean sign-out.
 */

import { demoAuthService, signInWithDemoAccount } from '@/auth/demoAuthService';
import { AuthError } from '@/auth/types';
import {
  hasErrors,
  passwordStrength,
  validateEmail,
  validatePassword,
  validateSignIn,
  validateSignUp,
} from '@/auth/validation';

// In-memory stand-in for expo-secure-store.
const mockStore = new Map<string, string>();

jest.mock('@/lib/storage', () => ({
  storage: {
    get: async (key: string) => mockStore.get(key) ?? null,
    set: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
    remove: async (key: string) => {
      mockStore.delete(key);
    },
  },
}));

beforeEach(() => {
  mockStore.clear();
});

describe('email validation', () => {
  it.each(['a@b.co', 'first.last+tag@sub.example.org'])('accepts %s', (email) => {
    expect(validateEmail(email)).toBeUndefined();
  });

  it.each(['', '   ', 'no-at-sign', 'a@b', 'a b@c.com', '@example.com'])(
    'rejects %p',
    (email) => {
      expect(validateEmail(email)).toBeTruthy();
    },
  );
});

describe('password validation', () => {
  it('requires a minimum length', () => {
    expect(validatePassword('abc123')).toBe('Use at least 8 characters.');
  });

  it('requires both letters and digits', () => {
    expect(validatePassword('abcdefgh')).toBe('Include at least one letter and one number.');
    expect(validatePassword('12345678')).toBe('Include at least one letter and one number.');
  });

  it('accepts a compliant password', () => {
    expect(validatePassword('shaikhs2026')).toBeUndefined();
  });
});

describe('form validation', () => {
  it('reports every invalid field, not just the first', () => {
    const errors = validateSignUp({ displayName: '', email: 'nope', password: '123' });
    expect(Object.keys(errors).sort()).toEqual(['displayName', 'email', 'password']);
    expect(hasErrors(errors)).toBe(true);
  });

  it('sign-in only needs an email shape and a non-empty password', () => {
    expect(hasErrors(validateSignIn({ email: 'a@b.co', password: 'x' }))).toBe(false);
  });

  it('scores password strength monotonically', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abcdefgh')).toBe(1);
    expect(passwordStrength('abcdefgh1')).toBe(2);
    expect(passwordStrength('abcdefgh1!')).toBeGreaterThanOrEqual(3);
  });
});

describe('demo auth service', () => {
  it('signs up and returns a session with the created user', async () => {
    const session = await demoAuthService.signUp({
      displayName: 'Waquar',
      email: 'Waquar@Example.com',
      password: 'shaikhs2026',
    });

    expect(session.user.displayName).toBe('Waquar');
    expect(session.user.email).toBe('waquar@example.com'); // normalised
    expect(session.token).toBeTruthy();
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses a duplicate email regardless of case', async () => {
    await demoAuthService.signUp({
      displayName: 'Waquar',
      email: 'waquar@example.com',
      password: 'shaikhs2026',
    });

    await expect(
      demoAuthService.signUp({
        displayName: 'Other',
        email: 'WAQUAR@example.com',
        password: 'shaikhs2026',
      }),
    ).rejects.toMatchObject({ code: 'email-in-use' });
  });

  it('rejects a weak password before touching storage', async () => {
    await expect(
      demoAuthService.signUp({ displayName: 'A', email: 'a@b.co', password: 'short' }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(mockStore.size).toBe(0);
  });

  it('restores a session that was persisted', async () => {
    const session = await demoAuthService.signUp({
      displayName: 'Waquar',
      email: 'waquar@example.com',
      password: 'shaikhs2026',
    });

    const restored = await demoAuthService.restore();
    expect(restored?.user.id).toBe(session.user.id);
  });

  it('treats an expired session as signed out and clears it', async () => {
    const expired = {
      token: 'stale',
      user: { id: '1', email: 'a@b.co', displayName: 'A', createdAt: new Date().toISOString() },
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    mockStore.set('shaikhs.session.v1', JSON.stringify(expired));

    expect(await demoAuthService.restore()).toBeNull();
    expect(mockStore.has('shaikhs.session.v1')).toBe(false);
  });

  it('treats a corrupt session as signed out instead of throwing', async () => {
    mockStore.set('shaikhs.session.v1', '{ not json');
    await expect(demoAuthService.restore()).resolves.toBeNull();
  });

  it('signs out by removing the session only', async () => {
    await demoAuthService.signUp({
      displayName: 'Waquar',
      email: 'waquar@example.com',
      password: 'shaikhs2026',
    });

    await demoAuthService.signOut();

    expect(await demoAuthService.restore()).toBeNull();
    // The account survives sign-out, so signing in again works.
    const again = await demoAuthService.signIn({
      email: 'waquar@example.com',
      password: 'anything',
    });
    expect(again.user.email).toBe('waquar@example.com');
  });

  it('does not reveal whether an address exists on password reset', async () => {
    await expect(demoAuthService.requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
  });

  it('rejects a malformed address on password reset', async () => {
    await expect(demoAuthService.requestPasswordReset('nope')).rejects.toMatchObject({
      code: 'invalid-email',
    });
  });

  it('creates the demo account once and reuses it', async () => {
    const first = await signInWithDemoAccount();
    const second = await signInWithDemoAccount();
    expect(second.user.id).toBe(first.user.id);
  });
});
