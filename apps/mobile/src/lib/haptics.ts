/**
 * Haptics that fail silently.
 *
 * Touch feedback is part of how native an app feels, but it must never be the
 * reason an interaction breaks. Web has no haptics engine, some Android devices
 * disable them at the OS level, and a test environment may stub them out
 * entirely — so every call is wrapped and the result is discarded.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS !== 'web';

function safely(run: () => Promise<unknown> | undefined): void {
  if (!enabled) return;
  try {
    const result = run();
    if (result && typeof result.then === 'function') {
      result.then(undefined, () => {});
    }
  } catch {
    // A failed haptic is not a failed interaction.
  }
}

export function tapFeedback(): void {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function successFeedback(): void {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function errorFeedback(): void {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
