import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'brass'
  | 'sage'
  | 'plum'
  | 'clay'
  | 'lagoon'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const theme = useTheme();

  const palette: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.colors.surfaceSunken, fg: theme.colors.textSecondary },
    accent: { bg: theme.colors.accentSubtle, fg: theme.colors.onAccentSubtle },
    brass: { bg: theme.colors.brassSubtle, fg: theme.colors.onBrassSubtle },
    sage: { bg: theme.colors.sageSubtle, fg: theme.colors.onSageSubtle },
    plum: { bg: theme.colors.plumSubtle, fg: theme.colors.onPlumSubtle },
    clay: { bg: theme.colors.claySubtle, fg: theme.colors.onClaySubtle },
    lagoon: { bg: theme.colors.lagoonSubtle, fg: theme.colors.onLagoonSubtle },
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
