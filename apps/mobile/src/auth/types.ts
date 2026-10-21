/**
 * Auth contracts.
 *
 * Screens and providers depend on these types only — never on a specific
 * vendor. Swapping the demo implementation for Supabase, Firebase, or
 * Microsoft Entra External ID means writing one more `AuthService` and changing
 * one line in `AuthProvider`. No screen has to change.
 */

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};

export type Session = {
  token: string;
  user: AuthUser;
  /** ISO timestamp. The app treats an expired session as signed out. */
  expiresAt: string;
};

export type SignUpInput = {
  displayName: string;
  email: string;
  password: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type ResetPasswordInput = {
  /** Token taken from the link in the reset email. */
  token: string;
  password: string;
};

export type AuthErrorCode =
  | 'invalid-credentials'
  | 'email-in-use'
  | 'weak-password'
  | 'invalid-email'
  | 'invalid-token'
  | 'email-confirmation-required'
  | 'network'
  | 'unknown';

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export interface AuthService {
  /** Creates an account and returns a live session. */
  signUp(input: SignUpInput): Promise<Session>;
  signIn(input: SignInInput): Promise<Session>;
  signOut(): Promise<void>;
  /** Reads a persisted session. Returns null when absent, expired, or corrupt. */
  restore(): Promise<Session | null>;
  /** Always resolves, whether or not the address exists (no account enumeration). */
  requestPasswordReset(email: string): Promise<void>;
  /** Consumes a reset token and sets a new password. Revokes every existing session. */
  resetPassword(input: ResetPasswordInput): Promise<void>;
}
