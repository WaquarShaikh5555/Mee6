/**
 * The unlock, as every screen sees it.
 *
 * One small module-level store rather than a React context, because the answer
 * is needed in three unrelated places — the catalogue's badges, a tool screen,
 * and the update flow does not touch it at all — and they mount and unmount as
 * pages come and go. A subscribe/notify pair keeps them agreeing without
 * wrapping the whole app in another provider.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  currentEntitlement,
  describeTimeLeft,
  grantUnlock,
  liveWindow,
  type Entitlement,
} from './entitlement';
import { adsAvailable, showRewarded, type WatchReason, type WatchResult } from './rewarded';
import { serverProUntil } from './serverPro';

/** Long enough for a slow connection, short enough that nobody waits forever. */
const WATCH_TIMEOUT_MS = 20_000;

type Snapshot = {
  /** Still reading storage, so nothing should blink. */
  loading: boolean;
  /** The window that is open now, if any. */
  until: number | null;
  unlocked: boolean;
  /** "47 hours left", for the line under the button. */
  left: string | null;
};

let cached: Entitlement | null = null;
let ready = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function snapshot(): Snapshot {
  const now = Date.now();
  const live = liveWindow(cached, now);

  // No ad SDK — the web preview, Expo Go, or a build where linking failed.
  // Nothing can be watched, so nothing can be charged for: the tools are open.
  // A gate with no way through it would be worse than no gate.
  const free = !adsAvailable();

  // Pro granted from the owner console. This is server truth, refreshed on
  // sign-in and revoked the moment the session ends, so it takes precedence
  // over nothing and is simply another way the window can be open.
  const granted = serverProUntil();
  const ownerPro = granted !== null && granted > now;
  const until = live?.until ?? (ownerPro ? granted : null);

  return {
    loading: !ready,
    until,
    unlocked: until !== null || free,
    left: until !== null ? describeTimeLeft(until, now) : null,
  };
}

/** Reads storage once, then only when asked. Safe to call repeatedly. */
export function refreshUnlock(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      cached = await currentEntitlement();
    } finally {
      ready = true;
      inFlight = null;
      notify();
    }
  })();

  return inFlight;
}

/**
 * The hook.
 *
 * `watching` covers the whole ad — the click, the loading, the video — so the
 * button can say what is happening instead of looking dead for ten seconds.
 */
export function useUnlock() {
  const [state, setState] = useState<Snapshot>(snapshot);
  const [watching, setWatching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reason, setReason] = useState<WatchReason>(null);

  useEffect(() => {
    const listener = () => setState(snapshot());
    listeners.add(listener);
    listener();

    void refreshUnlock();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const unlock = useCallback(async (): Promise<WatchResult> => {
    setWatching(true);
    setProblem(null);

    try {
      // A native call that never answers must not leave a disabled button on
      // screen. After this long, treat it exactly like a failed ad: grant the
      // window and say so. The worst case becomes "it took 20 seconds", never
      // "the button is dead".
      const { result, reason: why } = await Promise.race([
        showRewarded(),
        new Promise<{ result: WatchResult; reason: WatchReason }>((resolve) =>
          setTimeout(
            () => resolve({ result: 'failed', reason: { code: 'NO_ANSWER', message: '' } }),
            WATCH_TIMEOUT_MS,
          ),
        ),
      ]);
      setReason(why);

      if (result === 'closed') {
        setProblem('Closed before the end, so nothing changed. The button is here whenever you want it.');
        return result;
      }

      // `failed` and `unavailable` both grant: an ad that cannot be shown must
      // never stand between a person and their document.
      await grantUnlock(result === 'earned' ? 'reward' : 'grace');
      await refreshUnlock();

      if (result !== 'earned') {
        // Say what happened rather than "something went wrong": the code is
        // the difference between "AdMob has nothing for us yet" and "the app
        // is broken", and only one of those is worth a support message.
        const code = why?.code;
        const detail =
          code === 'NO_FILL'
            ? 'AdMob has no ad to serve for this app yet.'
            : code === 'INVALID_REQUEST'
              ? 'AdMob rejected the request — the ad unit is probably not a Rewarded one.'
              : code === 'INIT_FAILED'
                ? 'The ad library did not start.'
                : code
                  ? `AdMob said ${code}.`
                  : 'The ad did not arrive.';

        setProblem(`No ad could be shown — ${detail} Unlocked anyway, for 48 hours.`);
      }

      return result;
    } finally {
      setWatching(false);
    }
  }, []);

  return {
    ...state,
    /** No SDK here: say so plainly instead of offering a button that fails. */
    ads: adsAvailable(),
    watching,
    problem,
    /** The platform's reason, for anyone who asks or reports a problem. */
    reason,
    unlock,
  };
}
