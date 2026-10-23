import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useRegain } from '@/regain/RegainProvider';
import { getEnforcementStatus, getLastSighting, type EnforcementStatus, type Sighting } from '@/regain/enforcement';
import { REGAIN_APPS } from '@/regain/catalog';
import { blockedSectionsFor } from '@/regain/store';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Divider } from '@/ui/Divider';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The owner's view.
 *
 * Reached only when the database says this account is admin — a column the app
 * has no permission to write. Everything here is read-only or locally
 * reversible: diagnostics people can send when something does not work, and a
 * way to see exactly what Regain thinks it is looking at.
 */
export default function DeveloperScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { state, enabled, blockedSectionCount, todayCount, resetRules } = useRegain();

  const [enforcement, setEnforcement] = useState<EnforcementStatus | null>(null);
  const [sighting, setSighting] = useState<Sighting | null>(null);

  const refresh = useCallback(async () => {
    const [status, last] = await Promise.all([getEnforcementStatus(), getLastSighting()]);
    setEnforcement(status);
    setSighting(last);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!user?.isAdmin) {
    return (
      <Screen>
        <ScreenHeader title="Developer" />
        <Card style={{ gap: theme.space.sm }}>
          <Text variant="headline">Not available</Text>
          <Text variant="footnote" tone="tertiary">
            This screen is tied to an owner account. Your account is an ordinary one, and there
            is no way to change that from inside the app.
          </Text>
        </Card>
      </Screen>
    );
  }

  const rules = REGAIN_APPS.map((app) => ({
    app: app.name,
    sections: blockedSectionsFor(state, app),
  })).filter((entry) => entry.sections.length > 0);

  const diagnostics = [
    `Shaikh's ${Constants.expoConfig?.version ?? '?'} · ${Platform.OS} ${Platform.Version}`,
    `account: ${user.email} · owner`,
    `enforcement: ${enforcement?.availability ?? 'unknown'}`,
    `regain: ${enabled ? 'on' : 'off'} · ${blockedSectionCount} sections · ${todayCount} today`,
    `last seen: ${sighting?.summary || 'nothing yet'}`,
    `rules: ${JSON.stringify(Object.fromEntries(rules.map((r) => [r.app, r.sections])))}`,
  ].join('\n');

  return (
    <Screen>
      <ScreenHeader title="Developer" />

      <View style={{ gap: theme.space.sm, paddingVertical: theme.space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Text variant="title2">Owner tools</Text>
          <Badge label="Admin" tone="brass" />
        </View>
        <Text variant="footnote" tone="secondary">
          Granted by the database, not by the app. Nobody can promote themselves here.
        </Text>
      </View>

      <Card style={{ gap: theme.space.sm }}>
        <Row label="Signed in as" value={user.email} />
        <Divider />
        <Row label="App version" value={Constants.expoConfig?.version ?? 'unknown'} />
        <Divider />
        <Row label="Platform" value={`${Platform.OS} ${String(Platform.Version)}`} />
        <Divider />
        <Row
          label="Regain status"
          value={
            enforcement?.availability === 'ready'
              ? 'Service running'
              : enforcement?.availability === 'blocked-by-permission'
                ? 'Permission off'
                : 'No native module'
          }
        />
      </Card>

      <View style={{ gap: theme.space.sm, paddingTop: theme.space['2xl'] }}>
        <Text variant="subhead" tone="secondary">
          What Regain last saw
        </Text>
        <Card style={{ gap: theme.space.sm }}>
          <Text variant="callout">{sighting?.summary || 'Nothing yet.'}</Text>
          <Text variant="caption" tone="tertiary">
            {sighting && sighting.at > 0
              ? `Recorded ${new Date(sighting.at).toLocaleString()}`
              : 'Open one of the apps with Regain on, then come back.'}
          </Text>
          <Text variant="caption" tone="tertiary">
            This is how the recogniser is corrected for a new version of an app: it shows the
            view ids the phone actually found.
          </Text>
        </Card>
      </View>

      <View style={{ gap: theme.space.sm, paddingTop: theme.space['2xl'] }}>
        <Text variant="subhead" tone="secondary">
          Rules in force
        </Text>
        <Card style={{ gap: theme.space.sm }}>
          {rules.length === 0 ? (
            <Text variant="callout" tone="tertiary">
              Nothing is closed.
            </Text>
          ) : (
            rules.map((entry) => (
              <View key={entry.app} style={{ flexDirection: 'row', gap: theme.space.sm }}>
                <Text variant="callout" style={{ width: 92 }}>
                  {entry.app}
                </Text>
                <Text variant="callout" tone="tertiary" style={{ flex: 1 }}>
                  {entry.sections.join(', ')}
                </Text>
              </View>
            ))
          )}
        </Card>
      </View>

      <View style={{ gap: theme.space.md, paddingTop: theme.space['2xl'] }}>
        <Button
          label="Refresh"
          variant="secondary"
          onPress={() => void refresh()}
        />
        <Button
          label="Share diagnostics"
          variant="secondary"
          onPress={() => void Share.share({ message: diagnostics })}
        />
        <Button label="Restore default rules" variant="ghost" onPress={resetRules} />
      </View>

      <View style={{ paddingTop: theme.space['2xl'], gap: theme.space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Ionicons name="information-circle-outline" size={16} color={theme.colors.textTertiary} />
          <Text variant="caption" tone="tertiary" style={{ flex: 1 }}>
            Adding another owner is a database change, deliberately: there is no in-app path that
            could be abused to grant it.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.md }}>
      <Text variant="footnote" tone="tertiary" style={{ width: 120 }}>
        {label}
      </Text>
      <Text variant="footnote" style={{ flex: 1 }} selectable>
        {value}
      </Text>
    </View>
  );
}
