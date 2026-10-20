/**
 * Production `AuthService`, backed by the Shaikh's API in `apps/api`.
 *
 * Selected automatically when `EXPO_PUBLIC_API_URL` is set — for example
 *   EXPO_PUBLIC_API_URL=http://192.168.1.20:8082     (phone on the same Wi-Fi)
 *   EXPO_PUBLIC_API_URL=https://api.shaikhs.example  (deployed)
 * With it unset the app falls back to the local demo service, so `npm start`
 * still works for anyone who has not started the backend.
 *
 * The server owns the truth: it hashes passwords with argon2id, stores only
 * SHA-256 hashes of session tokens, and revokes sessions on sign-out. This file
 * only moves bytes and maps errors into `AuthError`.
 */

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

const REQUEST_TIMEOUT_MS = 10_000;

/** Read lazily: Expo inlines `process.env.EXPO_PUBLIC_*` at build time. */
function apiBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
}

/** True when the app should talk to the real API rather than the demo service. */
export function isApiConfigured(): boolean {
  return apiBaseUrl().length > 0;
}

type ApiUser = { id: string; email: string; displayName: string; createdAt: string };

type AuthPayload = { token: string; user: ApiUser; expiresAt: string };

type ApiErrorBody = { error?: { code?: string; message?: string } };

type RequestOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
};

/**
 * Maps the server's error codes onto the app's contract.
 *
 * The server already returns user-safe copy, so its message wins for anything
 * that is the person's fault; transport and 5xx failures get our own wording.
 */
function toAuthError(code: string | undefined, message: string | undefined): AuthError {
  switch (code) {
    case 'invalid_credentials':
      return new AuthError('invalid-credentials', message ?? 'Email or password is incorrect.');
    case 'email_in_use':
      return new AuthError('email-in-use', message ?? 'An account already uses that email.');
    case 'weak_password':
      return new AuthError('weak-password', message ?? 'Choose a stronger password.');
    case 'invalid_email':
      return new AuthError('invalid-email', message ?? 'Enter a valid email address.');
    case 'invalid_request':
      // The reset endpoint uses this for an unknown, used, or expired token.
      return new AuthError('invalid-token', message ?? 'Check the details and try again.');
    case 'rate_limited':
      return new AuthError('unknown', 'Too many attempts. Wait a minute and try again.');
    case 'unauthorized':
    case 'session_expired':
      return new AuthError('unknown', 'Your session has expired. Sign in again.');
    default:
      return new AuthError('unknown', message ?? 'Something went wrong. Try again.');
  }
}

async function request<T>(path: string, options: RequestOptions): Promise<T | null> {
  const base = apiBaseUrl();
  if (!base) {
    throw new AuthError('network', 'This build has no API address configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: options.method,
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    // Covers DNS failures, refused connections, TLS errors, and timeouts.
    throw new AuthError(
      'network',
      'Cannot reach the server. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const body = parsed as ApiErrorBody | null;
    throw toAuthError(body?.error?.code, body?.error?.message);
  }

  return parsed as T;
}

function toSession(payload: AuthPayload): Session {
  const { token, user, expiresAt } = payload;

  if (!token || !user?.id || !user.email) {
    throw new AuthError('unknown', 'The server returned an unexpected response.');
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };

  return { token, user: authUser, expiresAt };
}

export const httpAuthService: AuthService = {
  async signUp(input: SignUpInput): Promise<Session> {
    const payload = await request<AuthPayload>('/v1/auth/signup', {
      method: 'POST',
      body: {
        email: input.email.trim().toLowerCase(),
        password: input.password,
        displayName: input.displayName.trim(),
      },
    });

    return writeSession(toSession(payload as AuthPayload));
  },

  async signIn(input: SignInInput): Promise<Session> {
    const payload = await request<AuthPayload>('/v1/auth/signin', {
      method: 'POST',
      body: {
        email: input.email.trim().toLowerCase(),
        password: input.password,
      },
    });

    return writeSession(toSession(payload as AuthPayload));
  },

  async signOut(): Promise<void> {
    const stored = await readSession();

    if (stored) {
      try {
        // Revokes the token server-side. Failure here must not trap the person
        // in the app, so the local session is cleared either way.
        await request('/v1/auth/signout', { method: 'POST', token: stored.token });
      } catch {
        // Ignored on purpose.
      }
    }

    await clearSession();
  },

  async restore(): Promise<Session | null> {
    const stored = await readSession();
    if (!stored) return null;

    try {
      const payload = await request<{ user: ApiUser; expiresAt: string }>('/v1/auth/session', {
        method: 'GET',
        token: stored.token,
      });

      if (!payload?.user) {
        await clearSession();
        return null;
      }

      return writeSession({
        token: stored.token,
        user: {
          id: payload.user.id,
          email: payload.user.email,
          displayName: payload.user.displayName,
          createdAt: payload.user.createdAt,
        },
        expiresAt: payload.expiresAt,
      });
    } catch (caught) {
      if (caught instanceof AuthError && caught.code === 'network') {
        // Offline: keep the last known session rather than signing the person out.
        return stored;
      }

      // Any other failure means the token is no longer valid (revoked, expired,
      // or the account was deleted).
      await clearSession();
      return null;
    }
  },

  async requestPasswordReset(email: string): Promise<void> {
    await request('/v1/auth/password/forgot', {
      method: 'POST',
      body: { email: email.trim().toLowerCase() },
    });
  },

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await request('/v1/auth/password/reset', {
      method: 'POST',
      body: { token: input.token, password: input.password },
    });

    // The server revokes every session for the account, including this device's.
    await clearSession();
  },
};
