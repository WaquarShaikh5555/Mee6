/**
 * Persisted session storage, shared by every `AuthService` implementation.
 *
 * A session is only trusted when it survives a shape check and has not passed
 * its expiry. Anything else is deleted rather than surfaced to the UI, so a
 * corrupted or stale record degrades to "signed out" instead of a crash.
 */

import { storage } from '@/lib/storage';

import type { Session } from './types';

/** Same key the demo service always used, so upgrading keeps the user signed in. */
export const SESSION_STORAGE_KEY = 'shaikhs.session.v1';

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Session>;
  return (
    typeof candidate.token === 'string' &&
    candidate.token.length > 0 &&
    typeof candidate.expiresAt === 'string' &&
    typeof candidate.user === 'object' &&
    candidate.user !== null &&
    typeof candidate.user.email === 'string' &&
    typeof candidate.user.id === 'string'
  );
}

export async function readSession(): Promise<Session | null> {
  const raw = await storage.get(SESSION_STORAGE_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await clearSession();
    return null;
  }

  if (!isSession(parsed) || new Date(parsed.expiresAt).getTime() <= Date.now()) {
    await clearSession();
    return null;
  }

  return parsed;
}

export async function writeSession(session: Session): Promise<Session> {
  await storage.set(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export async function clearSession(): Promise<void> {
  await storage.remove(SESSION_STORAGE_KEY);
}
