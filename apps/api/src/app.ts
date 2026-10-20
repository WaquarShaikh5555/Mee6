/**
 * Builds the Fastify instance. Exported separately from `index.ts` so tests can
 * construct an app with an in-memory database and use `app.inject()` — real
 * routing, real serialisation, real hooks, no sockets.
 */

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';

import { corsOrigins, type Config } from './config.js';
import type { DatabaseHandle } from './db/client.js';
import type { EmailSender } from './lib/email.js';
import { registerErrorHandler } from './lib/errors.js';
import { AuthService } from './modules/auth/service.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerMeRoutes } from './modules/me/routes.js';

export type AppDependencies = {
  config: Config;
  handle: DatabaseHandle;
  email: EmailSender;
  /** Suppressed in tests so log output stays readable. */
  logger?: boolean;
};

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const { config, handle, email } = deps;

  const app = Fastify({
    logger:
      deps.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            // Anything that could identify a person or a credential is stripped.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.token',
                'res.headers["set-cookie"]',
              ],
              censor: '[redacted]',
            },
            transport:
              config.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
                : undefined,
          },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
    // Trailing slashes are a common source of 404s between client and server.
    routerOptions: { ignoreTrailingSlash: true },
  });

  await app.register(helmet, {
    // The API serves JSON to a mobile client, not pages.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: corsOrigins(config),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });

  await app.register(rateLimit, {
    global: false,
    // Per-route limits are set on the auth endpoints; this is the fallback.
    max: 240,
    timeWindow: '1 minute',
  });

  registerErrorHandler(app);

  const auth = new AuthService(handle, config, email);

  app.get('/health', async (_request, reply) => {
    let database: 'up' | 'down' = 'up';
    try {
      await handle.query('select 1');
    } catch {
      database = 'down';
    }

    // 503 when the database is unreachable: the container platform uses this
    // endpoint as its readiness probe and must stop routing traffic to a pod
    // that cannot serve a single request.
    reply.code(database === 'up' ? 200 : 503);

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      version: process.env.APP_VERSION ?? '0.1.0',
      database,
      store: handle.kind,
      time: new Date().toISOString(),
    };
  });

  registerAuthRoutes(app, { auth, config });
  registerMeRoutes(app, { auth });

  app.addHook('onClose', async () => {
    await handle.close();
  });

  return app;
}
