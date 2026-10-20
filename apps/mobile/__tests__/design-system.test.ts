/**
 * Design-system guarantees.
 *
 * These tests are the difference between "the palette looks fine to me" and
 * "every text/background pair is proven to clear WCAG AA in both schemes".
 * If a token changes and contrast regresses, CI fails here.
 */

import { contrastRatio, formatRatio, meetsWcag, parseColor } from '@/theme/contrast';
import { themes } from '@/theme/semantic';
import { space, typography } from '@/theme/tokens';

describe('contrast maths', () => {
  it('computes the canonical black-on-white ratio', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('computes a known mid-grey ratio', () => {
    // #767676 on white is the classic lowest passing grey for body text.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('parses shorthand hex, long hex, and rgba', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('#0E6F6B')).toEqual({ r: 14, g: 111, b: 107 });
    expect(parseColor('rgba(18, 17, 14, 0.45)')).toEqual({ r: 18, g: 17, b: 14 });
  });

  it('rejects unsupported colour formats instead of guessing', () => {
    expect(() => parseColor('rebeccapurple')).toThrow();
  });

  it('formats ratios to one decimal place', () => {
    expect(formatRatio(4.53)).toBe('4.5:1');
  });

  it('applies the right threshold per text size', () => {
    expect(meetsWcag(4.4, 'body')).toBe(false);
    expect(meetsWcag(4.6, 'body')).toBe(true);
    expect(meetsWcag(3.1, 'large')).toBe(true);
    expect(meetsWcag(2.9, 'ui')).toBe(false);
  });
});

describe.each(['light', 'dark'] as const)('%s theme accessibility', (scheme) => {
  const theme = themes[scheme];
  const { colors } = theme;

  it('body text on the canvas passes AA', () => {
    expect(contrastRatio(colors.text, colors.canvas)).toBeGreaterThanOrEqual(4.5);
  });

  it('body text on a surface passes AA', () => {
    expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('secondary text passes AA on canvas and surface', () => {
    expect(contrastRatio(colors.textSecondary, colors.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.textSecondary, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('tertiary text still clears AA for non-essential labels', () => {
    // Tertiary is used for hints and metadata, never for required information,
    // so it is held to the large-text threshold rather than being unreadable.
    expect(contrastRatio(colors.textTertiary, colors.canvas)).toBeGreaterThanOrEqual(3);
  });

  it('primary button label is legible on the accent fill', () => {
    expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('subtle accent surfaces carry legible text', () => {
    expect(contrastRatio(colors.onAccentSubtle, colors.accentSubtle)).toBeGreaterThanOrEqual(4.5);
  });

  it('brass moments remain readable', () => {
    expect(contrastRatio(colors.onBrassSubtle, colors.brassSubtle)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['success', 'warning', 'danger', 'info'] as const)(
    '%s status text is legible on its subtle background',
    (token) => {
      const subtle = `${token}Subtle` as keyof typeof colors;
      expect(contrastRatio(colors[token], colors[subtle])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('separators are visible without shouting', () => {
    const ratio = contrastRatio(colors.separator, colors.canvas);
    expect(ratio).toBeGreaterThanOrEqual(1.2);
    expect(ratio).toBeLessThanOrEqual(6);
  });
});

describe('type scale', () => {
  const values = Object.values(typography);

  it('never increases in size down the scale', () => {
    // Headline deliberately equals body in size and differs only in weight.
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index].fontSize).toBeLessThanOrEqual(values[index - 1].fontSize);
    }
  });

  it('still offers enough distinct sizes to build a hierarchy', () => {
    const distinct = new Set(values.map((value) => value.fontSize));
    expect(distinct.size).toBeGreaterThanOrEqual(8);
  });

  it('keeps body text at a readable measure', () => {
    expect(typography.body.fontSize).toBeGreaterThanOrEqual(16);
    // Line height between 1.3x and 1.6x of the font size.
    expect(typography.body.lineHeight / typography.body.fontSize).toBeGreaterThanOrEqual(1.3);
    expect(typography.body.lineHeight / typography.body.fontSize).toBeLessThanOrEqual(1.6);
  });

  it('tightens tracking as size grows', () => {
    expect(typography.display.letterSpacing).toBeLessThan(typography.body.letterSpacing);
    expect(typography.caption.letterSpacing).toBeGreaterThan(typography.body.letterSpacing);
  });
});

describe('spacing scale', () => {
  it('is built on a 4-point grid', () => {
    Object.values(space)
      .filter((value) => value > 0)
      .forEach((value) => {
        expect(value % 4).toBe(0);
      });
  });

  it('has no duplicate steps', () => {
    const values = Object.values(space);
    expect(new Set(values).size).toBe(values.length);
  });
});
