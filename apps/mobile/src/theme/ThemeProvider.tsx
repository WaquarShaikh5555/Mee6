import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { storage } from '@/lib/storage';
import { themes, type ColorScheme, type Theme } from './semantic';

export type ThemePreference = 'system' | 'light' | 'dark';

const PREFERENCE_KEY = 'shaikhs.theme.preference.v1';

type ThemeContextValue = {
  theme: Theme;
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** False until the stored preference has been read, to avoid a light flash in dark mode. */
  isReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storage.get(PREFERENCE_KEY).then((stored) => {
      if (cancelled) return;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void storage.set(PREFERENCE_KEY, next);
  }, []);

  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[scheme], scheme, preference, setPreference, isReady }),
    [scheme, preference, setPreference, isReady],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return context.theme;
}

/** Full context, for Settings (read/write preference) and the design screen. */
export function useThemeController(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeController must be used inside <ThemeProvider>');
  }
  return context;
}
