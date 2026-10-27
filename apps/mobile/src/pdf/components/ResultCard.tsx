import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import type { PdfError } from '../engine';
import type { PdfResult } from '../engine';
import { formatBytes, formatDuration, formatSaving, mimeFor } from '../format';
import { shareFile } from '../useToolRun';

type ResultCardProps = {
  result: PdfResult;
  tookMs: number;
  /** The size of the source, so a saving can be stated rather than guessed. */
  beforeBytes?: number;
  onShare: () => void;
  onOpen?: () => void;
  onDone: () => void;
  /** Removes the file this tool just wrote. The input is never touched. */
  onDelete?: () => void;
};

const OPENABLE = new Set(['pdf']);
const PICTURE = /\.(png|jpe?g|webp)$/i;

/** The last segment of a file URI, decoded, for a share sheet's title. */
function fileNameOf(uri: string): string {
  const raw = uri.split('/').pop() ?? 'image.png';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * What happened, in the order a person cares: did it work, what did it make,
 * where is it. Warnings sit below the result, not above it.
 */
export function ResultCard({
  result,
  tookMs,
  beforeBytes = 0,
  onShare,
  onOpen,
  onDone,
  onDelete,
}: ResultCardProps) {
  const theme = useTheme();
  const [preview, setPreview] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const extension = result.outputName.split('.').pop()?.toLowerCase() ?? '';
  const saving = beforeBytes > 0 ? formatSaving(beforeBytes, result.sizeBytes) : null;

  // Pictures are shown, not described: a result of forty PNGs hiding in a ZIP
  // is exactly what "the extractor does not work" looked like.
  const pictures = result.outputUris.filter((uri) => PICTURE.test(uri));
  const words = typeof result.text === 'string' ? result.text.trim() : '';

  // A 400-page book is a megabyte of characters; laying all of it out to show
  // fourteen lines would make the screen stutter for nothing.
  const SHOWN = 40_000;
  const shown = words.slice(0, SHOWN);
  const truncated = words.length > SHOWN;

  return (
    <View
      style={{
        gap: theme.space.lg,
        padding: theme.space.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.successSubtle,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.successSubtle,
          }}
        >
          <Ionicons name="checkmark" size={22} color={theme.colors.success} />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline">{result.summary}</Text>
          <Text variant="footnote" tone="tertiary" tabular>
            {[formatBytes(result.sizeBytes), saving, formatDuration(tookMs)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
          paddingVertical: theme.space.sm,
          paddingHorizontal: theme.space.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceSunken,
        }}
      >
        <Ionicons
          name={extension === 'zip' ? 'archive-outline' : extension === 'txt' ? 'text-outline' : 'document-outline'}
          size={16}
          color={theme.colors.textSecondary}
        />
        <Text variant="footnote" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {result.outputName}
        </Text>
      </View>

      {pictures.length > 0 ? (
        <View style={{ gap: theme.space.sm }}>
          <Text variant="caption" tone="tertiary">
            {pictures.length === 1 ? '1 picture' : `${pictures.length} pictures`} · tap one to look closer
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.space.sm, paddingRight: theme.space.sm }}
          >
            {pictures.slice(0, 40).map((uri) => (
              <Pressable
                key={uri}
                onPress={() => setPreview(uri)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Open ${fileNameOf(uri)}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
              >
                <Image
                  source={{ uri }}
                  accessibilityIgnoresInvertColors
                  resizeMode="cover"
                  style={{
                    width: 104,
                    height: 136,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.surfaceSunken,
                    borderWidth: 1,
                    borderColor: theme.colors.separator,
                  }}
                />
              </Pressable>
            ))}
          </ScrollView>

          {pictures.length > 40 ? (
            <Text variant="caption" tone="tertiary">
              Showing the first 40. All {pictures.length} are saved and shareable.
            </Text>
          ) : null}
        </View>
      ) : null}

      {words.length > 0 ? (
        <View
          style={{
            gap: theme.space.sm,
            padding: theme.space.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceSunken,
          }}
        >
          <Text variant="caption" tone="tertiary">
            The text · long-press to copy
          </Text>
          <Text variant="footnote" selectable numberOfLines={expanded ? undefined : 14}>
            {shown}
          </Text>
          {truncated ? (
            <Text variant="caption" tone="tertiary">
              Showing the first {SHOWN.toLocaleString()} characters. Share the .txt for all of it.
            </Text>
          ) : null}
          {words.length > 700 ? (
            <Button
              label={expanded ? 'Show less' : 'Show all'}
              variant="ghost"
              size="md"
              onPress={() => setExpanded((current) => !current)}
              fullWidth={false}
            />
          ) : null}
        </View>
      ) : null}

      {result.warnings.length > 0 ? (
        <View style={{ gap: theme.space.xs }}>
          {result.warnings.map((warning) => (
            <Text key={warning} variant="footnote" tone="warning">
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.space.md }}>
        <Button
          label="Share"
          icon="share-outline"
          onPress={onShare}
          fullWidth={false}
          size="md"
          style={{ flex: 1 }}
        />
        {onOpen && OPENABLE.has(extension) ? (
          <Button
            label="Open"
            icon="eye-outline"
            variant="secondary"
            onPress={onOpen}
            fullWidth={false}
            size="md"
            style={{ flex: 1 }}
          />
        ) : null}
      </View>

      <Modal
        visible={preview !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(9, 13, 14, 0.96)' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.space.md,
              padding: theme.space.lg,
            }}
          >
            <Button
              label="Close"
              variant="ghost"
              size="md"
              fullWidth={false}
              onPress={() => setPreview(null)}
            />
            <Button
              label="Share"
              variant="secondary"
              size="md"
              icon="share-outline"
              fullWidth={false}
              onPress={() => {
                if (!preview) return;
                void shareFile(preview, fileNameOf(preview), mimeFor(fileNameOf(preview))).catch(() => {});
              }}
            />
          </View>

          {preview ? (
            <Image
              source={{ uri: preview }}
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              style={{ flex: 1, margin: theme.space.lg }}
            />
          ) : null}
        </View>
      </Modal>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.lg }}>
        <Button label="Done" variant="ghost" size="md" onPress={onDone} fullWidth={false} style={{ flex: 1 }} />
        {onDelete ? (
          <Button
            label="Delete"
            variant="destructive"
            size="md"
            icon="trash-outline"
            onPress={onDelete}
            fullWidth={false}
            accessibilityHint="Removes the file this tool made. The original document is not touched."
          />
        ) : null}
      </View>
    </View>
  );
}

