import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { validateSignIn, hasErrors, type FieldErrors } from '@/auth/validation';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn, isSubmitting, error, clearError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function submit() {
    clearError();
    const errors = validateSignIn({ email, password });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    const ok = await signIn({ email, password });
    if (ok) {
      router.replace('/');
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Sign in" />

      <View style={{ gap: theme.space.sm, paddingVertical: theme.space.xl }}>
        <Text variant="title2">Welcome back</Text>
        <Text variant="body" tone="secondary">
          Pick up where you left off.
        </Text>
      </View>

      <View style={{ gap: theme.space.lg }}>
        <TextField
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setFieldErrors((current) => ({ ...current, email: undefined }));
          }}
          error={fieldErrors.email}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />

        <TextField
          label="Password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
          error={fieldErrors.password}
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          labelAction={{
            label: 'Forgot?',
            onPress: () => router.push('/forgot-password'),
          }}
        />

        {error ? (
          <View
            style={{
              backgroundColor: theme.colors.dangerSubtle,
              borderRadius: theme.radius.md,
              padding: theme.space.md,
            }}
          >
            <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          </View>
        ) : null}

        <Button label="Sign in" onPress={submit} loading={isSubmitting} />

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: theme.space.xs,
            paddingTop: theme.space.sm,
          }}
        >
          <Text variant="subhead" tone="secondary">
            New here?
          </Text>
          <Link href="/sign-up" replace>
            <Text variant="subhead" tone="accent">
              Create an account
            </Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
