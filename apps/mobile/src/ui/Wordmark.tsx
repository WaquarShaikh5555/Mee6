import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/**
 * The logotype. Set in a serif at a tight tracking, with the brass rule beneath
 * carrying the only ornament — no icon, no gradient, no apostrophe gimmick.
 */
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const theme = useTheme();

  const scale = {
    sm: { variant: 'title3' as const, rule: 16 },
    md: { variant: 'title2' as const, rule: 22 },
    lg: { variant: 'display' as const, rule: 32 },
  }[size];

  return (
    <View style={{ gap: theme.space.sm }}>
      <Text variant={scale.variant} serif style={{ letterSpacing: -0.5 }}>
        Shaikh’s
      </Text>
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
