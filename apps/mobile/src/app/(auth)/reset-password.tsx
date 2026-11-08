import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { validatePassword } from '@/auth/validation';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Target of the link in the reset email: shaikhs://reset-password?token=…
 *
 * Expo Router maps that URL onto this route. The token is single-use and expires
 * after an hour; both failures arrive as the same message, because distinguishing
 * them would tell an attacker whether a token ever existed.
 */
export default function ResetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    token?: string;
    token_hash?: string;
    code?: string;
  }>();
  const { resetPassword, isSubmitting, error, clearError } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  // Supabase writes the one-time credential into whichever parameter its email
  // template uses; accept all of the documented shapes.
  const token = [params.token, params.token_hash, params.code]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? '';

  async function submit() {
    clearError();

    const invalid = validatePassword(password);
    if (invalid) {
      setFieldError(invalid);
      return;
    }
    if (password !== confirmation) {
      setFieldError('Those passwords do not match.');
      return;
    }

    setFieldError(undefined);
    const ok = await resetPassword(token, password);
    if (ok) setDone(true);
  }

  if (!token) {
    return (
      <Screen>
        <ScreenHeader title="Reset password" />
        <View style={{ gap: theme.space.lg, paddingTop: theme.space['2xl'] }}>
          <Text variant="title2">This link is incomplete</Text>
          <Text variant="body" tone="secondary">
            The reset link did not carry its one-time code — usually because an email client
            wrapped or truncated the line. Request a fresh one and open it from the inbox.
          </Text>
          <Button label="Request a new link" onPress={() => router.replace('/forgot-password')} />
        </View>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <ScreenHeader title="Reset password" />
        <View style={{ gap: theme.space.lg, paddingTop: theme.space['2xl'] }}>
          <Text variant="title2">Password updated</Text>
          <Text variant="body" tone="secondary">
            Every other device has been signed out. Sign in with your new password.
          </Text>
          <Button label="Sign in" onPress={() => router.replace('/sign-in')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Reset password" />

      <View style={{ gap: theme.space.sm, paddingVertical: theme.space.xl }}>
        <Text variant="title2">Choose a new password</Text>
        <Text variant="body" tone="secondary">
          Use at least 8 characters, with a letter and a number.
        </Text>
      </View>

      <View style={{ gap: theme.space.lg }}>
        <TextField
          label="New password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setFieldError(undefined);
          }}
          error={fieldError}
          placeholder="At least 8 characters"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
        />

        <TextField
          label="Confirm new password"
          value={confirmation}
          onChangeText={(value) => {
            setConfirmation(value);
            setFieldError(undefined);
          }}
          placeholder="Type it again"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
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

        <Button label="Set new password" onPress={submit} loading={isSubmitting} />
      </View>
    </Screen>
  );
}
