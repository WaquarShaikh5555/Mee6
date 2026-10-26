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
      <Stack.Screen name="developer" />
      <Stack.Screen name="pdf/index" />
      <Stack.Screen name="pdf/[toolId]" />
      {/* A viewer is a place you enter and leave, not a page in the stack. */}
      <Stack.Screen name="pdf/viewer" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="regain/index" />
      <Stack.Screen name="regain/[appId]" />
      {/* Reaching a blocked screen should feel like a wall, not a page turn:
          no swipe-back gesture, no slide animation. */}
      <Stack.Screen
        name="regain/blocked"
        options={{ animation: 'fade', gestureEnabled: false }}
      />
    </Stack>
  );
}
