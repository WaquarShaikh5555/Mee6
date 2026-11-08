/**
 * Holds Focus Mode's state for the app and keeps it on the device.
 *
 * The provider is deliberately thin: every decision about what is blocked lives
 * in `store.ts` as a pure function, and persistence is the same `storage`
 * adapter the session uses (Keychain / Keystore on a device, localStorage in the
 * preview).
 */

import { AppState } from 'react-native';

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

import { findApp, type FocusApp } from './catalog';
import { getLastSighting, syncRules } from './enforcement';
import {
  activeApps,
  blockedSectionsFor,
  createDefaultState,
  interventionsToday,
  isSectionBlocked,
  parseState,
  recordIntervention,
  FOCUS_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  serializeState,
  setEnabled as setEnabledPure,
  toggleSection as toggleSectionPure,
  totalBlockedSections,
  type FocusState,
} from './store';

type FocusContextValue = {
  /** False until the stored state has been read; screens show a quiet placeholder. */
  isReady: boolean;
  enabled: boolean;
  state: FocusState;
  /** Apps with at least one blocked section. */
  apps: FocusApp[];
  blockedSectionCount: number;
  todayCount: number;
  setEnabled: (enabled: boolean) => void;
  toggleSection: (appId: string, sectionId: string) => void;
  isBlocked: (appId: string, sectionId: string) => boolean;
  blockedSections: (appId: string) => string[];
  recordIntervention: () => void;
  resetRules: () => void;
};

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FocusState>(createDefaultState);
  const [isReady, setIsReady] = useState(false);

  /**
   * The phone counts encounters itself — it has to, because it is watching
   * while this app is closed. The two counts are reconciled by taking the
   * larger, so neither the preview route nor the real shield can under-report.
   */
  const [nativeToday, setNativeToday] = useState(0);

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

    // The second read is the rename's only footprint: rules saved under the
    // old key are brought across once, then saved under the new one.
    storage
      .get(FOCUS_STORAGE_KEY)
      .then(async (raw) => (raw === null ? storage.get(LEGACY_STORAGE_KEY) : raw))
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
    void storage.set(FOCUS_STORAGE_KEY, serializeState(state));
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

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      const sighting = await getLastSighting();
      if (!cancelled && sighting) setNativeToday(sighting.today);
    };

    void read();

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void read();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

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

  const value = useMemo<FocusContextValue>(
    () => ({
      isReady,
      enabled: state.enabled,
      state,
      apps: activeApps(state),
      blockedSectionCount: totalBlockedSections(state),
      // The phone counts what it blocked while this app was closed; the
      // preview route counts its own arrivals. Whichever is larger is the truth.
      todayCount: Math.max(interventionsToday(state), nativeToday),
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
      nativeToday,
      setEnabled,
      toggleSection,
      isBlocked,
      blockedSections,
      recordBlockedEncounter,
      resetRules,
    ],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(): FocusContextValue {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocus must be used inside <FocusProvider>');
  }
  return context;
}
