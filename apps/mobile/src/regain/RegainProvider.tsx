/**
 * Holds Regain's state for the app and keeps it on the device.
 *
 * The provider is deliberately thin: every decision about what is blocked lives
 * in `store.ts` as a pure function, and persistence is the same `storage`
 * adapter the session uses (Keychain / Keystore on a device, localStorage in the
 * preview).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { storage } from '@/lib/storage';

import { findApp, type RegainApp } from './catalog';
import { syncRules } from './enforcement';
import {
  activeApps,
  blockedSectionsFor,
  createDefaultState,
  interventionsToday,
  isSectionBlocked,
  parseState,
  recordIntervention,
  REGAIN_STORAGE_KEY,
  serializeState,
  setEnabled as setEnabledPure,
  toggleSection as toggleSectionPure,
  totalBlockedSections,
  type RegainState,
} from './store';

type RegainContextValue = {
  /** False until the stored state has been read; screens show a quiet placeholder. */
  isReady: boolean;
  enabled: boolean;
  state: RegainState;
  /** Apps with at least one blocked section. */
  apps: RegainApp[];
  blockedSectionCount: number;
  todayCount: number;
  setEnabled: (enabled: boolean) => void;
  toggleSection: (appId: string, sectionId: string) => void;
  isBlocked: (appId: string, sectionId: string) => boolean;
  blockedSections: (appId: string) => string[];
  recordIntervention: () => void;
  resetRules: () => void;
};

const RegainContext = createContext<RegainContextValue | null>(null);

export function RegainProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RegainState>(createDefaultState);
  const [isReady, setIsReady] = useState(false);

  /**
   * Set by any change made before the stored state finished loading.
   *
   * Reading storage is asynchronous, so a fast interaction — or a blocked
   * screen that counts its own arrival on mount — can land first. Without this
   * guard the load would overwrite it with what was saved a moment ago.
   */
  const changedBeforeLoad = useRef(false);

  // Load once. A missing or corrupt record falls back to defaults rather than
  // blocking the app behind an error.
  useEffect(() => {
    let cancelled = false;

    storage
      .get(REGAIN_STORAGE_KEY)
      .then((raw) => {
        if (!cancelled && !changedBeforeLoad.current) setState(parseState(raw));
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every change, but never before the first read: writing defaults
  // over unread state would erase the person's rules on every launch.
  useEffect(() => {
    if (!isReady) return;
    void storage.set(REGAIN_STORAGE_KEY, serializeState(state));
  }, [isReady, state]);

  /**
   * The phone enforces the rules, not this process: the accessibility service
   * has to keep working when the app is closed. So every change is mirrored to
   * native storage. On the web, or in Expo Go, `syncRules` is a no-op.
   */
  useEffect(() => {
    if (!isReady) return;

    const rules = Object.entries(state.rules).map(([appId, sections]) => ({ appId, sections }));
    void syncRules(rules, state.enabled);
  }, [isReady, state]);

  const setEnabled = useCallback((enabled: boolean) => {
    changedBeforeLoad.current = true;
    setState((current) => setEnabledPure(current, enabled));
  }, []);

  const toggleSection = useCallback((appId: string, sectionId: string) => {
    const app = findApp(appId);
    if (!app) return;
    changedBeforeLoad.current = true;
    setState((current) => toggleSectionPure(current, app, sectionId));
  }, []);

  const isBlocked = useCallback(
    (appId: string, sectionId: string) => {
      const app = findApp(appId);
      return app ? isSectionBlocked(state, app, sectionId) : false;
    },
    [state],
  );

  const blockedSections = useCallback(
    (appId: string) => {
      const app = findApp(appId);
      return app ? blockedSectionsFor(state, app) : [];
    },
    [state],
  );

  const recordBlockedEncounter = useCallback(() => {
    changedBeforeLoad.current = true;
    setState((current) => recordIntervention(current));
  }, []);

  const resetRules = useCallback(() => {
    changedBeforeLoad.current = true;
    setState((current) => ({ ...createDefaultState(), enabled: current.enabled }));
  }, []);

  const value = useMemo<RegainContextValue>(
    () => ({
      isReady,
      enabled: state.enabled,
      state,
      apps: activeApps(state),
      blockedSectionCount: totalBlockedSections(state),
      todayCount: interventionsToday(state),
      setEnabled,
      toggleSection,
      isBlocked,
      blockedSections,
      recordIntervention: recordBlockedEncounter,
      resetRules,
    }),
    [
      isReady,
      state,
      setEnabled,
      toggleSection,
      isBlocked,
      blockedSections,
      recordBlockedEncounter,
      resetRules,
    ],
  );

  return <RegainContext.Provider value={value}>{children}</RegainContext.Provider>;
}

export function useRegain(): RegainContextValue {
  const context = useContext(RegainContext);
  if (!context) {
    throw new Error('useRegain must be used inside <RegainProvider>');
  }
  return context;
}
