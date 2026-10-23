import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { RegainProvider } from '@/regain/RegainProvider';
import { ThemeProvider, useTheme, useThemeController } from '@/theme/ThemeProvider';
import { Text } from '@/ui/Text';
import { Wordmark } from '@/ui/Wordmark';

export { ErrorBoundary } from 'expo-router';

/** Branded holding state while the stored session and theme preference load. */
function Gate() {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space.xl,
        backgroundColor: theme.colors.canvas,
      }}
    >
      <Wordmark size="md" />
      <ActivityIndicator color={theme.colors.accent} />
      <Text variant="footnote" tone="tertiary">
        Opening your space
      </Text>
    </View>
  );
}

function RootNavigator() {
  const theme = useTheme();
  const { isReady } = useThemeController();
  const { status } = useAuth();

  if (!isReady || status === 'restoring') {
    return <Gate />;
  }

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(auth)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // Keeps the OS status/navigation bars in step with the theme on Android.
  useEffect(() => {
    void import('expo-system-ui').then((module) =>
      module.setBackgroundColorAsync('#0A0F0F').catch(() => {}),
    );
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <RegainProvider>
            <RootNavigator />
          </RegainProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
