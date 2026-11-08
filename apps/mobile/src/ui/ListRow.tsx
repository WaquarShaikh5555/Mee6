import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { TextProps } from './Text';
import { Text } from './Text';

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Leading icon. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Right-aligned value, e.g. the current setting. */
  value?: string;
  onPress?: () => void;
  /** Destructive rows read in the danger colour without a filled background. */
  destructive?: boolean;
  /** Hide the chevron for non-navigating rows. */
  showChevron?: boolean;
  tone?: TextProps['tone'];
};

export function ListRow({
  title,
  subtitle,
  icon,
  value,
  onPress,
  destructive = false,
  showChevron = true,
  tone,
}: ListRowProps) {
  const theme = useTheme();
  const interactive = Boolean(onPress);

  const content = (
    <View
      style={{
        minHeight: theme.touchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        paddingVertical: theme.space.md,
        paddingHorizontal: theme.space.lg,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: destructive ? theme.colors.dangerSubtle : theme.colors.accentSubtle,
          }}
        >
          <Ionicons
            name={icon}
            size={18}
            color={destructive ? theme.colors.danger : theme.colors.onAccentSubtle}
          />
        </View>
      ) : null}

      <View style={{ flex: 1, gap: 2 }}>
        <Text
          variant="body"
          tone={destructive ? 'danger' : (tone ?? 'primary')}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="tertiary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text variant="subhead" tone="secondary" numberOfLines={1}>
          {value}
        </Text>
      ) : null}

      {interactive && showChevron ? (
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      ) : null}
    </View>
  );

  if (!interactive) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => ({ backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent' })}
    >
      {content}
    </Pressable>
  );
}
