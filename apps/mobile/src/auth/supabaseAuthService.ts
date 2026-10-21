/**
 * Production `AuthService`, backed by Supabase.
 *
 * Selected whenever the two environment variables are present. Screens never
 * import this file; they use `useAuth()`, so swapping the backing service
 * changes nothing above this layer.
 *
 * What Supabase owns, and why that is safe:
 *  - Passwords are hashed by GoTrue (bcrypt) and never reach us.
 *  - Sessions are JWTs refreshed in the background; the refresh token lives in
 *    the iOS Keychain / Android Keystore through `supabaseClient.ts`.
 *  - Row access is enforced by RLS policies on the server, not by the client.
 */

import type { AuthError as SupabaseAuthError, Session as SupabaseSession, User } from '@supabase/supabase-js';

import { getSupabaseClient } from './supabaseClient';
import {
  AuthError,
  type AuthService,
  type AuthUser,
  type ResetPasswordInput,
  type Session,
  type SignInInput,
  type SignUpInput,
} from './types';

/** Where Supabase should send someone after they tap a reset link. */
export const RESET_REDIRECT_URL = 'shaikhs://reset-password';

type SupabaseError = SupabaseAuthError | null;

function displayNameOf(user: User): string {
  const fromMetadata = user.user_metadata?.display_name;
  if (typeof fromMetadata === 'string' && fromMetadata.trim().length > 0) {
    return fromMetadata.trim();
  }

  // Rows created before the metadata convention existed, or OAuth sign-ups.
  const email = user.email ?? '';
  return email.includes('@') ? email.slice(0, email.indexOf('@')) : 'Friend';
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: displayNameOf(user),
    createdAt: user.created_at ?? new Date().toISOString(),
  };
}

/**
 * Maps Supabase's error messages onto the app's contract.
 *
 * Supabase speaks in `code`/`message` pairs with its own vocabulary; the UI
 * expects our `AuthErrorCode` and copy that matches the rest of the app.
 */
function toAuthError(error: SupabaseError): AuthError {
  if (!error) return new AuthError('unknown', 'Something went wrong. Try again.');

  const code = (error.code ?? '').toLowerCase();
  const message = error.message ?? '';

  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return new AuthError('invalid-credentials', 'Email or password is incorrect.');
  }
  if (code === 'email_exists' || /already registered|already exists/i.test(message)) {
    return new AuthError('email-in-use', 'An account already uses that email.');
  }
  if (code === 'weak_password' || /password should be at least/i.test(message)) {
    return new AuthError('weak-password', 'Use at least 8 characters.');
  }
  if (code === 'email_address_invalid' || code === 'validation_failed') {
    return new AuthError('invalid-email', 'That email address does not look right.');
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return new AuthError('unknown', 'Too many attempts. Wait a minute and try again.');
  }
  if (code === 'session_not_found' || code === 'refresh_token_not_found') {
    return new AuthError('unknown', 'Your session has expired. Sign in again.');
  }
  if (/network|fetch|failed to fetch/i.test(message)) {
    return new AuthError('network', 'Cannot reach the server. Check your connection.');
  }

  return new AuthError('unknown', message || 'Something went wrong. Try again.');
}

function toSession(session: SupabaseSession): Session {
  return {
    token: session.access_token,
    user: toAuthUser(session.user),
    expiresAt: new Date((session.expires_at ?? 0) * 1000).toISOString(),
  };
}

export const supabaseAuthService: AuthService = {
  async signUp(input: SignUpInput): Promise<Session> {
    const { data, error } = await getSupabaseClient().auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        // Read back by the database trigger that creates the profile row.
        data: { display_name: input.displayName.trim() },
      },
    });

    if (error) throw toAuthError(error);

    if (!data.session) {
      // Happens only when "Confirm email" is enabled in the Supabase project.
      throw new AuthError(
        'email-confirmation-required',
        'Check your inbox and confirm your email address, then sign in.',
      );
    }

    return toSession(data.session);
  },

  async signIn(input: SignInInput): Promise<Session> {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });

    if (error) throw toAuthError(error);
    if (!data.session) {
      throw new AuthError('unknown', 'Sign-in did not return a session. Try again.');
    }

    return toSession(data.session);
  },

  async signOut(): Promise<void> {
    try {
      // scope 'local' also clears the stored session even when the refresh
      // token has already expired, so a sign-out can never leave the app stuck.
      await getSupabaseClient().auth.signOut({ scope: 'local' });
    } catch {
      // Never trap someone in the app because a network call failed.
    }
  },

  async restore(): Promise<Session | null> {
    const client = getSupabaseClient();

    // Reads the persisted session and refreshes it if it is close to expiry.
    const { data, error } = await client.auth.getSession();
    if (error) return null;
    if (!data.session) return null;

    // Confirm with the server that the account still exists and the token is
    // valid; a revoked or stale token returns an error here.
    const { data: userData, error: userError } = await client.auth.getUser();

    if (userError || !userData.user) {
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      return null;
    }

    return {
      token: data.session.access_token,
      user: toAuthUser(userData.user),
      expiresAt: new Date((data.session.expires_at ?? 0) * 1000).toISOString(),
    };
  },

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: RESET_REDIRECT_URL },
    );

    // "User not found" must not surface: that would tell a stranger which
    // addresses have accounts.
    if (error && !/not found/i.test(error.message ?? '')) {
      throw toAuthError(error);
    }
  },

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const client = getSupabaseClient();

    // The emailed link carries a one-time credential, and Supabase has two
    // shapes for it depending on how the template is written and which auth
    // flow the project uses:
    //   token_hash=…  — verified with verifyOtp (our recommendation)
    //   code=…        — a PKCE code, exchanged for a session
    // Try the first, fall back to the second, so either template works.
    const { error: verifyError } = await client.auth.verifyOtp({
      token_hash: input.token,
      type: 'recovery',
    });

    let authorised = !verifyError;

    if (!authorised) {
      const { error: exchangeError } = await client.auth.exchangeCodeForSession(input.token);
      authorised = !exchangeError;
    }

    if (!authorised) {
      throw new AuthError(
        'invalid-token',
        'That reset link is invalid or has expired. Request a new one.',
      );
    }

    const { error: updateError } = await client.auth.updateUser({ password: input.password });

    if (updateError) {
      if ((updateError.code ?? '') === 'weak_password') {
        throw new AuthError('weak-password', 'Use at least 8 characters.');
      }
      throw toAuthError(updateError);
    }

    // Every other device keeps its session; sign this one out so the person
    // signs in with the password they just chose.
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  },
};
