/**
 * WCAG 2.1 contrast maths.
 *
 * Used at build time by the test suite to prove every text/background pair in
 * both schemes clears the threshold, and at runtime by the design screen so the
 * numbers shown next to each swatch are the real ones, not marketing.
 */

export type Rgb = { r: number; g: number; b: number };

/** Parses `#rgb`, `#rrggbb`, or `rgba(r, g, b, a)`. */
export function parseColor(input: string): Rgb {
  const value = input.trim();

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
    throw new Error(`Unsupported hex colour: ${input}`);
  }

  const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (match) {
    return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
  }

  throw new Error(`Unsupported colour: ${input}`);
}

/** sRGB channel → linear light, per WCAG relative luminance. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: string): number {
  const { r, g, b } = parseColor(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between 1 and 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 4.5:1 for body text, 3:1 for large text and UI boundaries. */
export function meetsWcag(ratio: number, level: 'body' | 'large' | 'ui' = 'body'): boolean {
  const threshold = level === 'body' ? 4.5 : 3;
  return ratio >= threshold;
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}
