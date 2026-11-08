import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

type ScreenProps = {
  children: ReactNode;
  /** Wrap content in a ScrollView. Default true: forms must scroll under a keyboard. */
  scroll?: boolean;
  /** Horizontal gutter. `lg` (16) is the default for forms and lists. */
  gutter?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  edges?: readonly Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  /** Pins a footer above the safe area while the body scrolls. */
  footer?: ReactNode;
};

export function Screen({
  children,
  scroll = true,
  gutter = 'lg',
  edges = ['top', 'bottom'],
  contentStyle,
  footer,
}: ScreenProps) {
  const theme = useTheme();

  const gutterStyle: ViewStyle = {
    paddingHorizontal:
      gutter === 'none'
        ? 0
        : gutter === 'sm'
          ? theme.space.sm
          : gutter === 'md'
            ? theme.space.md
            : gutter === 'xl'
              ? theme.space.xl
              : theme.space.lg,
  };

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[gutterStyle, { paddingBottom: theme.space['2xl'] }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, gutterStyle, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.canvas }} edges={edges}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {body}
        {footer ? (
          <View
            style={[
              gutterStyle,
              {
                paddingTop: theme.space.md,
                paddingBottom: theme.space.sm,
                borderTopWidth: 1,
                borderTopColor: theme.colors.separator,
                backgroundColor: theme.colors.canvas,
              },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
