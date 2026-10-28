import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import type { UpdatePhase } from './useUpdate';
import { READ_SECONDS, sizeFor, type UpdateInfo } from './version';

/**
 * The update prompt.
 *
 * It appears as soon as the app is usable, and it will not let anyone update
 * by reflex: the button counts down five seconds while the card explains what
 * is new. "Later" is live from the first frame, because the point is to make
 * someone read the message — not to trap them in it.
 *
 * Every state after the first tap lives in the same card: downloading (with a
 * real percentage), asking for the one-time install permission, handover to
 * Android, and failure with the actual reason.
 */
export function UpdateSheet({
  visible,
  info,
  installed,
  phase,
  onLater,
  onUpdate,
  onGrant,
}: {
  visible: boolean;
  info: UpdateInfo | null;
  installed: string;
  phase: UpdatePhase;
  onLater: () => void;
  onUpdate: () => void;
  onGrant: () => void;
}) {
  const theme = useTheme();
  const [secondsLeft, setSecondsLeft] = useState(READ_SECONDS);

  // The countdown belongs to the prompt being *shown*, so it restarts only when
  // the card appears — never when a download tick re-renders it.
  useEffect(() => {
    if (!visible) return;

    setSecondsLeft(READ_SECONDS);

    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible]);

  if (!info) return null;

  const working = phase.status === 'downloading' || phase.status === 'installing';
  const waiting = secondsLeft > 0;
  const ready = !waiting && !working;

  const downloading = phase.status === 'downloading' ? phase : null;
  const percent = downloading ? Math.round(downloading.progress * 100) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: theme.space.lg,
          backgroundColor: 'rgba(9, 13, 14, 0.72)',
        }}
      >
        <View
          style={{
            gap: theme.space.lg,
            padding: theme.space.xl,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.canvas,
            borderWidth: 1,
            borderColor: theme.colors.separator,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accentSubtle,
              }}
            >
              <Ionicons name="sparkles-outline" size={18} color={theme.colors.onAccentSubtle} />
            </View>

            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1 }}>
              VERSION {info.version}
            </Text>
          </View>

          <View style={{ gap: theme.space.xs }}>
            <Text variant="display" serif>
              {phase.status === 'failed'
                ? 'That did not work'
                : phase.status === 'permission'
                  ? 'One setting first'
                  : `Shaikh's ${info.version} is ready`}
            </Text>

            <Text variant="footnote" tone="secondary">
              You have {installed}.{' '}
              {info.size > 0 ? `The update is ${sizeFor(info.size)}, downloaded inside the app.` : ''}
            </Text>
          </View>

          {phase.status === 'permission' ? (
            <View style={{ gap: theme.space.sm }}>
              <Text variant="callout" tone="secondary">
                Android will not install an app from an app until you allow it once. Open the setting
                below, switch on “Allow from this source”, then come back — the download is already
                done.
              </Text>
              <Button label="Open the setting" icon="settings-outline" onPress={onGrant} />
            </View>
          ) : phase.status === 'failed' ? (
            <View style={{ gap: theme.space.sm }}>
              <Text variant="callout" tone="danger">
                {phase.message}
              </Text>
              <Text variant="footnote" tone="tertiary">
                Nothing on the phone has changed. Your documents and settings are untouched.
              </Text>
            </View>
          ) : downloading ? (
            <View style={{ gap: theme.space.sm }}>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: percent }}
                style={{
                  height: 8,
                  borderRadius: 4,
                  overflow: 'hidden',
                  backgroundColor: theme.colors.surfaceSunken,
                }}
              >
                <View
                  style={{
                    width: `${Math.max(2, percent)}%`,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.colors.accent,
                  }}
                />
              </View>

              <Text variant="footnote" tone="secondary" tabular>
                {percent}%
                {downloading.total > 0
                  ? ` · ${sizeFor(downloading.received)} of ${sizeFor(downloading.total)}`
                  : ''}
              </Text>
            </View>
          ) : phase.status === 'installing' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
              <Ionicons name="phone-portrait-outline" size={18} color={theme.colors.accent} />
              <Text variant="callout" tone="secondary" style={{ flex: 1 }}>
                Android is asking you to confirm. Tap Update there and the app restarts on the new
                version.
              </Text>
            </View>
          ) : (
            <View style={{ gap: theme.space.sm }}>
              {info.notes.length > 0 ? (
                info.notes.map((note) => (
                  <View
                    key={note}
                    style={{ flexDirection: 'row', gap: theme.space.sm, alignItems: 'flex-start' }}
                  >
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        marginTop: 7,
                        backgroundColor: theme.colors.accent,
                      }}
                    />
                    <Text variant="callout" tone="secondary" style={{ flex: 1 }}>
                      {note}
                    </Text>
                  </View>
                ))
              ) : (
                <Text variant="callout" tone="secondary">
                  A newer build with fixes and improvements.
                </Text>
              )}

              <Text variant="caption" tone="tertiary">
                Keeping your documents, your account and your settings.
              </Text>
            </View>
          )}

          {phase.status === 'permission' ? (
            <Button label="Later" variant="secondary" onPress={onLater} />
          ) : phase.status === 'failed' ? (
            /* A failed download must not be a dead end: the same tap starts
               again, and the half-written file is already gone. */
            <View style={{ gap: theme.space.sm }}>
              <Button label="Try again" icon="refresh-outline" onPress={onUpdate} />
              <Button label="Later" variant="secondary" onPress={onLater} />
            </View>
          ) : phase.status === 'installing' ? null : (
            <View style={{ gap: theme.space.sm }}>
              <Button
                label={
                  downloading
                    ? `Downloading… ${percent}%`
                    : waiting
                      ? `Update in ${secondsLeft}s`
                      : 'Update now'
                }
                icon={downloading || waiting ? undefined : 'arrow-down-circle-outline'}
                onPress={onUpdate}
                // Not `loading`: that replaces the label with a spinner, and the
                // percentage is the one thing worth reading mid-download.
                disabled={!ready}
              />

              <Pressable
                onPress={onLater}
                accessibilityRole="button"
                accessibilityLabel="Later"
                style={({ pressed }) => ({
                  alignItems: 'center',
                  paddingVertical: theme.space.sm,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text variant="subhead" tone="secondary">
                  Later
                </Text>
              </Pressable>

              {waiting ? (
                <Text variant="caption" tone="tertiary" align="center">
                  Read what changed — the button unlocks in {secondsLeft}{' '}
                  {secondsLeft === 1 ? 'second' : 'seconds'}.
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
