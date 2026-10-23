import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { useRouter } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Divider } from '@/ui/Divider';
import { ListRow } from '@/ui/ListRow';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Text } from '@/ui/Text';
import { useTheme, useThemeController, type ThemePreference } from '@/theme/ThemeProvider';

const ROW_INSET = 16 + 32 + 12;

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { preference, setPreference } = useThemeController();
  const { user, signOut, isSubmitting, isDemoMode } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      void performSignOut();
      return;
    }
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void performSignOut() },
    ]);
  }

  async function performSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Settings" />

      <View style={{ gap: theme.space.sm, paddingVertical: theme.space.xl }}>
        <Text variant="title2">Your account</Text>
      </View>

      <Card padded={false} style={{ overflow: 'hidden' }}>
        <ListRow title={user?.displayName ?? 'Signed in'} subtitle={user?.email} icon="person-outline" showChevron={false} />
        <Divider inset={ROW_INSET} />
        <ListRow
          title="Member since"
          icon="calendar-outline"
          value={
            user
              ? new Date(user.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  year: 'numeric',
                })
              : undefined
          }
          showChevron={false}
        />
      </Card>

      <View style={{ gap: theme.space.sm, paddingTop: theme.space['2xl'] }}>
        <Text variant="title3">Appearance</Text>
        <Text variant="footnote" tone="secondary" style={{ paddingBottom: theme.space.xs }}>
          Follows your device by default. Your choice is remembered.
        </Text>
        <SegmentedControl<ThemePreference>
          accessibilityLabel="Appearance"
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </View>

      {user?.isAdmin ? (
        <View style={{ gap: theme.space.sm, paddingTop: theme.space['2xl'] }}>
          <Text variant="title3">Owner</Text>
          <Card padded={false} style={{ overflow: 'hidden' }}>
            <ListRow
              title="Developer options"
              subtitle="Diagnostics, what Regain sees, and shared tools"
              icon="construct-outline"
              onPress={() => router.push('/developer')}
            />
          </Card>
        </View>
      ) : null}

      <View style={{ gap: theme.space.sm, paddingTop: theme.space['2xl'] }}>
        <Text variant="title3">Legal</Text>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow
            title="Privacy policy"
            subtitle="What is kept, and what never leaves your phone"
            icon="lock-closed-outline"
            onPress={() => router.push('/legal/privacy')}
          />
          <Divider inset={ROW_INSET} />
          <ListRow
            title="Terms of use"
            subtitle="The agreement between you and Shaikh’s"
            icon="document-text-outline"
            onPress={() => router.push('/legal/terms')}
          />
        </Card>
      </View>

      <View style={{ gap: theme.space.sm, paddingTop: theme.space['2xl'] }}>
        <Text variant="title3">About</Text>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow
            title="Version"
            icon="information-circle-outline"
            value={`${Constants.expoConfig?.version ?? '1.0.0'}`}
            showChevron={false}
          />
          <Divider inset={ROW_INSET} />
          <ListRow
            title="Account type"
            subtitle={isDemoMode ? 'Local preview account' : 'Connected account'}
            icon="shield-checkmark-outline"
            showChevron={false}
          />
        </Card>
        {isDemoMode ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.sm,
              paddingTop: theme.space.sm,
            }}
          >
            <Badge label="Preview" tone="brass" />
            <Text variant="caption" tone="tertiary" style={{ flex: 1 }}>
              Authentication currently runs on the device. Connecting a provider is the next
              infrastructure step.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ paddingTop: theme.space['2xl'] }}>
        <Button
          label={signingOut || isSubmitting ? 'Signing out…' : 'Sign out'}
          variant="destructive"
          loading={signingOut || isSubmitting}
          onPress={confirmSignOut}
        />
      </View>
    </Screen>
  );
}
