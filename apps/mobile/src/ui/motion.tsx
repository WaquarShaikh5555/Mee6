/**
 * Motion, in one place.
 *
 * The app had two kinds of feedback before this: a colour change and a 1.5%
 * scale that happened instantly. Both are correct — neither is felt. What makes
 * an interface feel native is not bigger animation, it is *the right amount at
 * the right moment*: a press that responds in the first frame, content that
 * arrives rather than appears, and nothing that moves when you asked it not to.
 *
 * Three rules, kept everywhere:
 *
 *  1. **Never animate something the person is reading.** Entrances are short and
 *     run once; nothing loops, nothing pulses, nothing moves while idle.
 *  2. **The press comes first.** A touch is acknowledged on the frame it
 *     happens; the release settles with a spring.
 *  3. **Reduce Motion is honoured.** Android's and iOS's setting is read live,
 *     not once at launch, and every helper here falls back to a plain fade (or
 *     nothing at all) when it is on.
 *
 * Everything is built on React Native's own `Animated` with the native driver,
 * so there is no extra dependency and no worklet runtime to configure.
 */

import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/* ------------------------------------------------------------ reduce motion */

/**
 * Live `prefers-reduced-motion`, from the OS.
 *
 * Read asynchronously on mount and subscribed afterwards, because the setting
 * can change while the app is open and a person should not have to restart it
 * to stop things moving.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    try {
      void AccessibilityInfo.isReduceMotionEnabled?.().then((value) => {
        if (!cancelled) setReduced(Boolean(value));
      });
    } catch {
      // A platform without the API simply never reduces.
    }

    let subscription: { remove: () => void } | undefined;
    try {
      subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
        setReduced(Boolean(value));
      });
    } catch {
      // Ignore: the setting is then read once, at mount.
    }

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return reduced;
}

/* ---------------------------------------------------------------- entrances */

type EntranceProps = {
  children: ReactNode;
  /** Milliseconds to wait. Use `index * stagger` for a list. */
  delay?: number;
  /** How far it rises, in points. 0 fades in place. */
  offset?: number;
  /** Start slightly smaller and settle — for cards that carry a result. */
  pop?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Content that arrives instead of appearing.
 *
 * Deliberately cheap: one opacity and one transform, both on the native driver,
 * which means this cannot stutter a scroll even on a slow phone.
 */
export function FadeIn({ children, delay = 0, offset = 10, pop = false, style }: EntranceProps) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay: Math.min(delay, 600),
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: true,
    });

    animation.start();
    return () => animation.stop();
  }, [delay, progress, reduced]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [pop ? 0.96 : 1, 1] });

  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }, { scale }] }]}>
      {children}
    </Animated.View>
  );
}

/** The gap between siblings in a staggered entrance. */
export const STAGGER_MS = 55;

/* ------------------------------------------------------------------ presses */

/**
 * A press that answers on the first frame and settles with a spring.
 *
 * `scale` is intentionally small (1.5–3%). Anything more reads as a toy; this
 * amount reads as weight. The colour change still happens through `style`, so
 * the two together are what makes a tap feel acknowledged.
 */
export function usePressScale(scale = 0.972, disabled = false) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;

  const animate = (to: number) => {
    if (reduced || disabled) return;
    Animated.spring(value, {
      toValue: to,
      damping: 18,
      stiffness: 320,
      mass: 0.6,
      useNativeDriver: true,
    }).start();
  };

  return {
    value,
    scaleStyle: { transform: [{ scale: value }] },
    onPressIn: () => animate(scale),
    onPressOut: () => animate(1),
  };
}

/**
 * A Pressable with the spring press built in.
 *
 * Used anywhere the app previously had `pressed ? 0.985 : 1` — which is to say,
 * everywhere. Same API as `Pressable`, so adoption is a one-word change.
 */
export function PressableScale({
  children,
  style,
  scale = 0.972,
  disabled,
  ...rest
}: PressableProps & {
  children: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  style?: PressableProps['style'];
  scale?: number;
}) {
  const press = usePressScale(scale, disabled);

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(event) => {
        press.onPressIn();
        rest.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        press.onPressOut();
        rest.onPressOut?.(event);
      }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        press.scaleStyle,
      ]}
    >
      {typeof children === 'function' ? children : children}
    </Pressable>
  );
}

/* --------------------------------------------------------------- the header */

/**
 * A slow drift behind a screen header, so the top of a page is a surface rather
 * than a flat block of colour.
 *
 * Not a parallax: it does not follow the scroll (that fights the finger), it
 * settles once over half a second and stops.
 */
export function useWashIn(intensity = 0.9) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      value.setValue(1);
      return;
    }
    Animated.timing(value, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduced, value]);

  return {
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0, intensity] }),
  };
}

/** True on platforms where the native driver is safe for transforms/opacity. */
export const nativeMotion = Platform.OS !== 'web';

/** A memoised press handler set, so rows do not re-create springs on re-render. */
export function useStablePress(scale = 0.972) {
  const press = usePressScale(scale);
  return useMemo(
    () => ({
      onPressIn: press.onPressIn,
      onPressOut: press.onPressOut,
      style: press.scaleStyle,
    }),
    [press.onPressIn, press.onPressOut, press.scaleStyle],
  );
}
