import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { CATEGORIES, PDF_TOOLS, searchTools, toolsIn } from '@/pdf/catalog';
import { isEngineAvailable } from '@/pdf/engine';
import { NoteBlock } from '@/pdf/components/ToolControls';
import { ToolTile } from '@/pdf/components/ToolTile';

/**
 * The Arena.
 *
 * A catalogue, not a dashboard: the tools are the content, grouped by what a
 * person is trying to do. The search box exists because twenty-one tiles is
 * just past the point where scanning beats knowing.
 */
export default function PdfArenaScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const engine = isEngineAvailable();

  const results = useMemo(() => (query.trim().length > 0 ? searchTools(query) : null), [query]);

  return (
    <Screen>
      <ScreenHeader title="PDF Arena" />

      <View style={{ gap: theme.space.sm, paddingTop: theme.space.lg, paddingBottom: theme.space.xl }}>
        <Text variant="display" serif>
          PDF Arena
        </Text>
        <Text variant="body" tone="secondary">
          {PDF_TOOLS.length} tools that work on the file in your hand. No account, no queue, no
          upload — the document never leaves this phone.
        </Text>
      </View>

      {!engine ? (
        <View style={{ paddingBottom: theme.space.lg }}>
          <NoteBlock text="This preview can show the tools but not process files. The installed Android app does the work on your phone." />
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
          paddingHorizontal: theme.space.lg,
          minHeight: theme.touchTarget,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find a tool"
          placeholderTextColor={theme.colors.textTertiary}
          selectionColor={theme.colors.accent}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Find a tool"
          style={{
            flex: 1,
            fontFamily: theme.fontFamily.sans,
            fontSize: theme.typography.body.fontSize,
            color: theme.colors.text,
            paddingVertical: theme.space.md,
          }}
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={theme.space.md}
            accessibilityRole="button"
            accessibilityLabel="Clear the search"
          >
            <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {results ? (
        <View style={{ paddingTop: theme.space.xl, gap: theme.space.lg }}>
          <Text variant="caption" tone="tertiary">
            {results.length === 1 ? '1 tool' : `${results.length} tools`}
          </Text>

          {results.length === 0 ? (
            <Card style={{ gap: theme.space.sm }}>
              <Text variant="headline">Nothing called “{query.trim()}”</Text>
              <Text variant="footnote" tone="tertiary">
                Try a plain word like merge, sign, compress, images or password.
              </Text>
            </Card>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md }}>
              {results.map((tool) => (
                <ToolTile
                  key={tool.id}
                  tool={tool}
                  onPress={() => router.push(`/pdf/${tool.id}`)}
                />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View>
          {CATEGORIES.map((category) => {
            const tools = toolsIn(category.id);

            return (
              <View key={category.id} style={{ paddingTop: theme.space.xl, gap: theme.space.md }}>
                <View style={{ gap: 2 }}>
                  <Text variant="title3">{category.id}</Text>
                  <Text variant="footnote" tone="tertiary">
                    {category.blurb}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md }}>
                  {tools.map((tool) => (
                    <ToolTile
                      key={tool.id}
                      tool={tool}
                      onPress={() => router.push(`/pdf/${tool.id}`)}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ paddingTop: theme.space['2xl'], gap: theme.space.xs }}>
        <Text variant="caption" tone="tertiary">
          Results are saved inside the app, then shared wherever you choose.
        </Text>
        <Text variant="caption" tone="tertiary">
          Originals are never changed. Every tool writes a new file.
        </Text>
      </View>
    </Screen>
  );
}
