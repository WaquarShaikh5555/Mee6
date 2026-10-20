import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

export default function AppLayout() {
  const theme = useTheme();
  const { status } = useAuth();

  if (status !== 'signedIn') {
    return <Redirect href="/welcome" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.canvas },
      }}
    >
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="design" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
