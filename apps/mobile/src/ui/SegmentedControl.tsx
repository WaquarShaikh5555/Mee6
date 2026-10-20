import { Pressable, View } from 'react-native';

import { tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Option<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radius.md,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!selected) {
                tapFeedback();
                onChange(option.value);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={{
              flex: 1,
              minHeight: 38,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.sm,
              backgroundColor: selected ? theme.colors.surface : 'transparent',
              ...(selected ? theme.elevation.raised : null),
            }}
          >
            <Text variant="subhead" tone={selected ? 'primary' : 'secondary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
