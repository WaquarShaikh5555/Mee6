import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

export default function AuthLayout() {
  const theme = useTheme();
  const { status } = useAuth();

  // Someone already signed in has no business on the auth screens.
  if (status === 'signedIn') {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.canvas },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