/** A failure that says what to do next, not just what went wrong. */
export function ErrorCard({
  error,
  onDismiss,
  onRepair,
}: {
  error: PdfError;
  onDismiss: () => void;
  onRepair?: () => void;
}) {
  const theme = useTheme();

  const advice: Record<PdfError['code'], string> = {
    password: 'Check the password, then try again. Protect PDFs cannot be recovered without it.',
    corrupt: 'The file may be damaged. Repair can sometimes rebuild it.',
    range: 'Check the pages you asked for against the page count of the document.',
    unsupported: 'This document contains something PDF Arena does not handle yet.',
    'no-space': 'Free up space on the phone, then run it again.',
    unavailable: 'Install the app on an Android phone to process files.',
    unknown: 'Nothing was written. The original file is untouched.',
  };

  return (
    <View
      style={{
        gap: theme.space.md,
        padding: theme.space.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.danger,
        backgroundColor: theme.colors.dangerSubtle,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
        <Ionicons name="alert-circle" size={20} color={theme.colors.danger} />
        <Text variant="headline" tone="danger" style={{ flex: 1 }}>
          That did not work
        </Text>
      </View>

      <Text variant="callout" tone="danger">
        {error.message}
      </Text>
      <Text variant="footnote" style={{ color: theme.colors.danger, opacity: 0.9 }}>
        {advice[error.code]}
      </Text>

      <View style={{ flexDirection: 'row', gap: theme.space.lg }}>
        {error.code === 'corrupt' && onRepair ? (
          <Button
            label="Try Repair"
            icon="medkit-outline"
            variant="secondary"
            size="md"
            onPress={onRepair}
            fullWidth={false}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button
          label="Dismiss"
          variant="secondary"
          size="md"
          onPress={onDismiss}
          fullWidth={false}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
