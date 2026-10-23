import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import {
  hasErrors,
  passwordStrength,
  validateSignUp,
  type FieldErrors,
} from '@/auth/validation';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';

const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const;

export default function SignUpScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signUp, isSubmitting, error, clearError } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const strength = passwordStrength(password);

  async function submit() {
    clearError();
    const errors = validateSignUp({ displayName, email, password });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    const ok = await signUp({ displayName, email, password });
    if (ok) {
      router.replace('/');
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Create account" />

      <View style={{ gap: theme.space.sm, paddingVertical: theme.space.xl }}>
        <Text variant="title2">Make it yours</Text>
        <Text variant="body" tone="secondary">
          One account, and your space is ready.
        </Text>
      </View>

      <View style={{ gap: theme.space.lg }}>
        <TextField
          label="Name"
          value={displayName}
          onChangeText={(value) => {
            setDisplayName(value);
            setFieldErrors((current) => ({ ...current, displayName: undefined }));
          }}
          error={fieldErrors.displayName}
          placeholder="What should we call you?"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
        />

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

        <View style={{ gap: theme.space.sm }}>
          <TextField
            label="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
            error={fieldErrors.password}
            placeholder="At least 8 characters"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
            hint="Mix letters and numbers. You can change it later."
          />

          {password.length > 0 ? (
            <View style={{ gap: theme.space.xs }}>
              <View style={{ flexDirection: 'row', gap: theme.space.xs }}>
                {[0, 1, 2, 3].map((step) => (
                  <View
                    key={step}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor:
                        step < strength
                          ? strength >= 3
                            ? theme.colors.success
                            : strength === 2
                              ? theme.colors.warning
                              : theme.colors.danger
                          : theme.colors.separator,
                    }}
                  />
                ))}
              </View>
              <Text variant="caption" tone="tertiary">
                {STRENGTH_LABELS[strength]}
              </Text>
            </View>
          ) : null}
        </View>

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

        <Button label="Create account" onPress={submit} loading={isSubmitting} />

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: theme.space.xs,
            paddingTop: theme.space.sm,
          }}
        >
          <Text variant="subhead" tone="secondary">
            Already have one?
          </Text>
          <Link href="/sign-in" replace>
            <Text variant="subhead" tone="accent">
              Sign in
            </Text>
          </Link>
        </View>

        <Text variant="caption" tone="tertiary" align="center">
          By creating an account you agree to the {''}
          <Link href="/legal/terms">
            <Text variant="caption" tone="accent">
              Terms of use
            </Text>
          </Link>{' '}
          and the{' '}
          <Link href="/legal/privacy">
            <Text variant="caption" tone="accent">
              Privacy policy
            </Text>
          </Link>
          .
        </Text>
      </View>
    </Screen>
  );
}
