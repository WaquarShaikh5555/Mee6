import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useFocus } from '@/focus/FocusProvider';
import { Badge } from '@/ui/Badge';
import { Card } from '@/ui/Card';
import { FadeIn, STAGGER_MS } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Wordmark } from '@/ui/Wordmark';
import { useTheme } from '@/theme/ThemeProvider';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, isDemoMode } = useAuth();
  const { enabled: focusEnabled, blockedSectionCount, todayCount } = useFocus();

  return (
    <Screen gutter="lg">
      <FadeIn offset={8}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            paddingTop: theme.space.lg,
            paddingBottom: theme.space.xl,
          }}
        >
          <Wordmark size="sm" />
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={theme.space.md}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.full,
              backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
            })}
          >
            <Ionicons name="settings-outline" size={22} color={theme.colors.text} />
          </Pressable>
        </View>
      </FadeIn>

      <FadeIn offset={8} delay={STAGGER_MS} style={{ paddingBottom: theme.space['2xl'] }}>
        <View style={{ gap: theme.space.sm }}>
          <Text variant="footnote" tone="tertiary">
            {greeting()}
          </Text>
          <Text variant="title1">{user?.displayName ?? 'There'}</Text>
          <Text variant="body" tone="secondary">
            {focusEnabled
              ? 'Focus Mode is watching the parts you closed. Everything else stays where it was.'
              : 'One switch closes the endless parts of Instagram, YouTube and the rest.'}
          </Text>
        </View>
      </FadeIn>

      {/* Focus Mode is the first real feature, so it leads the dashboard rather
          than sitting in a list. It states its own state at a glance. */}
      <FadeIn offset={12} delay={STAGGER_MS * 2}>
        <Card
          onPress={() => router.push('/focus')}
          accessibilityLabel={
            focusEnabled
              ? `Focus Mode is on, ${blockedSectionCount} sections blocked. Open Focus Mode.`
              : 'Open Focus Mode'
          }
          style={{
            gap: theme.space.md,
            backgroundColor: focusEnabled ? theme.colors.accentSubtle : theme.colors.surface,
            borderColor: focusEnabled ? theme.colors.accentBorder : theme.colors.separator,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radius.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focusEnabled ? theme.colors.accent : theme.colors.accentSubtle,
              }}
            >
              <Ionicons
                name={focusEnabled ? 'shield-checkmark' : 'shield-outline'}
                size={22}
                color={focusEnabled ? theme.colors.onAccent : theme.colors.onAccentSubtle}
              />
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
                <Text variant="headline" tone={focusEnabled ? 'onAccentSubtle' : 'primary'}>
                  Focus Mode
                </Text>
                {focusEnabled ? <Badge label="On" tone="accent" /> : null}
              </View>
              <Text
                variant="footnote"
                tone={focusEnabled ? 'onAccentSubtle' : 'tertiary'}
                numberOfLines={2}
              >
                {focusEnabled
                  ? `${blockedSectionCount} ${blockedSectionCount === 1 ? 'section' : 'sections'} blocked${todayCount > 0 ? ` · ${todayCount} today` : ''}`
                  : 'Keep the DMs. Lose the Reels scroll.'}
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={20}
              color={focusEnabled ? theme.colors.onAccentSubtle : theme.colors.textTertiary}
            />
          </View>
        </Card>
      </FadeIn>

      {/* PDF Arena sits beside Focus Mode, not under it: both are the reason the
          app exists, and a dashboard with one card looks like a demo. */}
      <FadeIn offset={12} delay={STAGGER_MS * 3} style={{ marginTop: theme.space.md }}>
        <Card
          onPress={() => router.push('/pdf')}
          accessibilityLabel="Open PDF Arena, 21 tools that work on this phone"
          style={{ gap: theme.space.md }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radius.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.brassSubtle,
              }}
            >
              <Ionicons name="documents-outline" size={22} color={theme.colors.onBrassSubtle} />
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline">PDF Arena</Text>
              <Text variant="footnote" tone="tertiary" numberOfLines={2}>
                Twenty-one tools that work on this phone. No uploads, no account.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
          </View>

          {/* The four family colours, named. This is the whole colour system in
              four words, and it makes the card read as a place rather than a
              menu item. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
            {(
              [
                ['Edit', theme.categories.Edit],
                ['Optimise', theme.categories.Optimise],
                ['Secure', theme.categories.Secure],
                ['Convert', theme.categories.Convert],
              ] as const
            ).map(([label, tone]) => (
              <View
                key={label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: theme.space.sm,
                  paddingVertical: 3,
                  borderRadius: theme.radius.full,
                  backgroundColor: tone.wash,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: tone.ink,
                  }}
                />
                <Text variant="caption" style={{ color: tone.ink }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </FadeIn>

      <FadeIn offset={12} delay={STAGGER_MS * 4} style={{ marginTop: theme.space['2xl'] }}>
        <Card style={{ gap: theme.space.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="subhead" tone="secondary">
              Today
            </Text>
            <Badge label="On this phone" tone="lagoon" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space.sm }}>
            <Text variant="display" tone="lagoon">
              {String(todayCount)}
            </Text>
            <Text variant="footnote" tone="tertiary">
              {todayCount === 1 ? 'time you stepped away' : 'times you stepped away'}
            </Text>
          </View>
          <Text variant="caption" tone="tertiary">
            Counted on this phone. Nothing is uploaded.
          </Text>
        </Card>
      </FadeIn>

      <FadeIn offset={0} delay={STAGGER_MS * 5} style={{ paddingTop: theme.space['2xl'], gap: theme.space.xs }}>
        <Text variant="caption" tone="tertiary">
          Signed in as {user?.email}
        </Text>
        {isDemoMode ? (
          <Text variant="caption" tone="tertiary">
            Preview build · accounts are stored on this device only.
          </Text>
        ) : null}
      </FadeIn>
    </Screen>
  );
}
