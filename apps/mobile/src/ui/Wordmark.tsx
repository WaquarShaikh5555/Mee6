import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { BrandMark } from './BrandMark';
import { Text } from './Text';

/**
 * The logotype: the monogram beside the name, with a brass rule beneath.
 *
 * The mark and the word carry the same weight rather than one introducing the
 * other, because the mark already says "S" — stacking a large icon above a
 * large word would say it twice.
 */
export function Wordmark({
  size = 'md',
  mark = true,
}: {
  size?: 'sm' | 'md' | 'lg';
  /** Set false where the mark is already on screen. */
  mark?: boolean;
}) {
  const theme = useTheme();

  const scale = {
    sm: { variant: 'title3' as const, mark: 'sm' as const, rule: 16, gap: theme.space.xs },
    md: { variant: 'title2' as const, mark: 'md' as const, rule: 22, gap: theme.space.sm },
    lg: { variant: 'display' as const, mark: 'lg' as const, rule: 32, gap: theme.space.md },
  }[size];

  return (
    <View style={{ gap: theme.space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale.gap }}>
        {mark ? <BrandMark size={scale.mark} /> : null}
        <Text variant={scale.variant} serif style={{ letterSpacing: -0.5 }}>
          Shaikh’s
        </Text>
      </View>
      <View
        style={{
          width: scale.rule,
          height: 2,
          borderRadius: 1,
          backgroundColor: theme.colors.brass,
        }}
      />
    </View>
  );
}
