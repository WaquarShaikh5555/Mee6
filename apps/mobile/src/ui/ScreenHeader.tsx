import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
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
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={theme.space.md}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: theme.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: -theme.space.sm,
            backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
          })}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>
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
