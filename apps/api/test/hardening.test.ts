/**
 * Rate limiting and header hardening, verified with a deliberately low limit.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestContext, VALID_USER, type TestContext } from './helpers.js';

let context: TestContext;

beforeAll(async () => {
  context = await createTestContext({ RATE_LIMIT_AUTH_PER_MINUTE: '3' });
});

afterAll(async () => {
  await context.close();
});

describe('rate limiting', () => {
  it('stops a credential-stuffing burst on sign-in', async () => {
    const attempt = () =>
      context.app.inject({
        method: 'POST',
        url: '/v1/auth/signin',
        payload: { email: VALID_USER.email, password: 'guessing-1' },
      });

    const first = await attempt();
    await attempt();
    await attempt();
    const limited = await attempt();

    expect(first.statusCode).not.toBe(429);
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('rate_limited');
  });

  it('applies to sign-up as well', async () => {
    // @fastify/rate-limit keeps one bucket per route, so this endpoint starts
    // fresh even though sign-in is already exhausted.
    const attempt = (index: number) =>
      context.app.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: { ...VALID_USER, email: `burst${index}-${Date.now()}@example.com` },
      });

    const statuses = [];
    for (let index = 0; index < 4; index += 1) {
      statuses.push((await attempt(index)).statusCode);
    }

    expect(statuses.slice(0, 3).every((status) => status !== 429)).toBe(true);
    expect(statuses[3]).toBe(429);
  });

  it('leaves unauthenticated reads of other routes alone', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });
});

describe('security headers', () => {
  it('sets the helmet defaults on every response', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['strict-transport-security']).toBeDefined();
  });

  it('does not advertise the framework', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
