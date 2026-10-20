/**
 * One error type for everything the client is allowed to see, plus the handler
 * that turns it into a response.
 *
 * Rules: the client gets a stable machine-readable `code` and a human `message`;
 * everything else (stack traces, SQL, internal identifiers) is logged, never sent.
 */

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export type ErrorCode =
  | 'invalid_request'
  | 'invalid_credentials'
  | 'email_in_use'
  | 'weak_password'
  | 'invalid_email'
  | 'unauthorized'
  | 'session_expired'
  | 'not_found'
  | 'rate_limited'
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  invalid_credentials: 401,
  email_in_use: 409,
  weak_password: 422,
  invalid_email: 422,
  unauthorized: 401,
  session_expired: 401,
  not_found: 404,
  rate_limited: 429,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Extra fields safe to expose, e.g. per-field validation messages. */
  readonly details?: Record<string, string>;

  constructor(code: ErrorCode, message: string, details?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const unauthorized = (message = 'Sign in to continue.') =>
  new AppError('unauthorized', message);

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      // Expected, handled failure: log at info without the request body.
      request.log.info({ code: error.code, path: request.url }, 'request rejected');
      return reply.status(error.status).send({
        error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
      });
    }

    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'rate_limited', message: 'Too many attempts. Try again in a minute.' },
      });
    }

    if (error.validation || error.statusCode === 400) {
      return reply.status(400).send({
        error: { code: 'invalid_request', message: 'The request could not be read.' },
      });
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({
      error: { code: 'internal', message: 'Something went wrong on our side.' },
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: { code: 'not_found', message: `No route for ${request.method} ${request.url}` },
    }),
  );
}
