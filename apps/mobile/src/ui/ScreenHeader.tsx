import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Animated, Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { usePressScale } from './motion';
import { Text } from './Text';

type ScreenHeaderProps = {
  title?: string;
  subtitle?: string;
  /** Renders a back chevron. Pass `false` on root screens. */
  back?: boolean;
  right?: React.ReactNode;
  style?: ViewStyle;
};

export function ScreenHeader({ title, subtitle, back = true, right, style }: ScreenHeaderProps) {
  const theme = useTheme();
  const router = useRouter();
  const backPress = usePressScale(0.9);

  return (
    <View
      style={[
        {
          minHeight: theme.touchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
          paddingVertical: theme.space.sm,
        },
        style,
      ]}
    >
      {back ? (
        <Animated.View style={[{ marginLeft: -theme.space.sm }, backPress.scaleStyle]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            onPressIn={backPress.onPressIn}
            onPressOut={backPress.onPressOut}
            hitSlop={theme.space.md}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: theme.radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
            })}
          >
            <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
          </Pressable>
        </Animated.View>
      ) : null}

      <View style={{ flex: 1 }}>
        {title ? (
          <Text variant="subhead" tone="secondary" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  );
}
