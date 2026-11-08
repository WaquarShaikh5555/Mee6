import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createTestContext,
  resetData,
  signUp,
  tokenFromLastEmail,
  VALID_USER,
  type TestContext,
} from './helpers.js';

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext();
});

afterAll(async () => {
  await context.close();
});

beforeEach(async () => {
  await resetData(context);
});

describe('health', () => {
  it('reports the database as reachable', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', database: 'up', store: 'pglite' });
  });
});

describe('sign up', () => {
  it('creates an account and returns a usable session', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: VALID_USER,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(body.user).toMatchObject({ email: 'waquar@example.com', displayName: 'Waquar' });
    expect(body.user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('normalises the email address', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...VALID_USER, email: '  WAQUAR@Example.COM ' },
    });
    expect(response.json().user.email).toBe('waquar@example.com');
  });

  it('rejects a duplicate address regardless of case', async () => {
    await signUp(context);
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...VALID_USER, email: 'WAQUAR@example.com' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('email_in_use');
  });

  it('rejects a password under the minimum length', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...VALID_USER, password: 'abc12' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('weak_password');
    expect(context.outbox).toHaveLength(0);
  });

  it('rejects a password with no digits', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...VALID_USER, password: 'onlyletters' },
    });
    expect(response.json().error.code).toBe('weak_password');
  });

  it('rejects a malformed email address', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...VALID_USER, email: 'not-an-email' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('invalid_email');
  });

  it('rejects a missing body without leaking internals', async () => {
    const response = await context.app.inject({ method: 'POST', url: '/v1/auth/signup' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('invalid_request');
    expect(response.body).not.toContain('at Object');
  });
});

describe('sign in', () => {
  it('returns a session for correct credentials', async () => {
    await signUp(context);
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signin',
      payload: { email: VALID_USER.email, password: VALID_USER.password },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe(VALID_USER.email);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    await signUp(context);

    const wrongPassword = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signin',
      payload: { email: VALID_USER.email, password: 'wrong-password-1' },
    });

    const unknownAccount = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signin',
      payload: { email: 'nobody@example.com', password: 'wrong-password-1' },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownAccount.statusCode).toBe(401);
    // Identical code and wording: nothing to enumerate here.
    expect(wrongPassword.json()).toEqual(unknownAccount.json());
    expect(wrongPassword.json().error.message).toBe('Email or password is incorrect.');
  });

  it('does not admit a deleted account', async () => {
    const session = await signUp(context);

    await context.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: session.headers,
      payload: { password: VALID_USER.password },
    });

    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signin',
      payload: { email: VALID_USER.email, password: VALID_USER.password },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('sessions', () => {
  it('resolves the current user from a bearer token', async () => {
    const session = await signUp(context);
    const response = await context.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: session.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.id).toBe(session.user.id);
  });

  it('rejects a request with no token', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/v1/auth/session' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a forged token', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('stores only a hash of the token', async () => {
    const session = await signUp(context);
    const rows = await context.handle.query<{ token_hash: string }>('select token_hash from sessions');

    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toBe(session.token);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signs out and revokes the token immediately', async () => {
    const session = await signUp(context);

    const signOut = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signout',
      headers: session.headers,
    });
    expect(signOut.statusCode).toBe(204);

    const after = await context.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: session.headers,
    });
    expect(after.statusCode).toBe(401);
    expect(after.json().error.message).toBe('This session was signed out.');
  });

  it('expires a session whose time is up', async () => {
    const session = await signUp(context);

    // Move the expiry into the past, as a month of wall-clock time would.
    await context.handle.query(
      `update sessions set expires_at = now() - interval '1 minute' where token_hash is not null`,
    );

    const response = await context.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: session.headers,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('session_expired');
  });
});

