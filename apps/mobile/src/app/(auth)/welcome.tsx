import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Wordmark } from '@/ui/Wordmark';
import { useTheme } from '@/theme/ThemeProvider';

export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { isDemoMode, isSubmitting, signInDemo } = useAuth();

  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'space-between' }}>
      <View style={{ gap: theme.space['2xl'], paddingTop: theme.space.xl }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <Wordmark size="md" />
          {isDemoMode ? <Badge label="Preview build" tone="brass" /> : null}
        </View>

        <View style={{ gap: theme.space.lg, paddingTop: theme.space.xl }}>
          <Text variant="title1" serif>
            A place for what matters to you.
          </Text>
          <Text variant="body" tone="secondary">
            Shaikh’s is being built carefully, one step at a time. Create your account now and
            you’ll be ready the moment the first features land.
          </Text>
        </View>
      </View>

      <View style={{ gap: theme.space.md, paddingTop: theme.space['2xl'] }}>
        <Button label="Create an account" onPress={() => router.push('/sign-up')} />
        <Button
          label="I already have an account"
          variant="secondary"
          onPress={() => router.push('/sign-in')}
        />
        <Button
          label="Look around with a demo account"
          variant="ghost"
          size="md"
          icon="person-circle-outline"
          loading={isSubmitting}
          onPress={async () => {
            const ok = await signInDemo();
            if (ok) router.replace('/');
          }}
        />
        {isDemoMode ? (
          <Text variant="caption" tone="tertiary" align="center" style={{ paddingTop: theme.space.sm }}>
            Preview build. Accounts are stored on this device only.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
