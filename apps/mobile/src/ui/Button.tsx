import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useEffect, useRef } from 'react';

import { tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { usePressScale, useReducedMotion } from './motion';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Ionicons name shown before the label. */
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

/**
 * The app's one button.
 *
 * Three things make it feel like a control rather than a coloured rectangle:
 *
 *  - the press is acknowledged on the first frame (the spring starts in
 *    `onPressIn`, not on release), so the surface responds to the finger;
 *  - the label dims a touch faster than the background moves, which reads as
 *    the button being *pushed in* rather than merely recoloured;
 *  - a primary button carries a whisper of shadow, so it sits above the page
 *    instead of being painted onto it.
 *
 * Nothing here animates on mount: a screen full of buttons arriving one by one
 * is slower to use, not richer.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  icon,
  fullWidth = true,
  style,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const isInert = disabled || loading;
  const press = usePressScale(0.968, isInert);

  const palette = {
    primary: {
      background: theme.colors.accent,
      pressed: theme.colors.accentPressed,
      border: theme.colors.accent,
      label: theme.colors.onAccent,
    },
    secondary: {
      background: theme.colors.surface,
      pressed: theme.colors.surfaceSunken,
      border: theme.colors.border,
      label: theme.colors.text,
    },
    ghost: {
      background: 'transparent',
      pressed: theme.colors.surfaceSunken,
      border: 'transparent',
      label: theme.colors.accent,
    },
    destructive: {
      background: theme.colors.dangerSubtle,
      pressed: theme.colors.dangerSubtle,
      border: 'transparent',
      label: theme.colors.danger,
    },
  }[variant];

  const height = size === 'lg' ? 54 : 44;

  return (
    <Animated.View
      style={[
        press.scaleStyle,
        {
          width: fullWidth ? '100%' : undefined,
          opacity: isInert ? 0.55 : 1,
          borderRadius: theme.radius.md,
          // A primary button lifts; the others stay on the page.
          ...(variant === 'primary' && !isInert ? theme.elevation.raised : null),
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isInert, busy: loading }}
        disabled={isInert}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          tapFeedback();
          onPress();
        }}
        style={({ pressed }) => [
          {
            minHeight: height,
            paddingHorizontal: theme.space.xl,
            borderRadius: theme.radius.md,
            borderWidth: variant === 'secondary' ? 1 : 0,
            borderColor: palette.border,
            backgroundColor: pressed ? palette.pressed : palette.background,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.space.sm,
          },
          // Callers may pass an array or a style object; the array form keeps
          // both working without spreading an array into an object.
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={palette.label} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={19} color={palette.label} /> : null}
            <Text
              variant={size === 'lg' ? 'headline' : 'subhead'}
              style={{ color: palette.label }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/**
 * A short sheen that crosses a surface once, used when something is *finished*
 * rather than merely tapped — a result arriving, a transfer completing.
 *
 * Deliberately not exported as a general effect: a highlight that appears for no
 * reason is decoration, and decoration is what makes an app feel cheap.
 */
export function useSheenOnce(active: boolean) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduced) return;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 900,
      delay: 120,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, progress, reduced]);

  return progress.interpolate({ inputRange: [0, 1], outputRange: [-120, 320] });
}
