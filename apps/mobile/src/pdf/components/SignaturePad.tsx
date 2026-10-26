import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { strokePath, type Stroke } from '../signature';

type SignaturePadProps = {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  height?: number;
};

/**
 * A signature pad drawn with vectors.
 *
 * The strokes are what is kept, so the pad redraws the saved signature at any
 * size and the engine can put it on a page sharper than a screenshot would be.
 * `PanResponder` is used rather than a gesture library because a signature is a
 * single-finger drag: no pinch, no multi-touch, nothing to configure.
 */
export function SignaturePad({ strokes, onChange, height = 180 }: SignaturePadProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const active = useRef(false);

  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  // The responder is rebuilt only when the pad is measured. A new `onChange`
  // from the parent must not replace it mid-stroke, which would drop the drag.
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: (event) => {
          if (width <= 0) return;
          active.current = true;
          const point = {
            x: event.nativeEvent.locationX / width,
            y: event.nativeEvent.locationY / width,
          };
          changeRef.current([...strokesRef.current, [point]]);
        },

        onPanResponderMove: (event) => {
          if (!active.current || width <= 0) return;
          const point = {
            x: event.nativeEvent.locationX / width,
            y: event.nativeEvent.locationY / width,
          };

          const current = strokesRef.current;
          if (current.length === 0) return;

          const next = current.slice();
          next[next.length - 1] = [...next[next.length - 1]!, point];
          changeRef.current(next);
        },

        onPanResponderRelease: () => {
          active.current = false;
        },

        onPanResponderTerminate: () => {
          active.current = false;
        },
      }),
    [width],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  const empty = strokes.every((stroke) => stroke.length === 0);

  return (
    <View
      onLayout={onLayout}
      style={{
        height,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
      }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {strokes.map((stroke, index) => (
            <Path
              key={index}
              d={strokePath(stroke, width, width)}
              stroke={theme.colors.text}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      ) : null}

      {empty ? (
        <View
          pointerEvents="none"
          style={{
            ...absoluteFill,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.space.xs,
          }}
        >
          <Ionicons name="pencil" size={20} color={theme.colors.textTertiary} />
          <Text variant="footnote" tone="tertiary">
            Sign here with your finger
          </Text>
        </View>
      ) : null}

      {/* A ruled line, the way a paper form suggests where to sign. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: theme.space.xl,
          right: theme.space.xl,
          bottom: height * 0.24,
          height: 1,
          backgroundColor: theme.colors.separator,
        }}
      />

      <View style={{ ...absoluteFill }} {...pan.panHandlers} />

      {!empty ? (
        <Pressable
          onPress={() => onChange([])}
          accessibilityRole="button"
          accessibilityLabel="Clear the signature"
          hitSlop={theme.space.md}
          style={{
            position: 'absolute',
            top: theme.space.sm,
            right: theme.space.sm,
            width: 34,
            height: 34,
            borderRadius: theme.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.surfaceSunken,
          }}
        >
          <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const absoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
