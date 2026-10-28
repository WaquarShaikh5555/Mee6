import { useCallback, useEffect, useRef, useState } from 'react';

import {
  canInstall,
  discardDownload,
  downloadUpdate,
  installUpdate,
  isUpdaterAvailable,
  openInstallSettings,
} from './updater';
import { UPDATE_FEED, installedVersion, isNewer, parseFeed, type UpdateInfo } from './version';

/**
 * Checking, downloading, installing.
 *
 * One hook, four states, and every transition reversible except the last: an
 * update that has been handed to Android cannot be taken back, so the UI stops
 * offering choices once `install` has started.
 */

export type UpdatePhase =
  | { status: 'idle' }
  /** Asked, waiting for the feed. Never shown. */
  | { status: 'checking' }
  | { status: 'available'; info: UpdateInfo; installed: string }
  | { status: 'downloading'; info: UpdateInfo; progress: number; received: number; total: number }
  /** Android wants its one-time permission before it will install anything. */
  | { status: 'permission'; info: UpdateInfo; download: string }
  | { status: 'installing'; info: UpdateInfo }
  | { status: 'failed'; info: UpdateInfo; message: string };

const FEED_TIMEOUT_MS = 8_000;

export function useUpdate() {
  const [phase, setPhase] = useState<UpdatePhase>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);
  const busy = useRef(false);
  const download = useRef<string | null>(null);

  const check = useCallback(async () => {
    if (!isUpdaterAvailable()) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

    try {
      const response = await fetch(UPDATE_FEED, {
        signal: controller.signal,
        // The feed is a tiny file that changes with every build; any cache at
        // all would hide an update for a day.
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!response.ok) return;

      const info = parseFeed(await response.json());
      if (!info) return;

      const installed = installedVersion();
      if (!isNewer(info.version, installed)) return;

      setPhase({ status: 'available', info, installed });
    } catch {
      // Offline, or the feed is not there yet: nothing to say, nothing to break.
    } finally {
      clearTimeout(timer);
    }
  }, []);

  /** The update flow proper. Re-entrant taps are ignored. */
  const start = useCallback(async () => {
    if (busy.current) return;
    const current = phase;
    if (current.status !== 'available' && current.status !== 'failed' && current.status !== 'permission') {
      return;
    }

    busy.current = true;
    const info = current.info;

    try {
      // Already downloaded once (the permission detour): go straight back to it.
      if (download.current) {
        await handOver(info);
        return;
      }

      setPhase({ status: 'downloading', info, progress: 0, received: 0, total: info.size });

      const file = await downloadUpdate(info.url, `shaikhs-${info.version}.apk`, (fraction, received, total) => {
        setPhase({ status: 'downloading', info, progress: fraction, received, total });
      });

      download.current = file.uri;
      await handOver(info);
    } catch (error) {
      setPhase({
        status: 'failed',
        info,
        message:
          error instanceof Error && error.message && error.message !== 'unavailable'
            ? error.message
            : 'The update could not be downloaded. Check the connection and try again.',
      });
    } finally {
      busy.current = false;
    }
  }, [phase]);

  /** Passes the downloaded APK to Android, or asks for the permission first. */
  async function handOver(info: UpdateInfo) {
    const file = download.current;
    if (!file) return;

    if (!(await canInstall())) {
      setPhase({ status: 'permission', info, download: file });
      return;
    }

    setPhase({ status: 'installing', info });

    const started = await installUpdate(file);

    if (!started) {
      setPhase({ status: 'permission', info, download: file });
    }
  }

  /** The one-time "allow installs from Shaikh's" step. */
  const grant = useCallback(() => {
    openInstallSettings();
  }, []);

  /** On returning from settings, carry on if the permission is now granted. */
  const refreshPermission = useCallback(async () => {
    if (phase.status !== 'permission') return;

    if (await canInstall()) {
      await start();
    }
  }, [phase, start]);

  const later = useCallback(() => {
    setDismissed(true);

    // A download that was never installed is 63 MB of nothing.
    if (download.current) {
      void discardDownload(download.current);
      download.current = null;
    }
  }, []);

  // Nothing to do once it is dismissed.
  useEffect(() => {
    if (dismissed && phase.status !== 'idle') setPhase({ status: 'idle' });
  }, [dismissed, phase.status]);

  return {
    /** Check once, quietly, a moment after the app is up. */
    check,
    phase,
    dismissed,
    start,
    later,
    grant,
    refreshPermission,
    /** True while something is happening that should stop a second tap. */
    busy: busy.current,
  };
}
