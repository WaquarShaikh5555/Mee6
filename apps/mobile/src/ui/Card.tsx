import type { ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { usePressScale } from './motion';

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
  const press = usePressScale(0.988, !onPress);

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
    <Animated.View style={[press.scaleStyle, { borderRadius: base.borderRadius }]}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[base, style]}
      >
        {({ pressed }) => (
          <>
            {/* The wash sits *under* the content, so a pressed card dims its
                surface without dimming its type. Works on tinted cards too,
                which a background swap could not do. */}
            {pressed ? (
              <View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: theme.colors.surfaceSunken,
                    opacity: 0.55,
                    borderRadius: base.borderRadius,
                  },
                ]}
              />
            ) : null}
            {children}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}
