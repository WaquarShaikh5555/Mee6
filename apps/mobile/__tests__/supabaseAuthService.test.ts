/**
 * Contract tests for the Supabase auth service.
 *
 * The Supabase client is replaced with a stub, so these assert the mapping the
 * rest of the app depends on: which SDK calls happen, what error messages come
 * out, and what the session looks like — without touching the network.
 */

import { supabaseAuthService } from '@/auth/supabaseAuthService';
import { AuthError } from '@/auth/types';

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

const mockAuth = {
  signUp: jest.fn(),
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(),
  getUser: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  verifyOtp: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  updateUser: jest.fn(),
};

jest.mock('@/auth/supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({ auth: mockAuth }),
  resetSupabaseClient: () => undefined,
  supabaseUrl: () => 'https://project.supabase.co',
  supabaseAnonKey: () => 'publishable-key',
}));

const USER = {
  id: '0b6f0c1e-8f0e-4f0e-9a55-2a3f2d9c1b77',
  email: 'waquar@example.com',
  created_at: '2026-10-20T10:00:00.000Z',
  user_metadata: { display_name: 'Waquar' },
};

const SESSION = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: USER,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
});

describe('signUp', () => {
  it('passes the display name as metadata and returns a session', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { session: SESSION }, error: null });

    const session = await supabaseAuthService.signUp({
      displayName: '  Waquar ',
      email: ' Waquar@Example.com ',
      password: 'shaikhs2026',
    });

    expect(mockAuth.signUp).toHaveBeenCalledWith({
      email: 'waquar@example.com',
      password: 'shaikhs2026',
      options: { data: { display_name: 'Waquar' } },
    });
    expect(session.token).toBe('access-token');
    expect(session.user.displayName).toBe('Waquar');
    expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('asks the person to confirm when no session comes back', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { session: null }, error: null });

    await expect(
      supabaseAuthService.signUp({
        displayName: 'Waquar',
        email: 'waquar@example.com',
        password: 'shaikhs2026',
      }),
    ).rejects.toMatchObject({ code: 'email-confirmation-required' });
  });

  it('reports a taken email', async () => {
    mockAuth.signUp.mockResolvedValue({
      data: { session: null },
      error: { code: 'user_already_exists', message: 'User already registered' },
    });

    await expect(
      supabaseAuthService.signUp({
        displayName: 'Waquar',
        email: 'waquar@example.com',
        password: 'shaikhs2026',
      }),
    ).rejects.toMatchObject({ code: 'email-in-use' });
  });
});

describe('signIn', () => {
  it('returns a session for valid credentials', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null });

    const session = await supabaseAuthService.signIn({
      email: 'Waquar@Example.com',
      password: 'shaikhs2026',
    });

    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'waquar@example.com',
      password: 'shaikhs2026',
    });
    expect(session.user.email).toBe('waquar@example.com');
  });

  it('maps invalid credentials to the shared copy', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });

    await expect(
      supabaseAuthService.signIn({ email: 'waquar@example.com', password: 'wrongpass1' }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AuthError>>({
        code: 'invalid-credentials',
        message: 'Email or password is incorrect.',
      }),
    );
  });

  it('maps rate limiting to something a person can act on', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: 'over_request_rate_limit', message: 'Request rate limit reached' },
    });

    await expect(
      supabaseAuthService.signIn({ email: 'waquar@example.com', password: 'shaikhs2026' }),
    ).rejects.toMatchObject({
      code: 'unknown',
      message: 'Too many attempts. Wait a minute and try again.',
    });
  });
});

describe('restore', () => {
  it('returns null when nothing is stored', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    expect(await supabaseAuthService.restore()).toBeNull();
    expect(mockAuth.getUser).not.toHaveBeenCalled();
  });

  it('verifies the stored session against the server', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    mockAuth.getUser.mockResolvedValue({ data: { user: USER }, error: null });

    const restored = await supabaseAuthService.restore();

    expect(restored?.token).toBe('access-token');
    expect(restored?.user.displayName).toBe('Waquar');
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  it('clears a token the server no longer accepts', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } });
    mockAuth.signOut.mockResolvedValue({ error: null });

    expect(await supabaseAuthService.restore()).toBeNull();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('falls back to the email prefix when no display name was set', async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: { ...SESSION, user: { ...USER, user_metadata: {} } } },
      error: null,
    });
    mockAuth.getUser.mockResolvedValue({ data: { user: { ...USER, user_metadata: {} } }, error: null });

    const restored = await supabaseAuthService.restore();
    expect(restored?.user.displayName).toBe('waquar');
  });
});

describe('signOut', () => {
  it('signs out locally and never throws on failure', async () => {
    mockAuth.signOut.mockRejectedValueOnce(new Error('offline'));

    await expect(supabaseAuthService.signOut()).resolves.toBeUndefined();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('requestPasswordReset', () => {
  it('sends the reset email with the app deep link', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await supabaseAuthService.requestPasswordReset(' Waquar@Example.com ');

    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith('waquar@example.com', {
      redirectTo: 'shaikhs://reset-password',
    });
  });

  it('stays silent for unknown addresses', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: 'User not found' },
    });

    await expect(
      supabaseAuthService.requestPasswordReset('nobody@example.com'),
    ).resolves.toBeUndefined();
  });
});

describe('resetPassword', () => {
  it('exchanges the token, sets the password, then signs out locally', async () => {
    mockAuth.verifyOtp.mockResolvedValue({ data: { session: SESSION }, error: null });
    mockAuth.updateUser.mockResolvedValue({ data: { user: USER }, error: null });
    mockAuth.signOut.mockResolvedValue({ error: null });

    await supabaseAuthService.resetPassword({ token: 'recovery-token', password: 'newpass123' });

    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'recovery-token',
      type: 'recovery',
    });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' });
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('falls back to a PKCE code when the link carries one', async () => {
    mockAuth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: 'Token has expired or is invalid' },
    });
    mockAuth.exchangeCodeForSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    mockAuth.updateUser.mockResolvedValue({ data: { user: USER }, error: null });
    mockAuth.signOut.mockResolvedValue({ error: null });

    await supabaseAuthService.resetPassword({ token: '123e4567-e89b-12d3-a456-426614174000', password: 'newpass123' });

    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
    );
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' });
  });

  it('reports an expired link', async () => {
    mockAuth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: 'Token has expired or is invalid' },
    });
    mockAuth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'invalid flow state' },
    });

    await expect(
      supabaseAuthService.resetPassword({ token: 'stale', password: 'newpass123' }),
    ).rejects.toMatchObject({
      code: 'invalid-token',
      message: 'That reset link is invalid or has expired. Request a new one.',
    });

    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a password the server considers weak', async () => {
    mockAuth.verifyOtp.mockResolvedValue({ data: { session: SESSION }, error: null });
    mockAuth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'weak_password', message: 'Password should be at least 8 characters' },
    });

    await expect(
      supabaseAuthService.resetPassword({ token: 'good', password: 'short' }),
    ).rejects.toMatchObject({ code: 'weak-password' });
  });
});
