import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { PDF_TOOLS } from '@/pdf/catalog';
import { UNLOCK_HOURS, USING_TEST_ADS } from './config';
import { proToolCount } from './pro';
import { useUnlock } from './useUnlock';

/**
 * The one place money is asked for — and it asks with an ad, not a card.
 *
 * Three rules hold this together:
 *
 *  1. **It appears before any work.** In front of the tool, never after a file
 *     is chosen and processed. Finding a wall at the end of a task is the thing
 *     people never forgive.
 *  2. **There is always a way through, and it is free.** One ad buys two days.
 *     If no ad can be shown, the days are granted anyway.
 *  3. **"Not now" works.** It leaves the tool, not the app, and says what is
 *     still free — which is most of it.
 */
export function UnlockCard({
  toolName,
  onClose,
  onUnlocked,
}: {
  /** The tool that sent them here, for the headline. */
  toolName: string;
  onClose: () => void;
  onUnlocked?: () => void;
}) {
  const theme = useTheme();
  const { unlock, watching, problem, left, unlocked, ads } = useUnlock();

  const pro = PDF_TOOLS.filter((tool) => tool.pro);

  const watch = async () => {
    const result = await unlock();
    // `closed` means nothing changed; leave the card up so the button is still
    // there. Everything else — including "no ad available" — unlocked.
    if (result !== 'closed') onUnlocked?.();
  };

  if (unlocked && left) {
    return (
      <View style={{ gap: theme.space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
          <Text variant="headline">Unlocked</Text>
        </View>

        <Text variant="callout" tone="secondary">
          Every Pro tool is open until the window runs out — {left}. Nothing to do now.
        </Text>

        <Button label={`Back to ${toolName}`} onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
        <Badge label="PRO" tone="brass" />
        <Text variant="caption" tone="tertiary">
          {toolName} is one of {proToolCount()} occasional tools
        </Text>
      </View>

      <Text variant="display" serif>
        One ad, {UNLOCK_HOURS} hours
      </Text>

      <Text variant="callout" tone="secondary">
        Watch one short ad and every Pro tool opens for {UNLOCK_HOURS} hours. No subscription, no
        card, no account.
      </Text>

      <View style={{ gap: theme.space.sm }}>
        {pro.slice(0, 6).map((tool) => (
          <View key={tool.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <Ionicons name="checkmark" size={15} color={theme.colors.accent} />
            <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
              {tool.name}
              {tool.tagline ? ` — ${tool.tagline.toLowerCase()}` : ''}
            </Text>
          </View>
        ))}
        {pro.length > 6 ? (
          <Text variant="footnote" tone="tertiary">
            …and {pro.length - 6} more.
          </Text>
        ) : null}
      </View>

      <View
        style={{
          gap: theme.space.xs,
          padding: theme.space.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceSunken,
        }}
      >
        <Text variant="footnote" tone="secondary">
          <Text variant="footnote" style={{ color: theme.colors.text }}>
            Always free:{' '}
          </Text>
          merge, split, delete, rearrange, rotate, sign, compress, view and text out. Reading and
          finishing a document never costs anything.
        </Text>
      </View>

      {problem ? (
        <Text variant="footnote" tone={problem.startsWith('No ad') ? 'accent' : 'danger'}>
          {problem}
        </Text>
      ) : null}

      <View style={{ gap: theme.space.sm }}>
        <Button
          label={watching ? 'Loading the ad…' : `Watch an ad — ${UNLOCK_HOURS} hours free`}
          icon={watching ? undefined : 'play-circle-outline'}
          loading={watching}
          onPress={() => void watch()}
          disabled={watching}
        />

        <Button label="Not now" variant="secondary" onPress={onClose} disabled={watching} />
      </View>

      <Text variant="caption" tone="tertiary" align="center">
        {ads
          ? USING_TEST_ADS
            ? 'Test ad — this build earns nothing from it yet.'
            : 'The ad pays for the app. Nothing about your documents is sent anywhere.'
          : 'Ads are not available in this build, so this is free.'}
      </Text>
    </View>
  );
}

/** The little brass label on a Pro tile in the catalogue. */
export function ProBadge({ unlocked }: { unlocked: boolean }) {
  return <Badge label={unlocked ? 'PRO · OPEN' : 'PRO'} tone="brass" />;
}

/** A one-line explainer for the catalogue, so the split is never a surprise. */
export function ProNote() {
  const theme = useTheme();
  const { unlocked, left } = useUnlock();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
      <Ionicons
        name={unlocked ? 'checkmark-circle-outline' : 'information-circle-outline'}
        size={15}
        color={theme.colors.textTertiary}
      />
      <Text variant="caption" tone="tertiary" style={{ flex: 1 }}>
        {unlocked
          ? left
            ? `Pro tools are open — ${left}.`
            : 'Pro tools are open in this build.'
          : `PRO tools need one ad — ${UNLOCK_HOURS} hours each time. Everything else is free.`}
      </Text>
    </View>
  );
}

/** Kept for a loading state that never leaves a blank card. */
export function UnlockSpinner() {
  const theme = useTheme();
  return <ActivityIndicator size="small" color={theme.colors.accent} />;
}
