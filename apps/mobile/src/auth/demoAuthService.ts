/**
 * Local demo implementation of `AuthService`.
 *
 * THIS IS NOT PRODUCTION AUTHENTICATION.
 *  - Passwords are never stored, hashed, or checked.
 *  - The session token is random but meaningless; any client could forge it.
 *  - Accounts live on this device only.
 *
 * It exists so the whole flow (screens, validation, session persistence, route
 * guards, sign-out) can be built and tested before an identity provider is
 * chosen. Replace it with `supabaseAuthService`, `entraAuthService`, or
 * `firebaseAuthService` — see README.
 */

import { storage } from '@/lib/storage';
import { clearSession, readSession, writeSession } from './sessionStore';
import {
  AuthError,
  type AuthService,
  type AuthUser,
  type Session,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from './types';
import { validateDisplayName, validateEmail, validatePassword } from './validation';

const ACCOUNTS_KEY = 'shaikhs.demo.accounts.v1';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StoredAccount = AuthUser;

function randomId(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `id_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

async function readAccounts(): Promise<StoredAccount[]> {
  const raw = await storage.get(ACCOUNTS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredAccount[]) : [];
  } catch {
    return [];
  }
}

async function writeAccounts(accounts: StoredAccount[]): Promise<void> {
  await storage.set(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function toSession(user: AuthUser): Session {
  return {
    token: randomId(),
    user,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
}

async function persistSession(session: Session): Promise<Session> {
  return writeSession(session);
}

/** A believable network delay, so loading states get exercised in development. */
function settle<T>(value: T, ms = 450): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

export const demoAuthService: AuthService = {
  async signUp(input: SignUpInput): Promise<Session> {
    const emailError = validateEmail(input.email);
    if (emailError) throw new AuthError('invalid-email', emailError);
    const passwordError = validatePassword(input.password);
    if (passwordError) throw new AuthError('weak-password', passwordError);
    const nameError = validateDisplayName(input.displayName);
    if (nameError) throw new AuthError('invalid-email', nameError);

    const email = input.email.trim().toLowerCase();
    const accounts = await readAccounts();
    if (accounts.some((account) => account.email === email)) {
      // Delay before failing, so the button's loading state is exercised either way.
      await settle(undefined, 250);
      throw new AuthError('email-in-use', 'An account already uses that email.');
    }

    const user: AuthUser = {
      id: randomId(),
      email,
      displayName: input.displayName.trim(),
      createdAt: new Date().toISOString(),
    };
    await writeAccounts([...accounts, user]);
    return settle(persistSession(toSession(user)));
  },

  async signIn(input: SignInInput): Promise<Session> {
    const email = input.email.trim().toLowerCase();
    const accounts = await readAccounts();
    const account = accounts.find((candidate) => candidate.email === email);

    if (!account) {
      await settle(undefined, 350);
      throw new AuthError(
        'invalid-credentials',
        'No account found with that email. Create one first.',
      );
    }

    // Demo mode: the password is intentionally not verified. See file header.
    return settle(persistSession(toSession(account)));
  },

  async signOut(): Promise<void> {
    await clearSession();
  },

  async restore(): Promise<Session | null> {
    return readSession();
  },

  async requestPasswordReset(email: string): Promise<void> {
    if (validateEmail(email)) {
      throw new AuthError('invalid-email', 'Enter a valid email address.');
    }
    // Always resolves: revealing whether an address exists enables account enumeration.
    await settle(undefined, 600);
  },

  async resetPassword(_input: ResetPasswordInput): Promise<void> {
    // There is no token store offline, so a link cannot be honoured here.
    throw new AuthError('invalid-token', 'Reset links only work with a connected account.');
  },
};

/** Creates the demo account used by the "Try a demo account" shortcut. */
export const DEMO_ACCOUNT = {
  email: 'demo@shaikhs.app',
  password: 'shaikhs2026',
  displayName: 'Demo',
} as const;

export async function signInWithDemoAccount(): Promise<Session> {
  const accounts = await readAccounts();
  const email = DEMO_ACCOUNT.email;
  if (!accounts.some((account) => account.email === email)) {
    try {
      return await demoAuthService.signUp({
        displayName: DEMO_ACCOUNT.displayName,
        email,
        password: DEMO_ACCOUNT.password,
      });
    } catch {
      // Falls through to sign-in if a race created it first.
    }
  }
  return demoAuthService.signIn({ email, password: DEMO_ACCOUNT.password });
}
