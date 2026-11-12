import { Animated, Pressable, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

import { tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { usePressScale } from './motion';
import { Text } from './Text';

type Option<T extends string> = { value: T; label: string };

/**
 * A segmented control whose selection *moves*.
 *
 * The indicator is a real element that slides between positions on a spring,
 * rather than a background colour that teleports. It is the single cheapest
 * thing that makes a settings screen feel native: the eye follows the pill, and
 * the change of state is understood before the label is read.
 *
 * The control also remains usable with Reduce Motion on — the pill jumps and
 * everything else is identical.
 */
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
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: index,
      damping: 20,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [index, slide]);

  // 3pt of padding on each side is the well's inset.
  const cellWidth = width > 0 ? (width - 6) / options.length : 0;

  const translateX = slide.interpolate({
    inputRange: [0, Math.max(1, options.length - 1)],
    outputRange: [0, cellWidth * Math.max(1, options.length - 1)],
  });

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radius.md,
        padding: 3,
        position: 'relative',
      }}
    >
      {cellWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: 3,
            width: cellWidth,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.separator,
            transform: [{ translateX }],
            ...theme.elevation.raised,
          }}
        />
      ) : null}

      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Segment
            key={option.value}
            label={option.label}
            selected={selected}
            onPress={() => {
              if (!selected) {
                tapFeedback();
                onChange(option.value);
              }
            }}
          />
        );
      })}
    </View>
  );
}

function Segment({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const press = usePressScale(0.94, selected);

  return (
    <Animated.View style={[{ flex: 1 }, press.scaleStyle]}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={onPress}
        style={{
          minHeight: theme.touchTarget - 12,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.sm,
        }}
      >
        <Text
          variant="subhead"
          tone={selected ? 'primary' : 'secondary'}
          numberOfLines={1}
          style={{ fontWeight: selected ? '600' : '500' }}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
