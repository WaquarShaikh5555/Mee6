import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useRegain } from '@/regain/RegainProvider';
import { Badge } from '@/ui/Badge';
import { Card } from '@/ui/Card';
import { Divider } from '@/ui/Divider';
import { ListRow } from '@/ui/ListRow';
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

const FOUNDATION = [
  { label: 'Design tokens and both themes', done: true },
  { label: 'Navigation and route guards', done: true },
  { label: 'Accounts, sessions, secure storage', done: true },
  { label: 'Regain — your first feature', done: true },
] as const;

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, isDemoMode } = useAuth();
  const { enabled: regainEnabled, blockedSectionCount, todayCount } = useRegain();

  return (
    <Screen gutter="lg">
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

      <View style={{ gap: theme.space.sm, paddingBottom: theme.space['2xl'] }}>
        <Text variant="footnote" tone="tertiary">
          {greeting()}
        </Text>
        <Text variant="title1">{user?.displayName ?? 'There'}</Text>
        <Text variant="body" tone="secondary">
          Your space is set up. The features come next — this is the part where you decide what
          Shaikh’s becomes.
        </Text>
      </View>

      {/* Regain is the first real feature, so it leads the dashboard rather
          than sitting in a list. It states its own state at a glance. */}
      <Pressable
        onPress={() => router.push('/regain')}
        accessibilityRole="button"
        accessibilityLabel={
          regainEnabled
            ? `Regain is on, ${blockedSectionCount} sections blocked. Open Regain.`
            : 'Open Regain'
        }
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <Card
          style={{
            gap: theme.space.md,
            backgroundColor: regainEnabled ? theme.colors.accentSubtle : theme.colors.surface,
            borderColor: regainEnabled ? theme.colors.accentBorder : theme.colors.separator,
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
                backgroundColor: regainEnabled ? theme.colors.accent : theme.colors.surfaceSunken,
              }}
            >
              <Ionicons
                name={regainEnabled ? 'shield-checkmark' : 'shield-outline'}
                size={22}
                color={regainEnabled ? theme.colors.onAccent : theme.colors.textTertiary}
              />
            </View>

            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
                <Text variant="headline" tone={regainEnabled ? 'onAccentSubtle' : 'primary'}>
                  Regain
                </Text>
                {regainEnabled ? <Badge label="On" tone="accent" /> : null}
              </View>
              <Text
                variant="footnote"
                tone={regainEnabled ? 'onAccentSubtle' : 'tertiary'}
                numberOfLines={2}
              >
                {regainEnabled
                  ? `${blockedSectionCount} ${blockedSectionCount === 1 ? 'section' : 'sections'} blocked${todayCount > 0 ? ` · ${todayCount} today` : ''}`
                  : 'Keep the DMs. Lose the Reels scroll.'}
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={20}
              color={regainEnabled ? theme.colors.onAccentSubtle : theme.colors.textTertiary}
            />
          </View>
        </Card>
      </Pressable>

      <Card style={{ padding: 0, overflow: 'hidden', marginTop: theme.space['2xl'] }}>
        <View
          style={{
            padding: theme.space.lg,
            gap: theme.space.sm,
            backgroundColor: theme.colors.accentSubtle,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text variant="headline" tone="onAccentSubtle">
              Foundation complete
            </Text>
            <Badge label="Step 1" tone="accent" />
          </View>
          <Text variant="footnote" tone="onAccentSubtle">
            Everything below is in place and verified.
          </Text>
        </View>

        <View style={{ paddingVertical: theme.space.sm }}>
          {FOUNDATION.map((item, index) => (
            <View key={item.label}>
              {index > 0 ? <Divider inset={theme.space.lg} /> : null}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.md,
                  paddingHorizontal: theme.space.lg,
                  paddingVertical: theme.space.md,
                }}
              >
                <Ionicons
                  name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={item.done ? theme.colors.success : theme.colors.textTertiary}
                />
                <Text variant="callout" tone={item.done ? 'primary' : 'tertiary'}>
                  {item.label}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <View style={{ gap: theme.space.sm, paddingTop: theme.space['2xl'] }}>
        <Text variant="subhead" tone="secondary">
          Explore
        </Text>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow
            title="Design system"
            subtitle="Colours, type, spacing and components"
            icon="color-palette-outline"
            onPress={() => router.push('/design')}
          />
          <Divider inset={theme.space.lg + 32 + theme.space.md} />
          <ListRow
            title="Settings"
            subtitle="Appearance and account"
            icon="options-outline"
            onPress={() => router.push('/settings')}
          />
        </Card>
      </View>

      <View style={{ paddingTop: theme.space['2xl'], gap: theme.space.xs }}>
        <Text variant="caption" tone="tertiary">
          Signed in as {user?.email}
        </Text>
        {isDemoMode ? (
          <Text variant="caption" tone="tertiary">
            Preview build · accounts are stored on this device only.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
