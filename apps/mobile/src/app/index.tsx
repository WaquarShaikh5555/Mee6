import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';

/**
 * Entry route. The auth state decides where the app opens; both groups also
 * guard themselves, so a deep link cannot bypass this.
 */
export default function Index() {
  const { status } = useAuth();

  if (status === 'signedIn') {
    return <Redirect href="/(app)" />;
  }
  return <Redirect href="/(auth)/welcome" />;
}
