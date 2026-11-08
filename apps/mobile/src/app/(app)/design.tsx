import { View } from 'react-native';

import { contrastRatio, formatRatio, meetsWcag } from '@/theme/contrast';
import { useTheme, useThemeController, type ThemePreference } from '@/theme/ThemeProvider';
import type { TypeVariant } from '@/theme/tokens';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Divider } from '@/ui/Divider';
import { ListRow } from '@/ui/ListRow';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

const PALETTE: { token: keyof ReturnType<typeof useTheme>['colors']; label: string }[] = [
  { token: 'accent', label: 'Accent · Peacock' },
  { token: 'brass', label: 'Brass · secondary' },
  { token: 'text', label: 'Text · primary' },
  { token: 'textSecondary', label: 'Text · secondary' },
  { token: 'textTertiary', label: 'Text · tertiary' },
  { token: 'surface', label: 'Surface' },
  { token: 'surfaceSunken', label: 'Surface · sunken' },
  { token: 'border', label: 'Border' },
  { token: 'success', label: 'Success' },
  { token: 'warning', label: 'Warning' },
  { token: 'danger', label: 'Danger' },
  { token: 'info', label: 'Info' },
];

const TYPE_SPECIMENS: { variant: TypeVariant; label: string }[] = [
  { variant: 'display', label: 'Display' },
  { variant: 'title1', label: 'Title 1' },
  { variant: 'title2', label: 'Title 2' },
  { variant: 'title3', label: 'Title 3' },
  { variant: 'headline', label: 'Headline' },
  { variant: 'body', label: 'Body' },
  { variant: 'footnote', label: 'Footnote' },
  { variant: 'caption', label: 'Caption' },
];