describe('password reset', () => {
  it('accepts a request and sends a link for a known account', async () => {
    await signUp(context);
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: VALID_USER.email },
    });

    expect(response.statusCode).toBe(202);
    expect(context.outbox).toHaveLength(1);
    expect(context.outbox[0]!.to).toBe(VALID_USER.email);
    expect(tokenFromLastEmail(context.outbox)).toBeTruthy();
  });

  it('answers identically for an unknown account and sends nothing', async () => {
    const known = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: 'ghost@example.com' },
    });

    expect(known.statusCode).toBe(202);
    expect(known.json()).toEqual({ status: 'accepted' });
    expect(context.outbox).toHaveLength(0);
  });

  it('completes the reset, changes the password, and signs every device out', async () => {
    const session = await signUp(context);
    await context.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: VALID_USER.email },
    });
    const token = tokenFromLastEmail(context.outbox);

    const reset = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, password: 'brandnew2026' },
    });
    expect(reset.statusCode).toBe(204);

    // The session that existed before the reset is dead.
    const oldSession = await context.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: session.headers,
    });
    expect(oldSession.statusCode).toBe(401);

    const oldPassword = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signin',
      payload: { email: VALID_USER.email, password: VALID_USER.password },
    });
    expect(oldPassword.statusCode).toBe(401);

    const newPassword = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signin',
      payload: { email: VALID_USER.email, password: 'brandnew2026' },
    });
    expect(newPassword.statusCode).toBe(200);
  });

  it('refuses a token that has already been used', async () => {
    await signUp(context);
    await context.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: VALID_USER.email },
    });
    const token = tokenFromLastEmail(context.outbox);

    await context.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, password: 'brandnew2026' },
    });

    const replay = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, password: 'another2026' },
    });
    expect(replay.statusCode).toBe(400);
  });

  it('refuses an expired token', async () => {
    await signUp(context);
    await context.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: VALID_USER.email },
    });
    const token = tokenFromLastEmail(context.outbox);

    await context.handle.query(`update password_reset_tokens set expires_at = now() - interval '1 hour'`);

    const reset = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, password: 'brandnew2026' },
    });
    expect(reset.statusCode).toBe(400);
    expect(reset.json().error.message).toMatch(/invalid or has expired/);
  });

  it('enforces password rules on reset too', async () => {
    await signUp(context);
    await context.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: VALID_USER.email },
    });

    const reset = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token: tokenFromLastEmail(context.outbox), password: 'short' },
    });
    expect(reset.statusCode).toBe(422);
  });
});

describe('profile', () => {
  it('returns the signed-in user', async () => {
    const session = await signUp(context);
    const response = await context.app.inject({ method: 'GET', url: '/v1/me', headers: session.headers });
    expect(response.json().user.email).toBe(VALID_USER.email);
  });

  it('updates the display name', async () => {
    const session = await signUp(context);
    const response = await context.app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: session.headers,
      payload: { displayName: 'Waquar S.' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.displayName).toBe('Waquar S.');
  });

  it('rejects a one-character name', async () => {
    const session = await signUp(context);
    const response = await context.app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: session.headers,
      payload: { displayName: 'W' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('account deletion', () => {
  it('requires the correct password', async () => {
    const session = await signUp(context);
    const response = await context.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: session.headers,
      payload: { password: 'not-my-password-1' },
    });

    expect(response.statusCode).toBe(401);
    // Still signed in: a failed attempt must not log the user out.
    const stillValid = await context.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: session.headers,
    });
    expect(stillValid.statusCode).toBe(200);
  });

  it('soft-deletes, revokes sessions, and frees the email address', async () => {
    const session = await signUp(context);

    const deleted = await context.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: session.headers,
      payload: { password: VALID_USER.password },
    });
    expect(deleted.statusCode).toBe(204);

    const rows = await context.handle.query<{ deleted_at: string | null }>('select deleted_at from users');
    expect(rows[0]!.deleted_at).not.toBeNull();

    const sessionAfter = await context.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: session.headers,
    });
    expect(sessionAfter.statusCode).toBe(401);

    // The address can be registered again — required by App Store rules.
    const recreated = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: VALID_USER,
    });
    expect(recreated.statusCode).toBe(201);
  });
});

describe('input hardening', () => {
  it('ignores a SQL injection attempt in the email field', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signin',
      payload: { email: "' or 1=1 --", password: 'whatever1' },
    });

    expect(response.statusCode).toBe(401);
    const rows = await context.handle.query<{ count: string }>('select count(*)::text as count from users');
    expect(rows[0]!.count).toBe('0');
  });

  it('rejects an oversized body', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...VALID_USER, displayName: 'x'.repeat(200_000) },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('never echoes the password back', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/auth/signin',
      payload: { email: VALID_USER.email, password: 'wrong-password-1' },
    });
    expect(response.body).not.toContain('wrong-password-1');
  });

  it('returns 404 for an unknown route in the same shape', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/v1/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });
});
