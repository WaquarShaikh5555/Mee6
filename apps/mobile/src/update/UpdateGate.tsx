import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { UpdateSheet } from './UpdateSheet';
import { useUpdate } from './useUpdate';
import { installedVersion, type UpdateInfo } from './version';

/** How long the app is left alone before it asks about an update. */
const SETTLE_MS = 1200;

/**
 * The update prompt, mounted once at the root.
 *
 * It waits until the app has finished opening (a prompt over a blank screen is
 * noise), then asks the feed. Everything else — the countdown, the download,
 * the one-time permission — lives in the sheet; this only decides *when*.
 *
 * When the person goes to Android's settings for the install permission and
 * comes back, the app is resumed rather than reopened, so the sheet notices and
 * carries on where it left off.
 */
export function UpdateGate() {
  const { check, phase, dismissed, start, later, grant, refreshPermission } = useUpdate();

  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [installed, setInstalled] = useState(() => installedVersion());
  const resumed = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => void check(), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [check]);

  // The offer arrives from the hook; keep the last one so the sheet can keep
  // showing it while a download, a permission step or a failure is in progress.
  useEffect(() => {
    if (phase.status === 'idle' || phase.status === 'checking') return;

    setInfo(phase.info);
    if (phase.status === 'available') setInstalled(phase.installed);
  }, [phase]);

  const onResume = useCallback(() => {
    if (!resumed.current) {
      resumed.current = true;
      return;
    }

    void refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') onResume();
    });

    return () => subscription.remove();
  }, [onResume]);

  const visible = !dismissed && phase.status !== 'idle' && phase.status !== 'checking' && info !== null;

  return (
    <UpdateSheet
      visible={visible}
      info={info}
      installed={installed}
      phase={phase}
      onLater={later}
      onUpdate={() => void start()}
      onGrant={grant}
    />
  );
}
