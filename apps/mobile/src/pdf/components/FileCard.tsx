import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import type { PickedFile } from '../documents';
import { formatBytes } from '../format';

type FileCardProps = {
  file: PickedFile | null;
  /** "Document" for most tools, "Version A"/"Version B" for Compare. */
  label?: string;
  pageCount?: number;
  sizeBytes?: number;
  loading?: boolean;
  error?: string | null;
  needsPassword?: boolean;
  wrongPassword?: boolean;
  /** Shown on an empty card, e.g. "Choose the images". */
  emptyHint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onChoose: () => void;
  onClear?: () => void;
  onSubmitPassword?: (password: string) => void;
  /** A rendered first page, so the chosen file is recognisable at a glance. */
  thumbnail?: ReactNode;
  /** Opens the viewer on the chosen file. */
  onPreview?: () => void;
  extra?: ReactNode;
};

/**
 * The document slot.
 *
 * Empty, it is one large target that explains what to pick. Full, it is the
 * file's identity — name, page count, size — with a quiet way to change it. A
 * locked document asks for its password here rather than at the end of a run,
 * because that is when the person still has the file in mind.
 */
export function FileCard({
  file,
  label = 'Document',
  pageCount = 0,
  sizeBytes = 0,
  loading = false,
  error = null,
  needsPassword = false,
  wrongPassword = false,
  emptyHint = 'Choose a PDF from this phone',
  icon = 'document-text-outline',
  onChoose,
  onClear,
  onSubmitPassword,
  thumbnail,
  onPreview,
  extra,
}: FileCardProps) {
  const theme = useTheme();
  const [password, setPassword] = useState('');

  if (!file) {
    return (
      <View style={{ gap: theme.space.sm }}>
        {label !== 'Document' ? (
          <Text variant="caption" tone="tertiary">
            {label}
          </Text>
        ) : null}

        <Pressable
          onPress={onChoose}
          accessibilityRole="button"
          accessibilityLabel={emptyHint}
          style={({ pressed }) => ({
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.space.sm,
            paddingVertical: theme.space['2xl'],
            paddingHorizontal: theme.space.lg,
            borderRadius: theme.radius.lg,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: pressed ? theme.colors.accent : theme.colors.border,
            backgroundColor: pressed ? theme.colors.accentSubtle : theme.colors.surface,
          })}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: theme.radius.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accentSubtle,
            }}
          >
            <Ionicons name="add" size={24} color={theme.colors.onAccentSubtle} />
          </View>

          <Text variant="headline">{emptyHint}</Text>
          <Text variant="footnote" tone="tertiary" align="center">
            Stays on this phone. Nothing is uploaded.
          </Text>
        </Pressable>
      </View>
    );
  }

  const meta = [
    loading ? 'Reading…' : pageCount > 0 ? `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}` : null,
    sizeBytes > 0 ? formatBytes(sizeBytes) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={{
        gap: theme.space.md,
        padding: theme.space.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: error ? theme.colors.danger : theme.colors.separator,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
        {thumbnail ?? (
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: theme.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accentSubtle,
            }}
          >
            {loading ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Ionicons name={icon} size={20} color={theme.colors.onAccentSubtle} />
            )}
          </View>
        )}

        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" tone="tertiary">
            {label}
          </Text>
          <Text variant="subhead" numberOfLines={1}>
            {file.name}
          </Text>
          {meta.length > 0 ? (
            <Text variant="footnote" tone="tertiary" tabular>
              {meta}
            </Text>
          ) : null}
        </View>

        {onClear ? (
          <Pressable
            onPress={onClear}
            hitSlop={theme.space.md}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${file.name}`}
            style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}

      {needsPassword && onSubmitPassword ? (
        <View style={{ gap: theme.space.md }}>
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="The password for this file"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            error={wrongPassword ? 'That password does not open this document.' : null}
            hint="Used to open the file. Never stored."
            returnKeyType="go"
            onSubmitEditing={() => onSubmitPassword(password)}
          />
          <Button
            label="Open document"
            variant="secondary"
            size="md"
            icon="lock-open-outline"
            onPress={() => onSubmitPassword(password)}
            disabled={password.length === 0}
          />
        </View>
      ) : null}

      {extra}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.lg }}>
        {onPreview ? (
          <Pressable
            onPress={onPreview}
            accessibilityRole="button"
            accessibilityLabel={`Preview ${file.name}`}
            hitSlop={theme.space.sm}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Ionicons name="eye-outline" size={14} color={theme.colors.accent} />
            <Text variant="footnote" tone="accent">
              Preview
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onChoose}
          accessibilityRole="button"
          accessibilityLabel={`Change ${file.name}`}
          hitSlop={theme.space.sm}
        >
          <Text variant="footnote" tone="accent">
            Choose a different file
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