const REJECTED = [
  {
    name: 'Cream + terracotta',
    colors: ['#F4F1EA', '#D97757', '#1A1A1A'],
    why: 'The default generated-app look. Every second build ships it.',
  },
  {
    name: 'Near-black + acid green',
    colors: ['#0B0B0B', '#B6F32A', '#151515'],
    why: 'Trendy, but it reads as a developer tool rather than a personal space.',
  },
  {
    name: 'Blue SaaS',
    colors: ['#FFFFFF', '#2563EB', '#F1F5F9'],
    why: 'Correct and forgettable. Nothing here would be memorable.',
  },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space.md, paddingTop: theme.space['2xl'] }}>
      <View style={{ gap: theme.space.xs }}>
        <Text variant="title3">{title}</Text>
        {description ? (
          <Text variant="footnote" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export default function DesignScreen() {
  const theme = useTheme();
  const { preference, setPreference, scheme } = useThemeController();

  return (
    <Screen>
      <ScreenHeader title="Design system" />

      <View style={{ gap: theme.space.sm, paddingVertical: theme.space.xl }}>
        <Text variant="title2">Ink &amp; Peacock</Text>
        <Text variant="body" tone="secondary">
          One brand accent, warm neutrals, brass for milestones. This screen is generated from the
          same tokens the app uses — if it looks right here, it looks right everywhere.
        </Text>
      </View>

      <View style={{ gap: theme.space.sm }}>
        <Text variant="subhead" tone="secondary">
          Appearance
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
        <Text variant="caption" tone="tertiary">
          Currently showing the {scheme} theme.
        </Text>
      </View>

      <Section
        title="Palette"
        description="Contrast is measured against the canvas and checked in the test suite, not eyeballed."
      >
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {PALETTE.map((entry, index) => {
            const color = theme.colors[entry.token];
            const ratio = contrastRatio(color, theme.colors.canvas);
            const passes = meetsWcag(ratio, 'body');
            return (
              <View key={entry.token}>
                {index > 0 ? <Divider inset={theme.space.lg} /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space.md,
                    padding: theme.space.md,
                    paddingHorizontal: theme.space.lg,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: theme.radius.sm,
                      backgroundColor: color,
                      borderWidth: 1,
                      borderColor: theme.colors.separator,
                    }}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="subhead">{entry.label}</Text>
                    <Text variant="caption" tone="tertiary">
                      {color}
                    </Text>
                  </View>
                  <Text
                    variant="caption"
                    tone={passes ? 'success' : 'danger'}
                    tabular
                  >
                    {formatRatio(ratio)}
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>
      </Section>

      <Section
        title="Typography"
        description="System faces: Georgia for the wordmark and statements, the platform UI sans for everything else. Sizes in points, all scaling with Dynamic Type."
      >
        <Card>
          <View style={{ gap: theme.space.lg }}>
            {TYPE_SPECIMENS.map((specimen) => {
              const token = theme.typography[specimen.variant];
              return (
                <View key={specimen.variant} style={{ gap: 2 }}>
                  <Text variant="caption" tone="tertiary" tabular>
                    {specimen.label} · {token.fontSize}/{token.lineHeight} · {token.fontWeight}
                  </Text>
                  <Text variant={specimen.variant} numberOfLines={1}>
                    Shaikh’s
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>
      </Section>

      <Section
        title="Spacing and shape"
        description="A 4-point grid. Radii differ by hierarchy on purpose: inputs 12, cards 18, sheets 26, tags full."
      >
        <Card>
          <View style={{ gap: theme.space.md }}>
            {(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const).map((step) => (
              <View
                key={step}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
              >
                <Text variant="caption" tone="tertiary" style={{ width: 32 }}>
                  {step}
                </Text>
                <View
                  style={{
                    width: theme.space[step],
                    height: 12,
                    borderRadius: 3,
                    backgroundColor: theme.colors.accent,
                  }}
                />
                <Text variant="caption" tone="tertiary" tabular>
                  {theme.space[step]}pt
                </Text>
              </View>
            ))}
            <Divider />
            <View style={{ flexDirection: 'row', gap: theme.space.lg, alignItems: 'flex-end' }}>
              {(['sm', 'md', 'lg', 'xl', 'full'] as const).map((step) => (
                <View key={step} style={{ alignItems: 'center', gap: theme.space.xs }}>
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: theme.radius[step],
                      backgroundColor: theme.colors.accentSubtle,
                      borderWidth: 1,
                      borderColor: theme.colors.accentBorder,
                    }}
                  />
                  <Text variant="caption" tone="tertiary">
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Card>
      </Section>

      <Section title="Components" description="The pieces every future screen is assembled from.">
        <Card>
          <View style={{ gap: theme.space.md }}>
            <Button label="Primary action" onPress={() => {}} />
            <Button label="Secondary action" variant="secondary" onPress={() => {}} />
            <Button label="Quiet action" variant="ghost" onPress={() => {}} />
            <Button label="Destructive action" variant="destructive" onPress={() => {}} />
            <Button label="Loading" onPress={() => {}} loading />
          </View>
        </Card>

        <Card>
          <View style={{ gap: theme.space.lg }}>
            <TextField label="Email" placeholder="you@example.com" value="" onChangeText={() => {}} />
            <TextField
              label="Password"
              placeholder="At least 8 characters"
              value=""
              onChangeText={() => {}}
              secureTextEntry
              hint="Mix letters and numbers."
            />
            <TextField
              label="With an error"
              placeholder="you@example.com"
              value="not-an-email"
              onChangeText={() => {}}
              error="That email address does not look right."
            />
          </View>
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
            <Badge label="Neutral" />
            <Badge label="Accent" tone="accent" />
            <Badge label="Brass" tone="brass" />
            <Badge label="Success" tone="success" />
            <Badge label="Warning" tone="warning" />
            <Badge label="Danger" tone="danger" />
            <Badge label="Info" tone="info" />
          </View>
        </Card>

        <Card padded={false} style={{ overflow: 'hidden' }}>
          <ListRow title="A navigable row" icon="arrow-forward-circle-outline" onPress={() => {}} />
          <Divider inset={theme.space.lg + 32 + theme.space.md} />
          <ListRow title="A row with a value" value="Value" onPress={() => {}} />
        </Card>
      </Section>

      <Section
        title="Directions considered and rejected"
        description="Recorded so the choice stays a decision rather than drifting back to a default."
      >
        <View style={{ gap: theme.space.md }}>
          {REJECTED.map((option) => (
            <View
              key={option.name}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.md,
                padding: theme.space.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.separator,
              }}
            >
              <View style={{ flexDirection: 'row' }}>
                {option.colors.map((color) => (
                  <View
                    key={color}
                    style={{
                      width: 22,
                      height: 44,
                      backgroundColor: color,
                      borderTopLeftRadius: color === option.colors[0] ? 6 : 0,
                      borderBottomLeftRadius: color === option.colors[0] ? 6 : 0,
                      borderTopRightRadius: color === option.colors[option.colors.length - 1] ? 6 : 0,
                      borderBottomRightRadius:
                        color === option.colors[option.colors.length - 1] ? 6 : 0,
                    }}
                  />
                ))}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subhead">{option.name}</Text>
                <Text variant="caption" tone="tertiary">
                  {option.why}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Section>

      <Text variant="caption" tone="tertiary" style={{ paddingTop: theme.space['2xl'] }}>
        Tokens live in src/theme/tokens.ts and src/theme/semantic.ts. Changing a value there changes
        the whole app, both schemes, in one edit.
      </Text>
    </Screen>
  );
}
