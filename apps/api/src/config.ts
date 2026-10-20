/**
 * Runtime configuration, validated at boot.
 *
 * A missing or malformed variable kills the process immediately rather than
 * surfacing as a 500 on the first request. Secrets are never logged.
 */

import { z } from 'zod';

const booleanish = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8082),
  HOST: z.string().default('0.0.0.0'),

  /** Full connection string. Absent in development, where embedded PGlite is used. */
  DATABASE_URL: z.string().url().optional(),
  /** PGlite data directory, used only when DATABASE_URL is absent. */
  PGLITE_PATH: z.string().default('memory://'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  /** Comma-separated allowlist. Empty means "reflect the request origin" in development. */
  CORS_ORIGINS: z.string().default(''),

  /** Absolute lifetime of a session. Default 30 days. */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Lifetime of a password reset link. Default 60 minutes. */
  RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),

  /** Extra entropy mixed into stored IP hashes. Required in production. */
  IP_HASH_PEPPER: z.string().min(16).default('dev-only-pepper-change-me'),

  /**
   * Email delivery. `console` prints reset links to the log (development only).
   * `acs` uses Azure Communication Services Email in production.
   */
  EMAIL_TRANSPORT: z.enum(['console', 'acs']).default('console'),
  ACS_CONNECTION_STRING: z.string().optional(),
  ACS_SENDER_ADDRESS: z.string().optional(),
  APP_PUBLIC_URL: z.string().default('shaikhs://reset-password'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(10),
  TRUST_PROXY: booleanish,
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  const config = parsed.data;

  if (config.NODE_ENV === 'production') {
    if (!config.DATABASE_URL) {
      throw new Error('DATABASE_URL is required in production');
    }
    if (config.IP_HASH_PEPPER === 'dev-only-pepper-change-me') {
      throw new Error('IP_HASH_PEPPER must be set to a unique secret in production');
    }
    if (config.EMAIL_TRANSPORT === 'console') {
      // Not fatal — a project without email yet should still be deployable — but
      // make it impossible to miss in the logs.
      console.warn('[config] EMAIL_TRANSPORT=console in production: reset links will be logged, not sent');
    }
  }

  return config;
}

export function corsOrigins(config: Config): string[] | true {
  if (config.CORS_ORIGINS.trim() === '') {
    // Development convenience: the Expo web preview and device builds use many
    // origins. Production always sets an explicit list.
    return config.NODE_ENV === 'production' ? [] : true;
  }
  return config.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
