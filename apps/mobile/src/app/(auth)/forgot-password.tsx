import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { validateEmail } from '@/auth/validation';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { requestPasswordReset, isSubmitting, error, clearError, isDemoMode } = useAuth();

  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);

  async function submit() {
    clearError();
    const invalid = validateEmail(email);
    setFieldError(invalid);
    if (invalid) return;
    const ok = await requestPasswordReset(email);
    if (ok) setSent(true);
  }

  if (sent) {
    return (
      <Screen>
        <ScreenHeader title="Reset password" />
        <View
          style={{
            gap: theme.space.lg,
            paddingTop: theme.space['2xl'],
            alignItems: 'flex-start',
          }}
        >
          <Text variant="title2">Check your inbox</Text>
          <Text variant="body" tone="secondary">
            If an account exists for {email.trim()}, a reset link is on its way. The link expires in
            one hour.
          </Text>
          {isDemoMode ? (
            <Text variant="footnote" tone="tertiary">
              Preview build: no email is actually sent yet. Connecting a provider turns this on.
            </Text>
          ) : null}
          <Button label="Back to sign in" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Reset password" />

      <View style={{ gap: theme.space.sm, paddingVertical: theme.space.xl }}>
        <Text variant="title2">Forgot your password?</Text>
        <Text variant="body" tone="secondary">
          Enter the email you signed up with and we’ll send a link to choose a new one.
        </Text>
      </View>

      <View style={{ gap: theme.space.lg }}>
        <TextField
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setFieldError(undefined);
          }}
          error={fieldError}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={submit}
        />

        {error ? (
          <View
            style={{
              backgroundColor: theme.colors.dangerSubtle,
              borderRadius: theme.radius.md,
              padding: theme.space.md,
            }}
          >
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          </View>
        ) : null}

        <Button label="Send reset link" onPress={submit} loading={isSubmitting} />
      </View>
    </Screen>
  );
}
