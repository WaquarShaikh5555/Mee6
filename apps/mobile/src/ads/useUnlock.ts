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
import { adsAvailable, showRewarded, type WatchResult } from './rewarded';

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

  return {
    loading: !ready,
    until: live?.until ?? null,
    unlocked: live !== null || free,
    left: live ? describeTimeLeft(live.until, now) : null,
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
      const result = await showRewarded();

      if (result === 'closed') {
        setProblem('Closed before the end, so nothing changed. The button is here whenever you want it.');
        return result;
      }

      // `failed` and `unavailable` both grant: an ad that cannot be shown must
      // never stand between a person and their document.
      await grantUnlock(result === 'earned' ? 'reward' : 'grace');
      await refreshUnlock();

      if (result !== 'earned') {
        setProblem('No ad could be shown just now — unlocked anyway. That is on us, not you.');
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
    unlock,
  };
}
