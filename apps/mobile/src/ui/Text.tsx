import type { ReactNode } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { TypeVariant } from '@/theme/tokens';

type Tone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'inverse'
  | 'accent'
  | 'brass'
  | 'success'
  | 'warning'
  | 'danger'
  | 'onAccent'
  | 'onAccentSubtle';

export type TextProps = Omit<RNTextProps, 'style'> & {
  children?: ReactNode;
  /** Scale step. `body` is the default reading size. */
  variant?: TypeVariant;
  tone?: Tone;
  /** Serif face, for the wordmark and editorial statements only. */
  serif?: boolean;
  align?: TextStyle['textAlign'];
  /** Tabular figures for counters, prices, and timers. */
  tabular?: boolean;
  style?: TextStyle | TextStyle[];
};

export function Text({
  children,
  variant = 'body',
  tone = 'primary',
  serif = false,
  align,
  tabular = false,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const color: Record<Tone, string> = {
    primary: theme.colors.text,
    secondary: theme.colors.textSecondary,
    tertiary: theme.colors.textTertiary,
    inverse: theme.colors.textInverse,
    accent: theme.colors.accent,
    brass: theme.colors.brass,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    onAccent: theme.colors.onAccent,
    onAccentSubtle: theme.colors.onAccentSubtle,
  };

  const token = theme.typography[variant];

  return (
    <RNText
      // Dynamic Type / font scaling stays on: the scale above is the default,
      // not a cap. Layouts are built to reflow, not to clip.
      allowFontScaling
      maxFontSizeMultiplier={1.8}
      {...rest}
      style={[
        {
          fontFamily: serif ? theme.fontFamily.serif : theme.fontFamily.sans,
          fontSize: token.fontSize,
          lineHeight: token.lineHeight,
          fontWeight: token.fontWeight,
          letterSpacing: token.letterSpacing,
          color: color[tone],
          ...(align ? { textAlign: align } : null),
          ...(tabular ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] } : null),
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
