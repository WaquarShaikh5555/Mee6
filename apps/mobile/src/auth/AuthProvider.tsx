import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { demoAuthService, signInWithDemoAccount } from './demoAuthService';
import { httpAuthService, isApiConfigured } from './httpAuthService';
import {
  AuthError,
  type AuthService,
  type Session,
  type SignInInput,
  type SignUpInput,
} from './types';

/**
 * The single seam between the app and the identity provider.
 *
 * Set `EXPO_PUBLIC_API_URL` (see .env.example) to use the real backend; without
 * it the app runs against the on-device demo service so screens stay usable.
 */
const service: AuthService = isApiConfigured() ? httpAuthService : demoAuthService;

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: Session['user'] | null;
  isSubmitting: boolean;
  error: string | null;
  /** True while the app runs on the local demo service. Surfaced in the UI. */
  isDemoMode: boolean;
  signIn: (input: SignInInput) => Promise<boolean>;
  signUp: (input: SignUpInput) => Promise<boolean>;
  signInDemo: () => Promise<boolean>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  /** Returns false when the token is invalid/expired or the password is rejected. */
  resetPassword: (token: string, password: string) => Promise<boolean>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [session, setSession] = useState<Session | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    service
      .restore()
      .then((restored) => {
        if (cancelled) return;
        setSession(restored);
        setStatus(restored ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        if (!cancelled) setStatus('signedOut');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(
    async (action: () => Promise<Session>): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);
      try {
        const next = await action();
        setSession(next);
        setStatus('signedIn');
        return true;
      } catch (caught) {
        setError(
          caught instanceof AuthError
            ? caught.message
            : 'Something went wrong. Check your connection and try again.',
        );
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const signIn = useCallback(
    (input: SignInInput) => run(() => service.signIn(input)),
    [run],
  );
  const signUp = useCallback(
    (input: SignUpInput) => run(() => service.signUp(input)),
    [run],
  );
  const signInDemo = useCallback(async () => {
    // Only meaningful offline; in API mode this would mint a local session the
    // server knows nothing about.
    if (service !== demoAuthService) return false;
    return run(() => signInWithDemoAccount());
  }, [run]);

  const signOut = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await service.signOut();
    } finally {
      setSession(null);
      setStatus('signedOut');
      setError(null);
      setIsSubmitting(false);
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await service.requestPasswordReset(email);
      return true;
    } catch (caught) {
      setError(
        caught instanceof AuthError ? caught.message : 'Could not send the reset email.',
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await service.resetPassword({ token, password });
      // Every session was revoked server-side; mirror that locally.
      setSession(null);
      setStatus('signedOut');
      return true;
    } catch (caught) {
      setError(
        caught instanceof AuthError
          ? caught.message
          : 'Could not reset the password. The link may have expired.',
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      isSubmitting,
      error,
      isDemoMode: service === demoAuthService,
      signIn,
      signUp,
      signInDemo,
      signOut,
      requestPasswordReset,
      resetPassword,
      clearError,
    }),
    [
      status,
      session,
      isSubmitting,
      error,
      signIn,
      signUp,
      signInDemo,
      signOut,
      requestPasswordReset,
      resetPassword,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}
