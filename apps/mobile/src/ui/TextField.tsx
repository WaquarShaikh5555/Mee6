import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, type ComponentRef } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Helper text under the field. Replaced by `error` when present. */
  hint?: string;
  error?: string | null;
  /** Trailing "forgot?" style action rendered beside the label. */
  labelAction?: { label: string; onPress: () => void };
  style?: TextStyle;
};

export function TextField({
  label,
  hint,
  error,
  labelAction,
  secureTextEntry,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isSecure = Boolean(secureTextEntry);
  const showError = Boolean(error);

  return (
    <View style={{ gap: theme.space.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <Text variant="subhead" tone="secondary">
          {label}
        </Text>
        {labelAction ? (
          <Pressable
            onPress={labelAction.onPress}
            hitSlop={theme.space.sm}
            accessibilityRole="link"
            accessibilityLabel={labelAction.label}
          >
            <Text variant="footnote" tone="accent">
              {labelAction.label}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={() => inputRef.current?.focus()}
        accessibilityRole="none"
        style={{
          minHeight: theme.touchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
          paddingHorizontal: theme.space.lg,
          borderRadius: theme.radius.md,
          borderWidth: 1.5,
          borderColor: showError
            ? theme.colors.danger
            : focused
              ? theme.colors.accent
              : theme.colors.border,
          backgroundColor: theme.colors.surface,
          ...(focused && !showError
            ? { shadowColor: theme.colors.focusRing, shadowOpacity: 1, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } }
            : null),
        }}
      >
        <TextInput
          ref={inputRef}
          {...rest}
          secureTextEntry={isSecure && !revealed}
          placeholderTextColor={theme.colors.textTertiary}
          selectionColor={theme.colors.accent}
          cursorColor={theme.colors.accent}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            {
              flex: 1,
              fontFamily: theme.fontFamily.sans,
              fontSize: theme.typography.body.fontSize,
              color: theme.colors.text,
              paddingVertical: theme.space.md,
            },
            style,
          ]}
        />
        {isSecure ? (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            hitSlop={theme.space.md}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.colors.textTertiary}
            />
          </Pressable>
        ) : null}
      </Pressable>

      {showError ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
