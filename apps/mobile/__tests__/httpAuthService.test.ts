/**
 * Contract tests for the production auth service.
 *
 * `fetch` is stubbed, so these assert exactly what crosses the wire: paths,
 * bodies, bearer tokens, error-code mapping, and what happens to the stored
 * session on every branch.
 */

import { httpAuthService, isApiConfigured } from '@/auth/httpAuthService';
import { readSession, writeSession } from '@/auth/sessionStore';
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

const fetchMock = jest.fn();
const realFetch = global.fetch;
const realApiUrl = process.env.EXPO_PUBLIC_API_URL;

const USER = {
  id: '5f0c1f8e-1c7a-4c19-9b0e-3f0b8a2e6d11',
  email: 'waquar@example.com',
  displayName: 'Waquar',
  createdAt: '2026-10-20T10:00:00.000Z',
};

const SESSION = {
  token: 'stored-token',
  user: USER,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

function respond(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
  if (realApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = realApiUrl;
});

beforeEach(() => {
  mockStore.clear();
  fetchMock.mockReset();
  process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test/';
});

describe('configuration', () => {
  it('reports whether an API address is present', () => {
    expect(isApiConfigured()).toBe(true);
    delete process.env.EXPO_PUBLIC_API_URL;
    expect(isApiConfigured()).toBe(false);
  });

  it('refuses to make requests without an address', async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    await expect(httpAuthService.signIn({ email: 'a@b.co', password: 'abcdefg1' })).rejects.toMatchObject({
      code: 'network',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('signIn', () => {
  it('posts to the API, stores the session, and returns the user', async () => {
    fetchMock.mockResolvedValueOnce(
      respond(200, { token: 'fresh-token', user: USER, expiresAt: SESSION.expiresAt }),
    );

    const session = await httpAuthService.signIn({
      email: '  Waquar@Example.com ',
      password: 'shaikhs2026',
    });

    expect(session.token).toBe('fresh-token');
    expect(session.user.email).toBe('waquar@example.com');
    expect(await readSession()).toMatchObject({ token: 'fresh-token' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/v1/auth/signin');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      email: 'waquar@example.com',
      password: 'shaikhs2026',
    });
  });

  it('maps invalid credentials to the app contract', async () => {
    fetchMock.mockResolvedValueOnce(
      respond(401, errorBody('invalid_credentials', 'Email or password is incorrect.')),
    );

    await expect(
      httpAuthService.signIn({ email: 'waquar@example.com', password: 'wrongpass1' }),
    ).rejects.toEqual(expect.objectContaining<Partial<AuthError>>({
      name: 'AuthError',
      code: 'invalid-credentials',
      message: 'Email or password is incorrect.',
    }));

    expect(await readSession()).toBeNull();
  });

  it('maps a rate limit response to friendly copy', async () => {
    fetchMock.mockResolvedValueOnce(respond(429, errorBody('rate_limited', 'Too many requests.')));

    await expect(
      httpAuthService.signIn({ email: 'waquar@example.com', password: 'shaikhs2026' }),
    ).rejects.toMatchObject({
      code: 'unknown',
      message: 'Too many attempts. Wait a minute and try again.',
    });
  });

  it('maps an unreachable server to a network error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(
      httpAuthService.signIn({ email: 'waquar@example.com', password: 'shaikhs2026' }),
    ).rejects.toMatchObject({ code: 'network' });
  });
});

describe('signUp', () => {
  it('surfaces a taken email', async () => {
    fetchMock.mockResolvedValueOnce(
      respond(409, errorBody('email_in_use', 'An account already uses that email.')),
    );

    await expect(
      httpAuthService.signUp({
        displayName: 'Waquar',
        email: 'waquar@example.com',
        password: 'shaikhs2026',
      }),
    ).rejects.toMatchObject({ code: 'email-in-use' });
  });

  it('surfaces a weak password', async () => {
    fetchMock.mockResolvedValueOnce(
      respond(422, errorBody('weak_password', 'Use at least 8 characters.')),
    );

    await expect(
      httpAuthService.signUp({ displayName: 'Waquar', email: 'w@example.com', password: 'short' }),
    ).rejects.toMatchObject({ code: 'weak-password', message: 'Use at least 8 characters.' });
  });
});

describe('restore', () => {
  it('returns null when nothing is stored', async () => {
    expect(await httpAuthService.restore()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verifies the token with the server and refreshes the expiry', async () => {
    await writeSession(SESSION);
    const later = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    fetchMock.mockResolvedValueOnce(respond(200, { user: USER, expiresAt: later }));

    const restored = await httpAuthService.restore();

    expect(restored?.token).toBe('stored-token');
    expect(restored?.expiresAt).toBe(later);
    expect(await readSession()).toMatchObject({ expiresAt: later });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/v1/auth/session');
    expect(init.headers.authorization).toBe('Bearer stored-token');
  });

  it('clears a revoked token', async () => {
    await writeSession(SESSION);
    fetchMock.mockResolvedValueOnce(respond(401, errorBody('unauthorized', 'Signed out.')));

    expect(await httpAuthService.restore()).toBeNull();
    expect(await readSession()).toBeNull();
  });

  it('keeps the session when the device is offline', async () => {
    await writeSession(SESSION);
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    const restored = await httpAuthService.restore();
    expect(restored?.token).toBe('stored-token');
    expect(await readSession()).not.toBeNull();
  });

  it('drops an already expired local session without calling the server', async () => {
    await writeSession({ ...SESSION, expiresAt: new Date(Date.now() - 1000).toISOString() });

    expect(await httpAuthService.restore()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('revokes the token and clears local storage', async () => {
    await writeSession(SESSION);
    fetchMock.mockResolvedValueOnce(respond(204));

    await httpAuthService.signOut();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/v1/auth/signout');
    expect(init.headers.authorization).toBe('Bearer stored-token');
    expect(await readSession()).toBeNull();
  });

  it('still clears locally when the server is unreachable', async () => {
    await writeSession(SESSION);
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(httpAuthService.signOut()).resolves.toBeUndefined();
    expect(await readSession()).toBeNull();
  });

  it('does not call the server without a stored session', async () => {
    await httpAuthService.signOut();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('resetPassword', () => {
  it('posts the token and password, then drops the local session', async () => {
    await writeSession(SESSION);
    fetchMock.mockResolvedValueOnce(respond(204));

    await httpAuthService.resetPassword({ token: 'reset-token', password: 'newpass123' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/v1/auth/password/reset');
    expect(JSON.parse(init.body)).toEqual({ token: 'reset-token', password: 'newpass123' });
    expect(await readSession()).toBeNull();
  });

  it('reports a used or expired token', async () => {
    fetchMock.mockResolvedValueOnce(
      respond(400, errorBody('invalid_request', 'That reset link is invalid or has expired.')),
    );

    await expect(
      httpAuthService.resetPassword({ token: 'stale', password: 'newpass123' }),
    ).rejects.toMatchObject({
      code: 'invalid-token',
      message: 'That reset link is invalid or has expired.',
    });
  });
});

describe('requestPasswordReset', () => {
  it('posts the address and resolves on 202', async () => {
    fetchMock.mockResolvedValueOnce(respond(202, { status: 'accepted' }));

    await expect(
      httpAuthService.requestPasswordReset('  Waquar@Example.com '),
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/v1/auth/password/forgot');
    expect(JSON.parse(init.body)).toEqual({ email: 'waquar@example.com' });
  });
});
