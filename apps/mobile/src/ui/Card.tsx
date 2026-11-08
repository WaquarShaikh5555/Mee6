import type { ReactNode } from 'react';
import {
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export type CardProps = {
  children: ReactNode;
  /** `flat` sits on the canvas; `raised` is for genuinely floating layers only. */
  elevation?: 'flat' | 'raised';
  padded?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Card({
  children,
  elevation = 'flat',
  padded = true,
  onPress,
  style,
  accessibilityLabel,
}: CardProps) {
  const theme = useTheme();

  const base: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.separator,
    padding: padded ? theme.space.lg : 0,
    ...(elevation === 'raised' ? theme.elevation.raised : null),
  };

  if (!onPress) {
    return <View style={[base, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        base,
        { transform: [{ scale: pressed ? 0.99 : 1 }], opacity: pressed ? 0.9 : 1 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
