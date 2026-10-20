/**
 * Opaque bearer tokens.
 *
 * 256 bits of CSPRNG output, base64url encoded. The database stores only a
 * SHA-256 of the token, so a dump of `sessions` cannot be replayed, and lookup
 * remains a single indexed read.
 *
 * Opaque tokens rather than JWTs, deliberately: revocation is a row update
 * instead of a blocklist, there is no signing key to rotate or leak, and the
 * client gains nothing from being able to read its own claims.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;

export function createToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison for values we already hold. */
export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Salted, truncated hash of a client IP.
 *
 * Lets us notice "200 sign-ins from one address" without keeping a log of where
 * users are. Not reversible without the pepper.
 */
export function hashIp(ip: string | undefined, pepper: string): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`${pepper}:${ip}`, 'utf8').digest('hex').slice(0, 32);
}

export function addDays(days: number, from = new Date()): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addMinutes(minutes: number, from = new Date()): Date {
  return new Date(from.getTime() + minutes * 60 * 1000);
}
