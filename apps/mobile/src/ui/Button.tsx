import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
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
  const isInert = disabled || loading;

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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInert, busy: loading }}
      disabled={isInert}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: height,
          width: fullWidth ? '100%' : undefined,
          paddingHorizontal: theme.space.xl,
          borderRadius: theme.radius.md,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: palette.border,
          backgroundColor: pressed ? palette.pressed : palette.background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.space.sm,
          opacity: isInert ? 0.5 : 1,
          transform: [{ scale: pressed && !isInert ? 0.985 : 1 }],
        },
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
      {!loading ? <View style={{ width: 0 }} /> : null}
    </Pressable>
  );
}
