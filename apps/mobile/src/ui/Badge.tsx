import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'accent' | 'brass' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const theme = useTheme();

  const palette: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.colors.surfaceSunken, fg: theme.colors.textSecondary },
    accent: { bg: theme.colors.accentSubtle, fg: theme.colors.onAccentSubtle },
    brass: { bg: theme.colors.brassSubtle, fg: theme.colors.onBrassSubtle },
    success: { bg: theme.colors.successSubtle, fg: theme.colors.success },
    warning: { bg: theme.colors.warningSubtle, fg: theme.colors.warning },
    danger: { bg: theme.colors.dangerSubtle, fg: theme.colors.danger },
    info: { bg: theme.colors.infoSubtle, fg: theme.colors.info },
  };

  const { bg, fg } = palette[tone];

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: bg,
        paddingHorizontal: theme.space.md,
        paddingVertical: theme.space.xs,
        borderRadius: theme.radius.full,
      }}
    >
      <Text variant="caption" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}
