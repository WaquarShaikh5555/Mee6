/**
 * Semantic themes. This is the only file a screen should ever need to reach
 * through `useTheme()` — it maps the raw scales in `tokens.ts` onto roles
 * (`canvas`, `textSecondary`, `dangerSubtle`, ...) so light and dark stay in
 * sync and a palette change happens in one place.
 */

import type { ViewStyle } from 'react-native';

import {
  brass,
  fontFamily,
  ink,
  motion,
  parchment,
  peacock,
  radius,
  space,
  status,
  touchTarget,
  typography,
} from './tokens';

export type ColorScheme = 'light' | 'dark';

export type ThemeColors = {
  /** Page background. */
  canvas: string;
  /** Cards, rows, inputs that read as a block on the canvas. */
  surface: string;
  /** Sheets, menus, anything floating above `surface`. */
  surfaceRaised: string;
  /** Wells and filled inputs that should recede. */
  surfaceSunken: string;
  /** Visible border, e.g. around an input. */
  border: string;
  /** Hairline between rows. */
  separator: string;

  text: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;

  accent: string;
  accentPressed: string;
  onAccent: string;
  accentSubtle: string;
  onAccentSubtle: string;
  accentBorder: string;

  brass: string;
  brassSubtle: string;
  onBrassSubtle: string;

  success: string;
  successSubtle: string;
  warning: string;
  warningSubtle: string;
  danger: string;
  dangerSubtle: string;
  info: string;
  infoSubtle: string;

  /** Dimming behind modals. */
  scrim: string;
  /** Keyboard focus and pressed outlines. */
  focusRing: string;
};

export type Theme = {
  scheme: ColorScheme;
  colors: ThemeColors;
  space: typeof space;
  radius: typeof radius;
  typography: typeof typography;
  fontFamily: typeof fontFamily;
  touchTarget: number;
  motion: typeof motion;
  /** Applied only to genuinely floating surfaces; cards on the canvas stay flat. */
  elevation: { raised: ViewStyle; overlay: ViewStyle };
};

const lightColors: ThemeColors = {
  canvas: parchment[50],
  surface: parchment[0],
  surfaceRaised: parchment[0],
  surfaceSunken: parchment[100],
  border: parchment[300],
  separator: parchment[200],

  text: parchment[900],
  textSecondary: parchment[600],
  textTertiary: parchment[500],
  textInverse: parchment[0],

  accent: peacock[600],
  accentPressed: peacock[700],
  onAccent: parchment[0],
  accentSubtle: peacock[100],
  onAccentSubtle: peacock[900],
  accentBorder: peacock[200],

  brass: brass[600],
  brassSubtle: brass[100],
  onBrassSubtle: brass[700],

  success: status.light.success,
  successSubtle: '#E3F2E9',
  warning: status.light.warning,
  warningSubtle: '#FBF0D9',
  danger: status.light.danger,
  dangerSubtle: '#FBE9E7',
  info: status.light.info,
  infoSubtle: '#E5F0F9',

  scrim: 'rgba(18, 17, 14, 0.45)',
  focusRing: 'rgba(14, 111, 107, 0.45)',
};

const darkColors: ThemeColors = {
  canvas: ink[0],
  surface: ink[100],
  surfaceRaised: ink[200],
  surfaceSunken: ink[50],
  border: ink[400],
  separator: ink[300],

  text: ink[900],
  textSecondary: ink[800],
  textTertiary: ink[700],
  textInverse: peacock[950],

  accent: peacock[300],
  accentPressed: peacock[200],
  onAccent: peacock[950],
  accentSubtle: '#0D3433',
  onAccentSubtle: peacock[100],
  accentBorder: peacock[800],

  brass: brass[300],
  brassSubtle: '#2B2314',
  onBrassSubtle: brass[200],

  success: status.dark.success,
  successSubtle: '#102A1F',
  warning: status.dark.warning,
  warningSubtle: '#2A2313',
  danger: status.dark.danger,
  dangerSubtle: '#2F1614',
  info: status.dark.info,
  infoSubtle: '#122436',

  scrim: 'rgba(0, 0, 0, 0.6)',
  focusRing: 'rgba(127, 199, 193, 0.5)',
};

const shared = {
  space,
  radius,
  typography,
  fontFamily,
  touchTarget,
  motion,
} as const;

export const themes: Record<ColorScheme, Theme> = {
  light: {
    scheme: 'light',
    colors: lightColors,
    ...shared,
    elevation: {
      raised: {
        shadowColor: '#12110E',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      },
      overlay: {
        shadowColor: '#12110E',
        shadowOpacity: 0.16,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
      },
    },
  },
  dark: {
    scheme: 'dark',
    colors: darkColors,
    ...shared,
    elevation: {
      raised: {
        shadowColor: '#000000',
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      },
      overlay: {
        shadowColor: '#000000',
        shadowOpacity: 0.55,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
      },
    },
  },
};
