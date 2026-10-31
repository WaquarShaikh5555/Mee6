import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, Switch, View } from 'react-native';

import { useRegain } from '@/regain/RegainProvider';
import { REGAIN_APPS } from '@/regain/catalog';
import {
  explanationFor,
  getEnforcementStatus,
  granularityFor,
  openEnforcementSettings,
  type EnforcementStatus,
} from '@/regain/enforcement';
import { blockedSectionsFor } from '@/regain/store';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Divider } from '@/ui/Divider';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

const ROW_INSET = 16 + 32 + 12;

export default function RegainScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    isReady,
    enabled,
    state,
    apps,
    blockedSectionCount,
    todayCount,
    setEnabled,
    resetRules,
  } = useRegain();

  const [enforcement, setEnforcement] = useState<EnforcementStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      void getEnforcementStatus().then((status) => {
        if (!cancelled) setEnforcement(status);
      });
    };

    refresh();

    // The permission is granted in Settings, so the answer changes while the
    // app is in the background. Re-ask on the way back in.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const toggle = useCallback(() => setEnabled(!enabled), [enabled, setEnabled]);

  if (!isReady) {
    // Brief: reading the stored rules takes a frame or two on a cold start.
    return <Screen>{null}</Screen>;
  }

  const appCount = apps.length;
  const unavailable = enforcement?.availability !== 'ready';
  const appOnly = enforcement ? granularityFor(enforcement.platform) === 'app-only' : false;

  return (
    <Screen>
      <ScreenHeader title="Regain" />

      <View style={{ gap: theme.space.sm, paddingTop: theme.space.lg, paddingBottom: theme.space.xl }}>
        <Text variant="display" serif>
          Regain
        </Text>
        <Text variant="body" tone="secondary">
          Keep the parts of these apps that connect you, and close the parts that only consume you.
        </Text>
      </View>

      {/* --------------------------------------------------------- master --- */}
      <Card
        style={{
          borderColor: enabled ? theme.colors.accentBorder : theme.colors.separator,
          backgroundColor: enabled ? theme.colors.accentSubtle : theme.colors.surface,
        }}
      >
        {/* The row is tappable for convenience, but the Switch is the control:
            marking the wrapper inaccessible keeps a screen reader from
            announcing the same toggle twice. */}
        <Pressable
          onPress={toggle}
          accessible={false}
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: enabled ? theme.colors.accent : theme.colors.surfaceSunken,
            }}
          >
            <Ionicons
              name={enabled ? 'shield-checkmark' : 'shield-outline'}
              size={22}
              color={enabled ? theme.colors.onAccent : theme.colors.textTertiary}
            />
          </View>

          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="headline" tone={enabled ? 'onAccentSubtle' : 'primary'}>
              {enabled ? 'Regain is on' : 'Regain is off'}
            </Text>
            <Text variant="footnote" tone={enabled ? 'onAccentSubtle' : 'tertiary'}>
              {blockedSectionCount === 0
                ? 'Nothing selected yet — choose what to close below.'
                : `${blockedSectionCount} ${blockedSectionCount === 1 ? 'section' : 'sections'} across ${appCount} ${appCount === 1 ? 'app' : 'apps'}`}
            </Text>
          </View>

          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            thumbColor={theme.colors.surface}
            ios_backgroundColor={theme.colors.border}
            accessibilityLabel="Regain active"
          />
        </Pressable>

        {enabled && todayCount > 0 ? (
          <>
            <View style={{ paddingTop: theme.space.md }}>
              <Divider />
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.sm,
                paddingTop: theme.space.md,
              }}
            >
              <Ionicons name="hand-left-outline" size={16} color={theme.colors.onAccentSubtle} />
              <Text variant="footnote" tone="onAccentSubtle">
                {todayCount === 1
                  ? 'You stepped away once today.'
                  : `You stepped away ${todayCount} times today.`}
              </Text>
            </View>
          </>
        ) : null}
      </Card>

      {/* ------------------------------------------------------------ apps --- */}
      <View style={{ gap: theme.space.sm, paddingTop: theme.space['2xl'] }}>
        <Text variant="subhead" tone="secondary">
          Apps
        </Text>

        <Card padded={false} style={{ overflow: 'hidden' }}>
          {REGAIN_APPS.map((app, index) => {
            const blocked = blockedSectionsFor(state, app).length;
            const switchable = app.sections.filter((section) => section.blockable).length;

            return (
              <View key={app.id}>
                {index > 0 ? <Divider inset={ROW_INSET} /> : null}
                <Pressable
                  onPress={() => router.push(`/regain/${app.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${app.name}, ${blocked} of ${switchable} blocked`}
                  style={({ pressed }) => ({
                    minHeight: theme.touchTarget,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space.md,
                    paddingVertical: theme.space.md,
                    paddingHorizontal: theme.space.lg,
                    backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
                  })}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: theme.radius.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor:
                        blocked > 0 && enabled
                          ? theme.colors.accentSubtle
                          : theme.colors.surfaceSunken,
                    }}
                  >
                    <Ionicons
                      name={app.icon}
                      size={18}
                      color={
                        blocked > 0 && enabled
                          ? theme.colors.onAccentSubtle
                          : theme.colors.textTertiary
                      }
                    />
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body">{app.name}</Text>
                    <Text variant="footnote" tone="tertiary" numberOfLines={1}>
                      {blocked === 0 ? 'Nothing blocked' : `${blocked} of ${switchable} blocked`}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </Pressable>
              </View>
            );
          })}
        </Card>

        <Text variant="caption" tone="tertiary">
          Apps you do not see here are not in Regain yet.
        </Text>
      </View>

      {/* --------------------------------------------------------- how it works --- */}
      <View style={{ gap: theme.space.sm, paddingTop: theme.space['2xl'] }}>
        <Text variant="subhead" tone="secondary">
          How it works
        </Text>

        <Card style={{ gap: theme.space.md }}>
          <Explain
            icon="lock-closed-outline"
            title="Messages never get blocked"
            body="Anything marked “always available” stays open, on purpose. Regain closes the endless parts, not the people."
          />
          <Explain
            icon="hand-left-outline"
            title="Turning it off takes two seconds"
            body="When a screen is blocked, hold the button for two seconds. Enough friction to notice the reflex, not enough to trap you."
          />

          {/* Said out loud, in the app, because it is a promise and not an
              oversight: the ad that pays for Shaikh's lives in PDF Arena, never
              here. */}
          <Explain
            icon="leaf-outline"
            title="Regain has no ads"
            body="Shaikh's is paid for by one optional ad in PDF Arena. Nothing in Regain will ever try to sell you something, and nothing here is timed, unlocked or limited."
          />

          {enforcement ? (
            <Explain
              icon={unavailable ? 'information-circle-outline' : 'phone-portrait-outline'}
              title={
                appOnly
                  ? 'iPhone can only block whole apps'
                  : unavailable
                    ? 'Preview build'
                    : 'Watching for the blocked screens'
              }
              body={explanationFor(enforcement)}
            />
          ) : null}

          {enforcement?.availability === 'blocked-by-permission' ? (
            <Button
              label="Open phone settings"
              variant="secondary"
              onPress={() => void openEnforcementSettings()}
            />
          ) : null}
        </Card>
      </View>

      {/* ------------------------------------------------------------ preview --- */}
      {unavailable ? (
        <View style={{ gap: theme.space.sm, paddingTop: theme.space['2xl'] }}>
          <Text variant="subhead" tone="secondary">
            Try it
          </Text>
          <Card style={{ gap: theme.space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
              <Badge label="Preview" tone="brass" />
              <Text variant="caption" tone="tertiary" style={{ flex: 1 }}>
                {enforcement?.availability === 'not-in-this-build'
                  ? 'The rules and the block screen work here; the full build is the one that enforces them on Instagram.'
                  : 'The rules are saved and tested. Blocking inside Instagram starts in the native build.'}
              </Text>
            </View>
            <Button
              label="See the block screen"
              variant="secondary"
              onPress={() => router.push('/regain/blocked?appId=instagram&sectionId=reels')}
            />
          </Card>
        </View>
      ) : null}

      <View style={{ paddingTop: theme.space['2xl'] }}>
        <Button label="Restore default rules" variant="ghost" onPress={resetRules} />
      </View>

      <View style={{ paddingTop: theme.space.lg }}>
        <Text variant="caption" tone="tertiary">
          Regain is a tool, not a diagnosis. If these apps are costing you more than they give you,
          talking to someone helps more than any setting.
        </Text>
      </View>
    </Screen>
  );
}

function Explain({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', gap: theme.space.md }}>
      <Ionicons name={icon} size={18} color={theme.colors.textTertiary} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout">{title}</Text>
        <Text variant="footnote" tone="tertiary">
          {body}
        </Text>
      </View>
    </View>
  );
}
