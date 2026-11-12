/**
 * Semantic themes. This is the only file a screen should ever need to reach
 * through `useTheme()` — it maps the raw scales in `tokens.ts` onto roles
 * (`canvas`, `textSecondary`, `dangerSubtle`, ...) so light and dark stay in
 * sync and a palette change happens in one place.
 */

import type { ViewStyle } from 'react-native';

import {
  brass,
  clay,
  fontFamily,
  ink,
  lagoon,
  motion,
  parchment,
  peacock,
  plum,
  radius,
  sage,
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

  /* ------------------------------------------------------- new roles --- */

  /** A wash of the accent, for headers and hero surfaces. Fades to canvas. */
  accentWash: string;
  /** A wash of brass, for premium surfaces. */
  brassWash: string;
  /** Stronger than `border`, for a control that must not disappear. */
  borderStrong: string;
  /** Text and fill for the sage family (healthy, complete). */
  sage: string;
  sageSubtle: string;
  onSageSubtle: string;
  /** Plum: locking, privacy, secrets. */
  plum: string;
  plumSubtle: string;
  onPlumSubtle: string;
  /** Clay: warmth and Convert. */
  clay: string;
  claySubtle: string;
  onClaySubtle: string;
  /** Lagoon: information and background watching. */
  lagoon: string;
  lagoonSubtle: string;
  onLagoonSubtle: string;
};

export type Theme = {
  scheme: ColorScheme;
  colors: ThemeColors;
  /** Per-family accent, for the PDF catalogue. */
  categories: Record<'Edit' | 'Optimise' | 'Secure' | 'Convert', CategoryTone>;
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

  accentWash: peacock[50],
  brassWash: brass[100],
  borderStrong: parchment[400],

  sage: sage[600],
  sageSubtle: sage[100],
  onSageSubtle: sage[900],

  plum: plum[600],
  plumSubtle: plum[100],
  onPlumSubtle: plum[900],

  clay: clay[600],
  claySubtle: clay[100],
  onClaySubtle: clay[900],

  lagoon: lagoon[600],
  lagoonSubtle: lagoon[100],
  onLagoonSubtle: lagoon[900],
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

  accentWash: '#0B2A29',
  brassWash: '#2B2314',
  borderStrong: ink[500],

  sage: sage[300],
  sageSubtle: '#0F2B1F',
  onSageSubtle: sage[200],

  plum: plum[300],
  plumSubtle: '#241A2F',
  onPlumSubtle: plum[200],

  clay: clay[300],
  claySubtle: '#2E1E15',
  onClaySubtle: clay[200],

  lagoon: lagoon[300],
  lagoonSubtle: '#0D2833',
  onLagoonSubtle: lagoon[200],
};

/** The four PDF families, each with a hue that means something. */
export type CategoryTone = {
  /** Text and icon colour. */
  ink: string;
  /** Tinted well behind an icon or a chip. */
  wash: string;
  /** Edge of that well, for tiles that need definition. */
  edge: string;
};

const lightCategories: Record<'Edit' | 'Optimise' | 'Secure' | 'Convert', CategoryTone> = {
  Edit: { ink: peacock[600], wash: peacock[50], edge: peacock[200] },
  Optimise: { ink: sage[600], wash: sage[50], edge: sage[200] },
  Secure: { ink: plum[600], wash: plum[50], edge: plum[200] },
  Convert: { ink: clay[600], wash: clay[50], edge: clay[200] },
};

const darkCategories: Record<'Edit' | 'Optimise' | 'Secure' | 'Convert', CategoryTone> = {
  Edit: { ink: peacock[300], wash: '#0B2A29', edge: peacock[800] },
  Optimise: { ink: sage[300], wash: '#0F2B1F', edge: sage[800] },
  Secure: { ink: plum[300], wash: '#241A2F', edge: plum[800] },
  Convert: { ink: clay[300], wash: '#2E1E15', edge: clay[800] },
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
    categories: lightCategories,
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
    categories: darkCategories,
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
