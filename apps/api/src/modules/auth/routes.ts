/**
 * HTTP surface for authentication.
 *
 * Request bodies are validated with zod and rejected with a stable error shape.
 * Every response is explicitly shaped — no database row is ever returned as-is,
 * so adding a column can never leak it.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { Config } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import type { AuthService, SessionPayload } from './service.js';

const signUpBody = z.object({
  email: z.string().min(3).max(320),
  password: z.string().min(1).max(1024),
  displayName: z.string().min(1).max(120),
});

const signInBody = z.object({
  email: z.string().min(3).max(320),
  password: z.string().min(1).max(1024),
});

const forgotBody = z.object({ email: z.string().min(3).max(320) });
const resetBody = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(1).max(1024),
});

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('invalid_request', 'Check the details and try again.');
  }
  return result.data;
}

function contextOf(request: FastifyRequest) {
  return {
    userAgent: request.headers['user-agent'],
    ip: request.ip,
  };
}

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme ?? '') || !token) return undefined;
  return token.trim();
}

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: { auth: AuthService; config: Config; sessionToJson?: (s: SessionPayload) => unknown },
): void {
  const authLimiter = {
    rateLimit: {
      max: deps.config.RATE_LIMIT_AUTH_PER_MINUTE,
      timeWindow: '1 minute',
    },
  };

  app.post('/v1/auth/signup', { config: authLimiter }, async (request, reply) => {
    const body = parse(signUpBody, request.body);
    const session = await deps.auth.signUp(body, contextOf(request));
    return reply.status(201).send(session);
  });

  app.post('/v1/auth/signin', { config: authLimiter }, async (request) => {
    const body = parse(signInBody, request.body);
    return deps.auth.signIn(body, contextOf(request));
  });

  app.get('/v1/auth/session', async (request) => {
    const { user, expiresAt } = await deps.auth.authenticate(bearerToken(request));
    return { user, expiresAt: expiresAt.toISOString() };
  });

  app.post('/v1/auth/signout', async (request, reply) => {
    const { sessionId } = await deps.auth.authenticate(bearerToken(request));
    await deps.auth.signOut(sessionId);
    return reply.status(204).send();
  });

  // Always 202 with an identical body, so the response cannot reveal whether the
  // address has an account.
  app.post('/v1/auth/password/forgot', { config: authLimiter }, async (request, reply) => {
    const body = parse(forgotBody, request.body);
    await deps.auth.requestPasswordReset(body.email);
    return reply.status(202).send({ status: 'accepted' });
  });

  app.post('/v1/auth/password/reset', { config: authLimiter }, async (request, reply) => {
    const body = parse(resetBody, request.body);
    await deps.auth.resetPassword(body);
    return reply.status(204).send();
  });
}

export { bearerToken };
