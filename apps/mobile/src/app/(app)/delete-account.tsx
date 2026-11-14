import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Divider } from '@/ui/Divider';
import { FadeIn } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';

/** The word somebody has to type. Not "yes", so it cannot be a mis-tap. */
const CONFIRM_WORD = 'DELETE';

/**
 * Deleting the account, from inside the app.
 *
 * This exists because a privacy policy that says "ask us to delete it" is not a
 * way to delete it. It is deliberately dull rather than dramatic: the screen
 * explains exactly what goes, requires the word DELETE to be typed, and does
 * nothing until then.
 *
 * The deletion itself is a database function with no parameters, so it can only
 * ever remove the account whose session called it. Everything that belongs to
 * the account cascades from that row.
 */
export default function DeleteAccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, deleteAccount, isSubmitting, error, clearError, isDemoMode } = useAuth();

  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  async function submit() {
    clearError();
    const ok = await deleteAccount();
    if (ok) setDone(true);
  }

  if (done) {
    return (
      <Screen>
        <ScreenHeader title="Delete account" back={false} />
        <FadeIn offset={8}>
          <View style={{ paddingTop: theme.space['2xl'], gap: theme.space.lg }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: theme.radius.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.sageSubtle,
              }}
            >
              <Ionicons name="checkmark" size={26} color={theme.colors.onSageSubtle} />
            </View>

            <Text variant="title2">Your account is gone</Text>
            <Text variant="body" tone="secondary">
              {isDemoMode
                ? 'The preview account was removed from this phone.'
                : 'The account, its email address and its profile are deleted from the server. Nothing was kept.'}
            </Text>
            <Text variant="footnote" tone="tertiary">
              Documents you made with PDF Arena are in your own Downloads, and Focus Mode's rules
              stay on this phone until you uninstall the app. Both are yours, so neither was touched.
            </Text>

            <Button label="Close" onPress={() => router.replace('/welcome')} />
          </View>
        </FadeIn>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Delete account" />

      <FadeIn offset={8}>
        <View style={{ gap: theme.space.sm, paddingTop: theme.space.xl }}>
          <Text variant="title1">Delete your account?</Text>
          <Text variant="body" tone="secondary">
            This is permanent. There is no way to undo it and nothing is kept for recovery.
          </Text>
        </View>
      </FadeIn>

      <FadeIn offset={10} delay={55} style={{ paddingTop: theme.space.xl }}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
              <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              <Text variant="subhead" tone="danger">
                What is deleted
              </Text>
            </View>
            <Text variant="footnote" tone="secondary">
              Your sign-in ({user?.email}), your display name, and the profile row that holds them.
              Nobody can sign in to this account again.
            </Text>
          </View>

          <Divider />

          <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
              <Ionicons name="phone-portrait-outline" size={18} color={theme.colors.lagoon} />
              <Text variant="subhead" tone="lagoon">
                What stays on your phone
              </Text>
            </View>
            <Text variant="footnote" tone="secondary">
              PDFs you made, and Focus Mode's rules and counts. They were never uploaded, so there
              is nothing for us to delete. Uninstalling the app removes them.
            </Text>
          </View>
        </Card>
      </FadeIn>

      <FadeIn offset={10} delay={110} style={{ paddingTop: theme.space.xl, gap: theme.space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Text variant="subhead" tone="secondary">
            Type {CONFIRM_WORD} to confirm
          </Text>
          {armed ? <Badge label="Ready" tone="danger" /> : null}
        </View>

        <TextField
          label="Confirmation"
          value={typed}
          onChangeText={(value) => setTyped(value)}
          placeholder={CONFIRM_WORD}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
          editable={!isSubmitting}
        />

        {error ? (
          <Text variant="footnote" tone="danger">
            {error}
          </Text>
        ) : null}

        <View style={{ paddingTop: theme.space.sm }}>
          <Button
            label={isSubmitting ? 'Deleting…' : 'Delete my account'}
            variant="destructive"
            onPress={() => void submit()}
            disabled={!armed || isSubmitting}
            loading={isSubmitting}
          />
        </View>

        <Button
          label="Keep my account"
          variant="ghost"
          onPress={() => router.back()}
          disabled={isSubmitting}
        />
      </FadeIn>
    </Screen>
  );
}
