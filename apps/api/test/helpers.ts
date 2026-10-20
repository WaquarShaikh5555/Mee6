/**
 * Test harness.
 *
 * Each suite gets its own embedded PostgreSQL database and a real Fastify
 * instance, exercised through `app.inject()` — same routing, hooks, serialisers
 * and error handler as production, without binding a port.
 */

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createDatabase, type DatabaseHandle } from '../src/db/client.js';
import { migrate } from '../src/db/migrate.js';
import type { EmailMessage, EmailSender } from '../src/lib/email.js';

export type TestContext = {
  app: FastifyInstance;
  handle: DatabaseHandle;
  config: Config;
  /** Every email the service tried to send, in order. */
  outbox: EmailMessage[];
  close(): Promise<void>;
};

export async function createTestContext(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    PGLITE_PATH: 'memory://',
    IP_HASH_PEPPER: 'test-pepper-0123456789',
    // Every request in a suite shares one injected IP; the limiter has its own
    // dedicated test rather than throttling unrelated assertions.
    RATE_LIMIT_AUTH_PER_MINUTE: '10000',
    ...overrides,
  });

  const handle = await createDatabase({ pglitePath: 'memory://' });
  await migrate(handle);

  const outbox: EmailMessage[] = [];
  const email: EmailSender = {
    kind: 'console',
    async send(message) {
      outbox.push(message);
    },
  };

  const app = await buildApp({ config, handle, email, logger: false });

  return {
    app,
    handle,
    config,
    outbox,
    async close() {
      await app.close();
    },
  };
}

/**
 * Empties all application tables. Schema creation is the expensive part of a
 * fixture (roughly 1.8s), so suites build the database once and reset rows
 * between tests instead.
 */
export async function resetData(context: TestContext): Promise<void> {
  await context.handle.query('truncate table password_reset_tokens, sessions, users cascade');
  context.outbox.length = 0;
}

/** Extracts the raw token from the reset link in the most recent email. */
export function tokenFromLastEmail(outbox: EmailMessage[]): string {
  const message = outbox.at(-1);
  if (!message) throw new Error('no email was sent');
  const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(message.text);
  if (!match?.[1]) throw new Error(`no token in email: ${message.text}`);
  return match[1];
}

export const VALID_USER = {
  email: 'waquar@example.com',
  password: 'shaikhs2026',
  displayName: 'Waquar',
} as const;

/** Signs up and returns the session payload plus a ready-made auth header. */
export async function signUp(
  context: TestContext,
  overrides: Partial<typeof VALID_USER> = {},
): Promise<{ token: string; user: { id: string; email: string }; headers: Record<string, string> }> {
  const response = await context.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: { ...VALID_USER, ...overrides },
  });

  if (response.statusCode !== 201) {
    throw new Error(`signup failed: ${response.statusCode} ${response.body}`);
  }

  const body = response.json() as { token: string; user: { id: string; email: string } };
  return {
    token: body.token,
    user: body.user,
    headers: { authorization: `Bearer ${body.token}` },
  };
}
