import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Switch, View } from 'react-native';

import { useFocus } from '@/focus/FocusProvider';
import { findApp, type FocusSection } from '@/focus/catalog';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Divider } from '@/ui/Divider';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

export default function FocusAppScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { appId } = useLocalSearchParams<{ appId?: string }>();
  const { enabled, toggleSection, blockedSections, recordIntervention } = useFocus();

  const app = findApp(appId);

  if (!app) {
    return (
      <Screen>
        <ScreenHeader title="Focus Mode" />
        <View style={{ gap: theme.space.lg, paddingTop: theme.space['2xl'] }}>
          <Text variant="title2">App not found</Text>
          <Text variant="body" tone="secondary">
            That app is not part of Focus Mode yet.
          </Text>
          <Button label="Back to Focus Mode" onPress={() => router.replace('/focus')} />
        </View>
      </Screen>
    );
  }

  const blocked = new Set(blockedSections(app.id));
  const switchable = app.sections.filter((section) => section.blockable);
  const always = app.sections.filter((section) => !section.blockable);

  return (
    <Screen>
      <ScreenHeader title="Focus Mode" />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.md,
          paddingTop: theme.space.lg,
          paddingBottom: theme.space.xl,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: theme.radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accentSubtle,
          }}
        >
          <Ionicons name={app.icon} size={24} color={theme.colors.onAccentSubtle} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title2">{app.name}</Text>
          <Text variant="footnote" tone="tertiary">
            {app.blurb}
          </Text>
        </View>
      </View>

      {!enabled ? (
        <Card
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.sm,
            paddingVertical: theme.space.md,
            backgroundColor: theme.colors.warningSubtle,
            borderColor: theme.colors.warningSubtle,
          }}
        >
          <Ionicons name="pause-circle-outline" size={18} color={theme.colors.warning} />
          <Text variant="footnote" tone="warning" style={{ flex: 1 }}>
            Focus Mode is off. These rules apply the moment you switch it on.
          </Text>
        </Card>
      ) : null}

      {/* --------------------------------------------------- blocked surfaces --- */}
      <View style={{ gap: theme.space.sm, paddingTop: theme.space.lg }}>
        <Text variant="subhead" tone="secondary">
          Blocked while Focus Mode is on
        </Text>

        <Card padded={false} style={{ overflow: 'hidden' }}>
          {switchable.map((section, index) => (
            <View key={section.id}>
              {index > 0 ? <Divider inset={theme.space.lg} /> : null}
              <SectionRow
                section={section}
                value={blocked.has(section.id)}
                onValueChange={() => toggleSection(app.id, section.id)}
                onPreview={
                  enabled && blocked.has(section.id)
                    ? () => {
                        recordIntervention();
                        router.push(
                          `/focus/blocked?appId=${app.id}&sectionId=${section.id}`,
                        );
                      }
                    : undefined
                }
              />
            </View>
          ))}
        </Card>
      </View>

      {/* ------------------------------------------------------ never blocked --- */}
      {always.length > 0 ? (
        <View style={{ gap: theme.space.sm, paddingTop: theme.space['2xl'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <Text variant="subhead" tone="secondary">
              Always available
            </Text>
            <Badge label="Never blocked" tone="brass" />
          </View>

          <Card padded={false} style={{ overflow: 'hidden' }}>
            {always.map((section, index) => (
              <View key={section.id}>
                {index > 0 ? <Divider inset={theme.space.lg} /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: theme.space.md,
                    paddingVertical: theme.space.md,
                    paddingHorizontal: theme.space.lg,
                  }}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={theme.colors.success}
                    style={{ marginTop: 1 }}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body">{section.name}</Text>
                    <Text variant="footnote" tone="tertiary">
                      {section.detail}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View style={{ paddingTop: theme.space['2xl'] }}>
        <Text variant="caption" tone="tertiary">
          {blocked.size === 0
            ? 'Nothing is blocked in this app right now.'
            : `${blocked.size} of ${switchable.length} blocked. The rest of ${app.name} works normally.`}
        </Text>
      </View>
    </Screen>
  );
}

function SectionRow({
  section,
  value,
  onValueChange,
  onPreview,
}: {
  section: FocusSection;
  value: boolean;
  onValueChange: () => void;
  onPreview?: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        paddingVertical: theme.space.md,
        paddingHorizontal: theme.space.lg,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{section.name}</Text>
        <Text variant="footnote" tone="tertiary">
          {section.detail}
        </Text>
        {onPreview ? (
          <Text
            variant="caption"
            tone="accent"
            onPress={onPreview}
            accessibilityRole="link"
            style={{ paddingTop: 2 }}
          >
            See what gets blocked
          </Text>
        ) : null}
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
        thumbColor={theme.colors.surface}
        ios_backgroundColor={theme.colors.border}
        accessibilityLabel={`Block ${section.name}`}
      />
    </View>
  );
}
