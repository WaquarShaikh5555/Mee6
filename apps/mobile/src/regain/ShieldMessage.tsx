/**
 * The screen shown when a blocked surface is reached.
 *
 * This is the whole feature in one view, so it is built as a component rather
 * than as a route: the same visual is what a future native overlay renders on
 * top of Instagram, and it is what the route in `app/(app)/regain/blocked.tsx`
 * shows inside Shaikh's itself.
 *
 * Deliberately not a scold. It states what is blocked, then hands the choice
 * back — with just enough friction that turning it off is a decision rather
 * than a reflex.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { tapFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';

const HOLD_MS = 2000;
const TICK_MS = 50;

export type ShieldMessageProps = {
  /** e.g. "Instagram". */
  appName: string;
  /** e.g. "Reels feed". */
  sectionName: string;
  /** How many times today, including this one. Omit before the first count. */
  todayCount?: number;
  onDismiss: () => void;
  /** Called after the hold completes. */
  onDisable: () => void;
};

export function ShieldMessage({
  appName,
  sectionName,
  todayCount,
  onDismiss,
  onDisable,
}: ShieldMessageProps) {
  const theme = useTheme();

  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const completed = useRef(false);

  const stopHold = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (!completed.current) setProgress(0);
  }, []);

  useEffect(() => stopHold, [stopHold]);

  const startHold = useCallback(() => {
    if (timer.current || completed.current) return;

    const startedAt = Date.now();
    timer.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.min(1, elapsed / HOLD_MS);
      setProgress(next);

      if (next >= 1 && !completed.current) {
        completed.current = true;
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        void tapFeedback();
        onDisable();
      }
    }, TICK_MS);
  }, [onDisable]);

  const holding = progress > 0;

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        gap: theme.space.xl,
        paddingBottom: theme.space['3xl'],
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: theme.radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accentSubtle,
        }}
      >
        <Ionicons name="leaf-outline" size={26} color={theme.colors.onAccentSubtle} />
      </View>

      <View style={{ gap: theme.space.md }}>
        <Text variant="display" serif>
          Make yourself better.
        </Text>
        <Text variant="body" tone="secondary">
          {sectionName} on {appName} is off while Regain is on. Everything you actually need —
          messages, the people who sent you something — still works.
        </Text>
      </View>

      {typeof todayCount === 'number' && todayCount > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.sm,
            paddingVertical: theme.space.sm,
          }}
        >
          <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.textTertiary} />
          <Text variant="footnote" tone="tertiary">
            {todayCount === 1
              ? 'This is the first time today.'
              : `You have turned away ${todayCount} times today.`}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: theme.space.md, paddingTop: theme.space.lg }}>
        <Button label="Close" onPress={onDismiss} />

        <Pressable
          onPressIn={startHold}
          onPressOut={stopHold}
          accessibilityRole="button"
          accessibilityLabel="Hold to turn Regain off"
          accessibilityHint="Hold for two seconds to switch Regain off"
          style={{
            minHeight: theme.touchTarget,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.colors.separator,
            overflow: 'hidden',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {/* Fills as the hold progresses; there is no other feedback that the
              gesture is being recognised, and a silent gesture feels broken. */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${progress * 100}%`,
              backgroundColor: theme.colors.surfaceSunken,
            }}
          />
          <Text variant="footnote" tone={holding ? 'primary' : 'tertiary'}>
            {holding ? 'Keep holding…' : 'Hold to turn Regain off'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
