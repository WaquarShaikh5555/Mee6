/**
 * The 48-hour unlock, and how it is remembered.
 *
 * One ad opens everything for two days. The alternative — a subscription — asks
 * for a card for a PDF tool used twice a month; the alternative on the other
 * side — gating every single action — turns an app into a toll booth. Two days
 * per ad means a regular user sees roughly one ad a fortnight.
 *
 * The window is stored on the phone, not on a server: there is no account
 * requirement for any of this, and a document tool that phones home to check
 * whether you may rotate a page would be a worse product.
 *
 * Honest about its limits: a determined person can change the clock. The point
 * is to make paying attention the easy path, not to fight the tiny number who
 * will not.
 */

import * as SecureStore from 'expo-secure-store';

import { UNLOCK_HOURS } from './config';

const KEY = 'shaikhs.unlock.until';

export type Entitlement = {
  /** Unix milliseconds when the window closes. */
  until: number;
  /** When the window first opened. Extensions keep this, not the last grant. */
  grantedAt: number;
  /**
   * How many hours were bought in total, in multiples of one ad.
   *
   * Stored rather than derived so the record can be checked against itself: a
   * window whose length does not match what was granted was edited, and is
   * thrown away. Without it, a "second ad extends the window" feature and a
   * "the clock moved" guard contradict each other.
   */
  hours: number;
  /** `reward` for a finished ad, `grace` when no ad could be shown. */
  reason: 'reward' | 'grace';
};

/** One unlock, measured from `now`. Pure, so the arithmetic can be tested. */
export function windowFrom(now: number, hours = UNLOCK_HOURS): Entitlement {
  return {
    until: now + hours * 60 * 60 * 1000,
    grantedAt: now,
    hours,
    reason: 'reward',
  };
}

/**
 * Reads a stored record, keeping it only if it is still in the future.
 *
 * A record from the future by more than the window means the clock was moved
 * forwards and back; it is treated as expired rather than trusted.
 */
export function liveWindow(record: Entitlement | null, now: number): Entitlement | null {
  if (!record) return null;
  if (!Number.isFinite(record.until) || !Number.isFinite(record.grantedAt)) return null;
  if (!Number.isFinite(record.hours) || record.hours < UNLOCK_HOURS) return null;
  if (record.hours % UNLOCK_HOURS !== 0) return null;
  if (record.until <= now) return null;

  // What was granted has to match what the record claims to be.
  const span = record.until - record.grantedAt;
  const granted = record.hours * 60 * 60 * 1000;

  return Math.abs(span - granted) > 60 * 1000 ? null : record;
}

/** "47 hours left", "20 minutes left" — short, and never a raw timestamp. */
export function describeTimeLeft(until: number, now: number): string {
  const left = until - now;
  if (left <= 0) return 'Expired';

  const minutes = Math.ceil(left / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} left`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} left`;

  return `${Math.round(hours / 24)} days left`;
}

/* ---------------------------------------------------------------- storage --- */

/**
 * Secure storage is right for this: it is the one thing on the phone worth not
 * letting another app rewrite. It is also unavailable in the web preview, so
 * every call is guarded — a missing store must degrade to "nothing saved", not
 * to a crash on the first tap.
 */
async function read(): Promise<Entitlement | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Entitlement>;
    if (typeof parsed.until !== 'number' || typeof parsed.grantedAt !== 'number') return null;

    return {
      until: parsed.until,
      grantedAt: parsed.grantedAt,
      hours: typeof parsed.hours === 'number' ? parsed.hours : UNLOCK_HOURS,
      reason: parsed.reason === 'grace' ? 'grace' : 'reward',
    };
  } catch {
    return null;
  }
}

async function write(record: Entitlement): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(record));
  } catch {
    // The window still applies for this session; only persistence is lost.
  }
}

/** The window that is open right now, or null. */
export async function currentEntitlement(now = Date.now()): Promise<Entitlement | null> {
  return liveWindow(await read(), now);
}

/**
 * Opens the window.
 *
 * A second unlock while one is running *extends* rather than resets, so
 * watching an ad out of enthusiasm is never a punishment. The extension is
 * capped: the window can grow, but only by the hours that were actually
 * granted.
 */
export async function grantUnlock(
  reason: Entitlement['reason'] = 'reward',
  now = Date.now(),
): Promise<Entitlement> {
  const existing = await currentEntitlement(now);

  const next: Entitlement = existing
    ? {
        until: existing.until + UNLOCK_HOURS * 60 * 60 * 1000,
        grantedAt: existing.grantedAt,
        hours: existing.hours + UNLOCK_HOURS,
        reason,
      }
    : { ...windowFrom(now), reason };

  await write(next);
  return next;
}

/** For tests and for "start over" in a future build. */
export async function forgetUnlock(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing stored is the same outcome.
  }
}
