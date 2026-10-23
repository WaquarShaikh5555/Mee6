import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useRegain } from '@/regain/RegainProvider';
import { ShieldMessage } from '@/regain/ShieldMessage';
import { findApp, findSection } from '@/regain/catalog';
import { Screen } from '@/ui/Screen';

/**
 * What a person sees when they reach a blocked surface.
 *
 * In a native build this same `ShieldMessage` renders as an overlay on top of
 * Instagram or YouTube. In the app it is a route, which also makes it possible
 * to look at — and test — before the native module exists.
 */
export default function BlockedScreen() {
  const router = useRouter();
  const { appId, sectionId } = useLocalSearchParams<{ appId?: string; sectionId?: string }>();
  const { setEnabled, todayCount, recordIntervention } = useRegain();

  const app = findApp(appId);
  const section = app ? findSection(app, sectionId) : undefined;

  // One count per arrival. The ref guards against a double effect in
  // development, where React intentionally runs effects twice.
  const counted = useRef(false);

  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    recordIntervention();
  }, [recordIntervention]);

  function dismiss() {
    if (router.canGoBack()) router.back();
    else router.replace('/regain');
  }

  return (
    <Screen scroll={false} gutter="xl">
      <ShieldMessage
        appName={app?.name ?? 'This app'}
        sectionName={section?.name ?? 'This screen'}
        todayCount={todayCount}
        onDismiss={dismiss}
        onDisable={() => {
          setEnabled(false);
          dismiss();
        }}
      />
    </Screen>
  );
}
