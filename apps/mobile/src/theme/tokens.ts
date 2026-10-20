/**
 * Design primitives for Shaikh's.
 *
 * Direction: "Ink & Peacock". A single deep-teal brand accent against warm,
 * low-chroma parchment neutrals, with brass reserved for premium/milestone
 * moments. Deliberately avoiding the current AI-default looks: cream +
 * terracotta + serif, near-black + acid green, and the identical-card SaaS kit.
 *
 * Rules for contributors:
 *  - Screens never hardcode a colour, spacing value, radius, or font size.
 *    They read from `useTheme()`, which is built from these scales.
 *  - Space follows a 4-point grid, named by size (`xl`), never by use (`cardGap`).
 *  - Type sizes are in points; body text scales with Dynamic Type / font scaling.
 */

import { Platform } from 'react-native';

/* ------------------------------------------------------------------ colour */

/** Peacock — the brand ramp. 600 is the light-mode accent, 300 the dark-mode one. */
export const peacock = {
  50: '#EDF7F6',
  100: '#D6EDEB',
  200: '#AFDCD8',
  300: '#7FC7C1',
  400: '#4CAAA4',
  500: '#2A8D88',
  600: '#0E6F6B',
  700: '#0B5855',
  800: '#0A4644',
  900: '#083634',
  950: '#042221',
} as const;

/** Parchment — warm, low-chroma neutrals. Surfaces and text both come from here. */
export const parchment = {
  0: '#FFFFFF',
  25: '#FCFBF8',
  50: '#F7F5EF',
  100: '#F1EEE6',
  200: '#E4E0D5',
  300: '#D1CBBE',
  400: '#ABA496',
  500: '#847D6E',
  600: '#625C50',
  700: '#4A453C',
  800: '#33302A',
  900: '#1E1C18',
  950: '#12110E',
} as const;

/** Brass — secondary accent. Awards, ratings, "pro" moments. Never body text. */
export const brass = {
  100: '#F7ECD6',
  200: '#EFD9AC',
  300: '#DFBC7C',
  400: '#C99A4C',
  500: '#A97A33',
  600: '#8A6227',
  700: '#6C4C1F',
} as const;

/** Ink — the dark-mode surface family, subtly teal-tinted so it sits with peacock. */
export const ink = {
  0: '#0A0F0F',
  50: '#0F1616',
  100: '#141C1C',
  200: '#1A2424',
  300: '#222E2E',
  400: '#2C3A3A',
  500: '#3C4C4C',
  600: '#5A6A6A',
  700: '#8A9898',
  800: '#B8C3C1',
  900: '#E7ECE9',
  950: '#F5F7F5',
} as const;

/** Status colours, per scheme. Never used as decoration. */
export const status = {
  light: {
    success: '#2C7A56',
    warning: '#8A580C',
    danger: '#B3261E',
    info: '#1D6AA8',
  },
  dark: {
    success: '#63D3A1',
    warning: '#E7B75E',
    danger: '#FF9A91',
    info: '#86BDF2',
  },
} as const;

/* -------------------------------------------------------------------- type */

/**
 * Two faces, clearly distinct: a humanist serif for the wordmark and editorial
 * moments, the platform UI sans for everything else. System fonts only, so
 * there is no font payload, no flash of unstyled text, and Dynamic Type plus
 * the OS language's own glyphs work out of the box.
 */
export const fontFamily = Platform.select({
  ios: { serif: 'Georgia', sans: 'System', mono: 'Menlo' },
  android: { serif: 'serif', sans: 'sans-serif', mono: 'monospace' },
  web: {
    serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  default: { serif: 'serif', sans: 'sans-serif', mono: 'monospace' },
}) as { serif: string; sans: string; mono: string };

type TypeToken = {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing: number;
};

/**
 * One scale, ten steps. Larger sizes get tighter tracking; small sizes get a
 * touch of positive tracking so they stay legible on dense screens.
 */
export const typography = {
  display: { fontSize: 40, lineHeight: 46, fontWeight: '600', letterSpacing: -1.4 },
  title1: { fontSize: 32, lineHeight: 38, fontWeight: '600', letterSpacing: -0.9 },
  title2: { fontSize: 26, lineHeight: 32, fontWeight: '600', letterSpacing: -0.6 },
  title3: { fontSize: 21, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 25, fontWeight: '400', letterSpacing: 0 },
  callout: { fontSize: 16, lineHeight: 23, fontWeight: '400', letterSpacing: 0 },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: 0 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: 0.1 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.3 },
} as const satisfies Record<string, TypeToken>;

export type TypeVariant = keyof typeof typography;

/* ------------------------------------------------------------------ layout */

/** 4-point grid. Named by size, not by role. */
export const space = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

/**
 * Radii are intentionally *not* one value everywhere: inputs are tighter than
 * cards, cards are tighter than sheets, and pills exist only for tags.
 */
export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  full: 999,
} as const;

/** Minimum touch target, per platform convention (44pt iOS, 48dp Android). */
export const touchTarget = Platform.select({ ios: 44, default: 48 }) as number;

/** Motion. One easing curve keeps the app feeling like one product. */
export const motion = {
  duration: { fast: 140, base: 200, slow: 320 },
  easing: { standard: [0.2, 0, 0, 1] as const, exit: [0.4, 0, 1, 1] as const },
} as const;
